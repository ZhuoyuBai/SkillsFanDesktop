/**
 * ChannelManager - Central Message Router & Event Dispatcher
 *
 * Routes inbound messages from any channel to the agent service,
 * and dispatches outbound agent events to the correct channel(s).
 *
 * This replaces the hardcoded IPC + WebSocket dispatch in sendToRenderer().
 */

import type { Channel } from './channel.interface'
import type { NormalizedOutboundEvent, OutboundEventType } from '@shared/types/channel'
import {
  findGatewaySessionsByConversationId,
  findPreferredGatewaySessionByConversationId
} from '../../../gateway/sessions'

// These channels should always receive conversation events so local/remote UI state
// stays in sync even when a conversation is owned by another channel (e.g. Feishu).
const ALWAYS_DISPATCH_CHANNELS = ['electron', 'remote-web'] as const

export class ChannelManager {
  private channels = new Map<string, Channel>()
  /**
   * Tracks which channels have active clients for each conversation.
   * During Phase 3 migration this remains the backward-compatible routing index.
   */
  private conversationChannelMap = new Map<string, Set<string>>()
  /**
   * Tracks which channels are interested in a gateway platform session.
   * This lets channel routing start following sessionKey without breaking
   * legacy conversationId-based consumers.
   */
  private sessionChannelMap = new Map<string, Set<string>>()

  private trackKey(map: Map<string, Set<string>>, key: string, channelId: string): void {
    if (!map.has(key)) {
      map.set(key, new Set())
    }
    map.get(key)!.add(channelId)
  }

  private collectMappedChannels(map: Map<string, Set<string>>, key?: string): Set<string> {
    if (!key) {
      return new Set()
    }

    return new Set(map.get(key) || [])
  }

  private resolveInterestedChannels(event: NormalizedOutboundEvent): Set<string> {
    const interested = this.collectMappedChannels(this.conversationChannelMap, event.conversationId)
    const sessionKeys = new Set<string>()

    if (event.sessionKey) {
      sessionKeys.add(event.sessionKey)
    }

    for (const session of findGatewaySessionsByConversationId(event.conversationId)) {
      sessionKeys.add(session.sessionKey)
    }

    for (const sessionKey of sessionKeys) {
      for (const channelId of this.collectMappedChannels(this.sessionChannelMap, sessionKey)) {
        interested.add(channelId)
      }
    }

    return interested
  }

  /**
   * Register a channel adapter.
   */
  registerChannel(channel: Channel): void {
    this.channels.set(channel.id, channel)
    console.log(`[ChannelManager] Registered channel: ${channel.id} (${channel.name})`)
  }

  /**
   * Track that a channel is interested in events for a conversation.
   * Called when a message comes in from a channel, or when a client subscribes.
   */
  trackConversation(conversationId: string, channelId: string): void {
    this.trackKey(this.conversationChannelMap, conversationId, channelId)

    for (const session of findGatewaySessionsByConversationId(conversationId)) {
      this.trackSession(session.sessionKey, channelId)
    }
  }

  /**
   * Track that a channel is interested in a gateway platform session.
   * This is the bridge path while we migrate off conversation-scoped routing.
   */
  trackSession(sessionKey: string, channelId: string): void {
    this.trackKey(this.sessionChannelMap, sessionKey, channelId)
  }

  /**
   * Dispatch an outbound event to all interested channels.
   * This is the drop-in replacement for sendToRenderer().
   * During migration it resolves interest from both conversationId and sessionKey.
   */
  dispatchEvent(event: NormalizedOutboundEvent): void {
    const interestedChannels = this.resolveInterestedChannels(event)

    if (interestedChannels && interestedChannels.size > 0) {
      // Keep routed delivery for channel-specific outputs (e.g. Feishu), but always
      // include renderer/web channels so conversation lists and states stay updated.
      const targetChannelIds = new Set(interestedChannels)
      for (const channelId of ALWAYS_DISPATCH_CHANNELS) {
        if (this.channels.has(channelId)) {
          targetChannelIds.add(channelId)
        }
      }

      for (const channelId of targetChannelIds) {
        const channel = this.channels.get(channelId)
        if (channel) {
          channel.dispatch(event)
        }
      }
    } else {
      // No explicit mapping: broadcast to all channels (backward-compatible behavior)
      for (const channel of this.channels.values()) {
        channel.dispatch(event)
      }
    }
  }

  /**
   * Dispatch a global event (not conversation-scoped) to all channels.
   * Used for events like MCP status, remote status changes, etc.
   */
  dispatchGlobal(channel: string, data: Record<string, unknown>): void {
    for (const ch of this.channels.values()) {
      ch.dispatchGlobal(channel, data)
    }
  }

  /**
   * Get a registered channel by ID.
   */
  getChannel<T extends Channel>(id: string): T | undefined {
    return this.channels.get(id) as T | undefined
  }

  /**
   * Get all registered channel IDs.
   */
  getChannelIds(): string[] {
    return Array.from(this.channels.keys())
  }

  /**
   * Shutdown all channels gracefully.
   */
  async shutdown(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.shutdown()
    }
    this.channels.clear()
    this.conversationChannelMap.clear()
    this.sessionChannelMap.clear()
    console.log('[ChannelManager] All channels shut down')
  }
}

// ============================================
// Singleton
// ============================================

let channelManager: ChannelManager | null = null

export function getChannelManager(): ChannelManager {
  if (!channelManager) {
    channelManager = new ChannelManager()
  }
  return channelManager
}

/**
 * Helper: create a NormalizedOutboundEvent from the current sendToRenderer signature.
 * Useful during migration to avoid changing all call sites.
 */
export function createOutboundEvent(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): NormalizedOutboundEvent {
  const preferredSession = findPreferredGatewaySessionByConversationId(conversationId, {
    workspaceId: spaceId
  })
  const sessionKey = typeof data.sessionKey === 'string'
    ? data.sessionKey
    : preferredSession?.sessionKey
  const mainSessionKey = typeof data.mainSessionKey === 'string'
    ? data.mainSessionKey
    : preferredSession?.mainSessionKey

  return {
    type: channel as OutboundEventType,
    spaceId,
    conversationId,
    sessionKey,
    mainSessionKey,
    payload: {
      ...data,
      spaceId,
      conversationId,
      ...(sessionKey ? { sessionKey } : {}),
      ...(mainSessionKey ? { mainSessionKey } : {})
    },
    timestamp: Date.now()
  }
}
