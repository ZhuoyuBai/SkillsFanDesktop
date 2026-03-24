/**
 * iLink Bot API Client
 *
 * Communicates with Tencent's official iLink Bot API (ilinkai.weixin.qq.com)
 * for personal WeChat account message relay.
 *
 * API reference: https://github.com/hao-ji-xing/openclaw-weixin/blob/main/weixin-bot-api.md
 */

import crypto from 'crypto'
import type {
  ILinkGetUpdatesResponse,
  ILinkQRCodeResponse,
  ILinkQRCodeStatusResponse,
  ILinkMessageItem
} from '@shared/types/wechat'

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '1.0.2'

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function buildBaseInfo(): { channel_version: string } {
  return { channel_version: CHANNEL_VERSION }
}

function generateClientId(): string {
  return crypto.randomUUID()
}

/**
 * Generate the required X-WECHAT-UIN header value.
 * Each request needs a fresh random uint32 → string → base64.
 */
function generateWeChatUIN(): string {
  const randomValue = crypto.randomInt(0, 4294967295) // uint32 range
  return Buffer.from(String(randomValue)).toString('base64')
}

/**
 * Build common headers for iLink API requests.
 */
function buildHeaders(botToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WECHAT-UIN': generateWeChatUIN()
  }

  if (botToken) {
    headers['AuthorizationType'] = 'ilink_bot_token'
    headers['Authorization'] = `Bearer ${botToken}`
  }

  return headers
}

/**
 * iLink Bot API Client.
 * Handles QR code login, message polling, and message sending.
 */
export class ILinkClient {
  /**
   * Request a QR code for WeChat login.
   * User scans this with their WeChat app to authorize.
   */
  async getQRCode(): Promise<ILinkQRCodeResponse> {
    const res = await fetch(`${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, {
      method: 'GET',
      headers: buildHeaders()
    })

    if (!res.ok) {
      throw new Error(`Failed to get QR code: HTTP ${res.status}`)
    }

    const data = (await res.json()) as ILinkQRCodeResponse
    console.log('[ILinkClient] QR code response keys:', Object.keys(data))
    console.log('[ILinkClient] QR code response (redacted):', JSON.stringify({
      qrcode: data.qrcode ? `${data.qrcode.slice(0, 8)}...` : undefined,
      qrcode_img_content: data.qrcode_img_content ? `[${data.qrcode_img_content.length} chars]` : undefined,
      url: data.url,
      qrcodeUrl: data.qrcodeUrl
    }))
    return data
  }

  /**
   * Poll QR code scan status.
   * Returns bot_token when the user confirms login.
   */
  async getQRCodeStatus(qrcode: string): Promise<ILinkQRCodeStatusResponse> {
    const res = await fetch(
      `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      {
        method: 'GET',
        headers: buildHeaders()
      }
    )

    if (!res.ok) {
      throw new Error(`Failed to check QR code status: HTTP ${res.status}`)
    }

    return (await res.json()) as ILinkQRCodeStatusResponse
  }

