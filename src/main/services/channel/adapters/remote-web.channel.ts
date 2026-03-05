/**
 * Remote Web Channel Adapter
 *
 * Handles communication with remote browser clients via HTTP/WebSocket.
 * Dispatches outbound events via the existing broadcastToWebSocket infrastructure,
 * preserving throttling, slow consumer detection, and send strategies.
 */

import type { Channel } from '../channel.interface'
import type { NormalizedInboundMessage, NormalizedOutboundEvent } from '@shared/types/channel'
import { broadcastToWebSocket, broadcastToAll } from '../../../http/websocket'

export class RemoteWebChannel implements Channel {
  readonly id = 'remote-web'
  readonly name = 'Remote Web (HTTP/WS)'
  private messageHandler: ((msg: NormalizedInboundMessage) => void) | null = null

  async initialize(): Promise<void> {
    // WebSocket server is initialized elsewhere (remote.service.ts).
    // This adapter wraps the broadcast side.
  }

  dispatch(event: NormalizedOutboundEvent): void {
    try {
      // Reuse existing WebSocket broadcast infrastructure with all its
      // throttling, slow consumer detection, and send strategies
      broadcastToWebSocket(event.type, event.payload as Record<string, unknown>)
    } catch {
      // WebSocket module might not be initialized yet, ignore
    }
  }

  dispatchGlobal(channel: string, data: Record<string, unknown>): void {
    try {
      broadcastToAll(channel, data)
    } catch {
      // WebSocket module might not be initialized yet, ignore
    }
  }

  onMessage(handler: (msg: NormalizedInboundMessage) => void): void {
    this.messageHandler = handler
  }

  async shutdown(): Promise<void> {
    this.messageHandler = null
  }
}
