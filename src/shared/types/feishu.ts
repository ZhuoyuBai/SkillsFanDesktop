/**
 * Feishu (飞书) Types - Configuration and Status
 *
 * Type definitions for Feishu bot integration via Channel abstraction.
 */

export interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  /** 6-digit pairing code for first-time authorization */
  pairingCode: string
  /** Authorized chat IDs (whitelist) */
  allowedChatIds: string[]
  /** Default space to route messages to */
  defaultSpaceId?: string
  /** Group message policy: 'mention' = respond only when @bot, 'all' = respond to all, 'disabled' = ignore groups */
  groupPolicy: 'mention' | 'all' | 'disabled'
}

export interface FeishuSessionMapping {
  chatId: string
  chatType: 'p2p' | 'group'
  chatName: string
  spaceId: string
  conversationId: string
  /** Feishu user open_id */
  openId?: string
  pairedAt: number
  lastMessageAt: number
}

export interface FeishuStatus {
  enabled: boolean
  connected: boolean
  botName?: string
  activeSessions: number
  error?: string
}