  /**
   * Long-poll for new messages.
   * Blocks for up to 35 seconds waiting for messages.
   *
   * @param botToken - Auth token from QR code login
   * @param cursor - get_updates_buf cursor (empty string for first call)
   * @returns Messages and updated cursor
   */
  async getUpdates(botToken: string, cursor: string, baseUrl?: string): Promise<ILinkGetUpdatesResponse> {
    const controller = new AbortController()
    // 45 second timeout (35s long-poll + 10s buffer)
    const timeout = setTimeout(() => controller.abort(), 45000)
    const requestBaseUrl = normalizeBaseUrl(baseUrl)

    try {
      const res = await fetch(`${requestBaseUrl}/ilink/bot/getupdates`, {
        method: 'POST',
        headers: buildHeaders(botToken),
        body: JSON.stringify({
          get_updates_buf: cursor,
          base_info: buildBaseInfo()
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        throw new Error(`getUpdates failed: HTTP ${res.status}`)
      }

      return (await res.json()) as ILinkGetUpdatesResponse
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Send a text message reply.
   *
   * @param botToken - Auth token
   * @param toUserId - Recipient WeChat user ID
   * @param contextToken - Must be copied from the received message
   * @param text - Text content to send
   */
  async sendText(
    botToken: string,
    toUserId: string,
    contextToken: string,
    text: string,
    baseUrl?: string
  ): Promise<void> {
    const items: ILinkMessageItem[] = [
      { type: 1, text_item: { text } }
    ]
    await this.sendMessage(botToken, toUserId, contextToken, items, baseUrl)
  }

  /**
   * Send a message with arbitrary item list.
   */
  async sendMessage(
    botToken: string,
    toUserId: string,
    contextToken: string,
    itemList: ILinkMessageItem[],
    baseUrl?: string
  ): Promise<void> {
    const requestBaseUrl = normalizeBaseUrl(baseUrl)
    const clientId = generateClientId()
    const res = await fetch(`${requestBaseUrl}/ilink/bot/sendmessage`, {
      method: 'POST',
      headers: buildHeaders(botToken),
      body: JSON.stringify({
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: itemList
        },
        base_info: buildBaseInfo()
      })
    })

    if (!res.ok) {
      throw new Error(`sendMessage failed: HTTP ${res.status}`)
    }

    const rawText = await res.text()
    if (!rawText.trim()) {
      return
    }

    let data: any
    try {
      data = JSON.parse(rawText)
    } catch (error) {
      console.warn('[ILinkClient] sendMessage returned non-JSON payload:', rawText)
      return
    }

    if (rawText.trim() === '{}') {
      return
    }

    const ret = typeof data?.ret === 'number'
      ? data.ret
      : typeof data?.base_resp?.ret === 'number'
        ? data.base_resp.ret
        : undefined
    const errMsg = data?.errmsg || data?.err_msg || data?.base_resp?.err_msg || ''

    if (ret === undefined) {
      return
    }

    if (ret !== 0) {
      throw new Error(`sendMessage error: ret=${ret} ${errMsg}`)
    }
  }

  /**
   * Send "typing" indicator to show the bot is processing.
   */
  async sendTyping(
    botToken: string,
    toUserId: string,
    contextToken: string,
    baseUrl?: string
  ): Promise<void> {
    try {
      const requestBaseUrl = normalizeBaseUrl(baseUrl)
      const configRes = await fetch(`${requestBaseUrl}/ilink/bot/getconfig`, {
        method: 'POST',
        headers: buildHeaders(botToken),
        body: JSON.stringify({
          ilink_user_id: toUserId,
          context_token: contextToken,
          base_info: buildBaseInfo()
        })
      })

      if (!configRes.ok) return

      const rawConfig = await configRes.text()
      const config = rawConfig.trim() ? JSON.parse(rawConfig) as { typing_ticket?: string } : {}
      if (!config.typing_ticket) return

      await fetch(`${requestBaseUrl}/ilink/bot/sendtyping`, {
        method: 'POST',
        headers: buildHeaders(botToken),
        body: JSON.stringify({
          ilink_user_id: toUserId,
          typing_ticket: config.typing_ticket,
          status: 1,
          base_info: buildBaseInfo()
        })
      })
    } catch {
      // Typing indicator is best-effort, ignore errors
    }
  }

  /**
   * Get CDN upload URL for media files.
   */
  async getUploadUrl(
    botToken: string,
    fileName: string,
    fileSize: number,
    baseUrl?: string
  ): Promise<{ upload_url: string; file_id: string }> {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ilink/bot/getuploadurl`, {
      method: 'POST',
      headers: buildHeaders(botToken),
      body: JSON.stringify({ file_name: fileName, file_size: fileSize })
    })

    if (!res.ok) {
      throw new Error(`getUploadUrl failed: HTTP ${res.status}`)
    }

    return (await res.json()) as { upload_url: string; file_id: string }
  }
}
