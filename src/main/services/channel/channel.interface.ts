/**
 * Channel Interface - Communication Endpoint Abstraction
 *
 * Each channel represents a communication transport (Electron IPC, WebSocket, Telegram, etc.).
 * Channels normalize inbound messages and dispatch outbound events in their native format.
 */

import type { NormalizedInboundMessage, NormalizedOutboundEvent } from '@shared/types/channel'

/**
 * A Channel represents a communication endpoint.
 * Each channel knows how to receive messages from and send events to its clients.
 */
export interface Channel {
  /** Unique channel identifier (e.g., 'electron', 'remote-web', 'telegram') */
  readonly id: string
  /** Human-readable name */
  readonly name: string

  /** Initialize the channel. Called during bootstrap. */
  initialize(): Promise<void>

  /**
   * Dispatch an outbound event to this channel's clients.
   * The channel decides how to deliver it (IPC, WebSocket, HTTP webhook, etc.)
   */
  dispatch(event: NormalizedOutboundEvent): void

  /**
   * Dispatch a global (non-conversation-scoped) event to all clients.
   * Used for events like MCP status that aren't tied to a specific conversation.
   */
  dispatchGlobal(channel: string, data: Record<string, unknown>): void

  /**
   * Register a handler for inbound messages from this channel.
   * The ChannelManager calls this to wire up the message router.
   */
  onMessage(handler: (message: NormalizedInboundMessage) => void): void

  /** Shutdown the channel gracefully. */
  shutdown(): Promise<void>
}
