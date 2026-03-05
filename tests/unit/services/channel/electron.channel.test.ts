/**
 * ElectronChannel Unit Tests
 *
 * Tests the Electron IPC channel adapter's normalization and dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElectronChannel } from '@main/services/channel/adapters/electron.channel'
import type { AgentRequest, CanvasContext } from '@main/services/agent/types'

// Mock formatCanvasContext
vi.mock('@main/services/agent/message-utils', () => ({
  formatCanvasContext: vi.fn((ctx?: CanvasContext) => {
    if (!ctx?.isOpen || ctx.tabCount === 0) return ''
    return '<halo_canvas>mock canvas</halo_canvas>\n\n'
  })
}))

describe('ElectronChannel', () => {
  let channel: ElectronChannel

  beforeEach(() => {
    channel = new ElectronChannel()
  })

  describe('properties', () => {
    it('should have correct id and name', () => {
      expect(channel.id).toBe('electron')
      expect(channel.name).toBe('Electron IPC')
    })
  })

  describe('normalizeInbound', () => {
    it('should normalize a basic AgentRequest', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Hello world'
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.channelId).toBe('electron')
      expect(normalized.clientId).toBe('main-window')
      expect(normalized.spaceId).toBe('space-1')
      expect(normalized.conversationId).toBe('conv-1')
      expect(normalized.text).toBe('Hello world')
      expect(normalized.attachments).toBeUndefined()
      expect(normalized.textPrefix).toBeUndefined()
      expect(normalized.timestamp).toBeGreaterThan(0)
    })

    it('should merge images and attachments', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        images: [{
          id: 'img-1',
          type: 'image',
          mediaType: 'image/png',
          data: 'base64data'
        }],
        attachments: [{
          id: 'pdf-1',
          type: 'pdf',
          mediaType: 'application/pdf',
          data: 'pdfdata',
          name: 'doc.pdf',
          size: 1024
        }]
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.attachments).toHaveLength(2)
      expect(normalized.attachments![0].type).toBe('image')
      expect(normalized.attachments![1].type).toBe('pdf')
    })

    it('should convert canvasContext to textPrefix', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        canvasContext: {
          isOpen: true,
          tabCount: 1,
          activeTab: { type: 'code', title: 'test.ts' },
          tabs: [{ type: 'code', title: 'test.ts', isActive: true }]
        }
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.textPrefix).toContain('halo_canvas')
      expect(normalized.channelMeta?.canvasContext).toBeDefined()
    })

    it('should combine messagePrefix and canvasContext', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        messagePrefix: 'INSTRUCTION: do X',
        canvasContext: {
          isOpen: true,
          tabCount: 1,
          activeTab: { type: 'code', title: 'test.ts' },
          tabs: [{ type: 'code', title: 'test.ts', isActive: true }]
        }
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.textPrefix).toContain('INSTRUCTION: do X')
      expect(normalized.textPrefix).toContain('halo_canvas')
    })

    it('should map model and feature fields', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        model: 'claude-opus-4-5-20251101',
        modelSource: 'skillsfan-credits',
        thinkingEffort: 'high',
        aiBrowserEnabled: true
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.model).toEqual({
        name: 'claude-opus-4-5-20251101',
        source: 'skillsfan-credits',
        thinkingEffort: 'high'
      })
      expect(normalized.features).toEqual({ aiBrowser: true })
    })

    it('should fall back thinkingEnabled to thinkingEffort', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        thinkingEnabled: true
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.model?.thinkingEffort).toBe('high')
    })

    it('should preserve ralphMode in channelMeta', () => {
      const request: AgentRequest = {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'test',
        ralphMode: {
          enabled: true,
          projectDir: '/path/to/project'
        }
      }

      const normalized = channel.normalizeInbound(request)

      expect(normalized.channelMeta?.ralphMode).toEqual({
        enabled: true,
        projectDir: '/path/to/project'
      })
    })
  })

  describe('dispatch', () => {
    it('should send event via mainWindow IPC', () => {
      const mockSend = vi.fn()
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: mockSend }
      } as any

      channel.setMainWindow(mockWindow)

      channel.dispatch({
        type: 'agent:message',
        spaceId: 'space-1',
        conversationId: 'conv-1',
        payload: { type: 'message', content: 'hello', spaceId: 'space-1', conversationId: 'conv-1' },
        timestamp: Date.now()
      })

      expect(mockSend).toHaveBeenCalledWith('agent:message', {
        type: 'message',
        content: 'hello',
        spaceId: 'space-1',
        conversationId: 'conv-1'
      })
    })

    it('should not send if mainWindow is null', () => {
      channel.setMainWindow(null)

      // Should not throw
      channel.dispatch({
        type: 'agent:message',
        spaceId: 'space-1',
        conversationId: 'conv-1',
        payload: {},
        timestamp: Date.now()
      })
    })

    it('should not send if mainWindow is destroyed', () => {
      const mockSend = vi.fn()
      const mockWindow = {
        isDestroyed: () => true,
        webContents: { send: mockSend }
      } as any

      channel.setMainWindow(mockWindow)

      channel.dispatch({
        type: 'agent:message',
        spaceId: 'space-1',
        conversationId: 'conv-1',
        payload: {},
        timestamp: Date.now()
      })

      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('dispatchGlobal', () => {
    it('should send global event via mainWindow IPC', () => {
      const mockSend = vi.fn()
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: mockSend }
      } as any

      channel.setMainWindow(mockWindow)

      channel.dispatchGlobal('agent:mcp-status', { servers: [] })

      expect(mockSend).toHaveBeenCalledWith('agent:mcp-status', { servers: [] })
    })
  })

  describe('onMessage / handleIncoming', () => {
    it('should normalize and forward incoming messages', () => {
      const handler = vi.fn()
      channel.onMessage(handler)

      channel.handleIncoming({
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Hello'
      })

      expect(handler).toHaveBeenCalledTimes(1)
      const normalized = handler.mock.calls[0][0]
      expect(normalized.channelId).toBe('electron')
      expect(normalized.text).toBe('Hello')
    })

    it('should not forward if no handler registered', () => {
      // Should not throw
      channel.handleIncoming({
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Hello'
      })
    })
  })

  describe('shutdown', () => {
    it('should clear references', async () => {
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      } as any

      channel.setMainWindow(mockWindow)
      const handler = vi.fn()
      channel.onMessage(handler)

      await channel.shutdown()

      // After shutdown, dispatch should be a no-op
      channel.dispatch({
        type: 'agent:message',
        spaceId: 'space-1',
        conversationId: 'conv-1',
        payload: {},
        timestamp: Date.now()
      })

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })
  })
})
