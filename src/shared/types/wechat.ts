/**
 * WeChat Types - Configuration and Status
 *
 * Type definitions for WeChat personal account integration via iLink Bot API.
 * Uses Tencent's official iLink API (ilinkai.weixin.qq.com) for message relay.
 */

export interface WeChatConfig {
  enabled: boolean
  /** 6-digit pairing code for first-time authorization */
  pairingCode: string
  /** Authorized user IDs (whitelist) */
  allowedUserIds: string[]
  /** Default space to route messages to */
  defaultSpaceId?: string
}

export interface WeChatAccount {
  /** Bot token from QR code login */
  botToken: string
  /** Account-specific API base URL returned by iLink login */
  baseUrl?: string
  /** WeChat nickname (if available) */
  nickname?: string
  /** Login timestamp */
  loggedInAt: number
}

export interface WeChatSessionMapping {
  /** WeChat user ID (xxx@im.wechat) */
  fromUserId: string
  /** Display name (if available) */
  displayName?: string
  spaceId: string
  conversationId: string
  pairedAt: number
  lastMessageAt: number
  /** Latest context_token for replying */
  contextToken: string
}

export interface WeChatStatus {
  enabled: boolean
  connected: boolean
  nickname?: string
  activeSessions: number
  error?: string
}

// ============================================
// iLink Bot API Types
// ============================================

export interface ILinkMessageItem {
  type: number // 1=text, 2=image, 3=voice, 4=file, 5=video
  text_item?: { text: string }
  image_item?: { media_url: string; aes_key?: string }
  voice_item?: { media_url: string; aes_key?: string }
  file_item?: { media_url: string; file_name: string; aes_key?: string }
}

export interface ILinkMessage {
  from_user_id: string
  to_user_id: string
  message_type: number
  context_token: string
  item_list: ILinkMessageItem[]
}

export interface ILinkGetUpdatesResponse {
  ret: number
  msgs: ILinkMessage[]
  get_updates_buf: string
  longpolling_timeout_ms?: number
}

export interface ILinkQRCodeResponse {
  qrcode: string
  qrcode_img_content?: string
  /** Full scannable URL (e.g. https://liteapp.weixin.qq.com/q/xxx?qrcode=xxx&bot_type=3) */
  url?: string
  qrcodeUrl?: string
  /** Catch any extra fields the API may return */
  [key: string]: unknown
}

export interface ILinkQRCodeStatusResponse {
  status: number // 0=pending, 1=scanned, 2=confirmed
  bot_token?: string
  baseurl?: string
}
