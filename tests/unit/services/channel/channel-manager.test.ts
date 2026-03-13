/**
 * ChannelManager Unit Tests
 *
 * Tests the central message router and event dispatcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelManager, createOutboundEvent } from '@main/services/channel/channel-manager'
import type { Channel } from '@main/services/channel/channel.interface'
import type { NormalizedOutboundEvent } from '@shared/types/channel'
import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  createGatewaySession
} from '../../../../src/gateway/sessions'

function createMockChannel(id: string): Channel {
  return {
    id,
    name: `Mock ${id}`,
    initialize: vi.fn().mockResolvedValue(undefined),
    dispatch: vi.fn(),
    dispatchGlobal: vi.fn(),
    onMessage: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }
}

function createTestEvent(conversationId = 'conv-1'): NormalizedOutboundEvent {
  return {
    type: 'agent:message',
    spaceId: 'space-1',
    conversationId,
    payload: { type: 'message', content: 'hello', isComplete: false, spaceId: 'space-1', conversationId },
    timestamp: Date.now()
  }
}

describe('ChannelManager', () => {
  let manager: ChannelManager

  beforeEach(() => {
    manager = new ChannelManager()
    clearGatewaySessionStoreForTests()
  })

  describe('registerChannel', () => {
    it('should register a channel', () => {
      const ch = createMockChannel('test')
      manager.registerChannel(ch)
      expect(manager.getChannel('test')).toBe(ch)
    })

    it('should list registered channel IDs', () => {
      manager.registerChannel(createMockChannel('a'))
      manager.registerChannel(createMockChannel('b'))
      expect(manager.getChannelIds()).toEqual(['a', 'b'])
    })
  })

  describe('dispatchEvent', () => {
    it('should broadcast to all channels when no conversation tracking', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      const event = createTestEvent()
      manager.dispatchEvent(event)

      expect(ch1.dispatch).toHaveBeenCalledWith(event)
      expect(ch2.dispatch).toHaveBeenCalledWith(event)
    })

    it('should only dispatch to tracked channels for a conversation', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      // Only ch1 is tracking conv-1
      manager.trackConversation('conv-1', 'ch1')

      const event = createTestEvent('conv-1')
      manager.dispatchEvent(event)

      expect(ch1.dispatch).toHaveBeenCalledWith(event)
      expect(ch2.dispatch).not.toHaveBeenCalled()
    })

    it('should dispatch to multiple tracked channels', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      manager.trackConversation('conv-1', 'ch1')
      manager.trackConversation('conv-1', 'ch2')

      const event = createTestEvent('conv-1')
      manager.dispatchEvent(event)

      expect(ch1.dispatch).toHaveBeenCalledWith(event)
      expect(ch2.dispatch).toHaveBeenCalledWith(event)
    })

    it('should not dispatch to unregistered channel IDs in tracking', () => {
      const ch1 = createMockChannel('ch1')
      manager.registerChannel(ch1)

      // Track a non-existent channel
      manager.trackConversation('conv-1', 'ch1')
      manager.trackConversation('conv-1', 'ghost')

      const event = createTestEvent('conv-1')
      manager.dispatchEvent(event)

      expect(ch1.dispatch).toHaveBeenCalledWith(event)
    })

    it('should route via tracked gateway session when event carries a session key', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      const route = resolveRoute({
        workspaceId: 'space-1',
        conversationId: 'conv-1'
      })
      createGatewaySession(route, { status: 'active' })
      manager.trackSession(route.sessionKey, 'ch2')

      const event = createTestEvent('conv-1')
      event.sessionKey = route.sessionKey
      event.mainSessionKey = route.mainSessionKey

      manager.dispatchEvent(event)

      expect(ch1.dispatch).not.toHaveBeenCalled()
      expect(ch2.dispatch).toHaveBeenCalledWith(event)
    })

    it('should inherit session interest when a tracked conversation already has gateway sessions', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      const route = resolveRoute({
        workspaceId: 'space-1',
        conversationId: 'conv-1'
      })
      createGatewaySession(route, { status: 'active' })
      manager.trackConversation('conv-1', 'ch1')

      const event = createTestEvent('conv-1')
      event.sessionKey = route.sessionKey

      manager.dispatchEvent(event)

      expect(ch1.dispatch).toHaveBeenCalledWith(event)
      expect(ch2.dispatch).not.toHaveBeenCalled()
    })
  })

  describe('dispatchGlobal', () => {
    it('should dispatch global event to all channels', () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      const data = { servers: [], timestamp: 123 }
      manager.dispatchGlobal('agent:mcp-status', data)

      expect(ch1.dispatchGlobal).toHaveBeenCalledWith('agent:mcp-status', data)
      expect(ch2.dispatchGlobal).toHaveBeenCalledWith('agent:mcp-status', data)
    })
  })

  describe('shutdown', () => {
    it('should shutdown all channels and clear state', async () => {
      const ch1 = createMockChannel('ch1')
      const ch2 = createMockChannel('ch2')
      manager.registerChannel(ch1)
      manager.registerChannel(ch2)

      await manager.shutdown()

      expect(ch1.shutdown).toHaveBeenCalled()
      expect(ch2.shutdown).toHaveBeenCalled()
      expect(manager.getChannelIds()).toEqual([])
    })
  })
})

describe('createOutboundEvent', () => {
  it('should create event with correct structure', () => {
    const event = createOutboundEvent(
      'agent:message',
      'space-1',
      'conv-1',
      { type: 'message', content: 'hello' }
    )

    expect(event.type).toBe('agent:message')
    expect(event.spaceId).toBe('space-1')
    expect(event.conversationId).toBe('conv-1')
    expect(event.payload).toEqual({
      type: 'message',
      content: 'hello',
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })
    expect(event.timestamp).toBeGreaterThan(0)
  })

  it('should enrich events with gateway session identifiers when available', () => {
    const route = resolveRoute({
      workspaceId: 'space-1',
      conversationId: 'conv-1'
    })
    createGatewaySession(route, {
      status: 'active'
    })

    const event = createOutboundEvent(
      'agent:message',
      'space-1',
      'conv-1',
      { type: 'message', content: 'hello' }
    )

    expect(event.sessionKey).toBe(route.sessionKey)
    expect(event.mainSessionKey).toBe(route.mainSessionKey)
    expect(event.payload).toEqual({
      type: 'message',
      content: 'hello',
      spaceId: 'space-1',
      conversationId: 'conv-1',
      sessionKey: route.sessionKey,
      mainSessionKey: route.mainSessionKey
    })
  })
})
