/**
 * Electron IPC Channel Adapter
 *
 * Handles communication with the Electron renderer process via IPC.
 * Normalizes AgentRequest into NormalizedInboundMessage and dispatches
 * outbound events via mainWindow.webContents.send().
 */

import type { BrowserWindow } from 'electron'
import type { Channel } from '../channel.interface'
import type { NormalizedInboundMessage, NormalizedOutboundEvent, NormalizedAttachment } from '@shared/types/channel'
import type { AgentRequest, MainWindowRef } from '../../agent/types'
import { formatCanvasContext } from '../../agent/message-utils'

export class ElectronChannel implements Channel {
  readonly id = 'electron'
  readonly name = 'Electron IPC'
  private mainWindow: MainWindowRef = null
  private messageHandler: ((msg: NormalizedInboundMessage) => void) | null = null

  async initialize(): Promise<void> {
    // IPC handlers are registered separately via registerAgentHandlers.
    // This adapter wraps the dispatch side.
  }

  setMainWindow(window: MainWindowRef): void {
    this.mainWindow = window
  }

  /**
   * Get current main window reference.
   * Returns null when unavailable or already destroyed.
   */
  getMainWindow(): MainWindowRef {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null
    }
    return this.mainWindow
  }

  /**
   * Normalize an IPC AgentRequest into NormalizedInboundMessage.
   */
  normalizeInbound(request: AgentRequest): NormalizedInboundMessage {
    const canvasPrefix = formatCanvasContext(request.canvasContext)

    // Merge legacy images into attachments
    const attachments: NormalizedAttachment[] = []
    if (request.images) {
      for (const img of request.images) {
        attachments.push({ ...img })
      }
    }
    if (request.attachments) {
      for (const att of request.attachments) {
        attachments.push({ ...att } as NormalizedAttachment)
      }
    }

    const prefixParts = [request.messagePrefix, canvasPrefix].filter(Boolean)

    return {
      id: `electron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: 'electron',
      clientId: 'main-window',
      spaceId: request.spaceId,
      conversationId: request.conversationId,
      text: request.message,
      textPrefix: prefixParts.length > 0 ? prefixParts.join('\n\n') : undefined,
      resumeSessionId: request.resumeSessionId,
      attachments: attachments.length > 0 ? attachments : undefined,
      model: {
        name: request.model,
        source: request.modelSource,
        thinkingEffort: request.thinkingEffort || (request.thinkingEnabled ? 'high' : undefined)
      },
      features: {
        aiBrowser: request.aiBrowserEnabled
      },
      channelMeta: {
        canvasContext: request.canvasContext,
        ralphMode: request.ralphMode
      },
      timestamp: Date.now()
    }
  }

  dispatch(event: NormalizedOutboundEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // Send flat event data for backward compatibility with existing renderer listeners
    this.mainWindow.webContents.send(event.type, event.payload)
    console.log(`[ElectronChannel] Sent: ${event.type}`, JSON.stringify(event.payload).substring(0, 200))
  }

  dispatchGlobal(channel: string, data: Record<string, unknown>): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(channel, data)
  }

  onMessage(handler: (msg: NormalizedInboundMessage) => void): void {
    this.messageHandler = handler
  }

  /** Called by IPC handler to feed messages into the channel (for future Phase 3) */
  handleIncoming(request: AgentRequest): void {
    if (this.messageHandler) {
      this.messageHandler(this.normalizeInbound(request))
    }
  }

  async shutdown(): Promise<void> {
    this.mainWindow = null
    this.messageHandler = null
  }
}
