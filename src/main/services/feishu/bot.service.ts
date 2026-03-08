/**
 * Feishu Bot Service - SDK Client & WebSocket Long Connection
 *
 * Manages the Feishu bot lifecycle: connect, receive messages, send messages.
 * Uses the official @larksuiteoapi/node-sdk with WebSocket long connection mode
 * (no public IP required, perfect for desktop apps).
 */

import * as lark from '@larksuiteoapi/node-sdk'
import type { FeishuConfig, FeishuStatus } from '@shared/types/feishu'

export interface FeishuMessageEvent {
  messageId: string
  chatId: string
  chatType: 'p2p' | 'group'
  senderId: string
  senderOpenId: string
  content: string
  msgType: string
  /** Raw event data for advanced processing */
  raw: Record<string, unknown>
}

type MessageHandler = (event: FeishuMessageEvent) => void
type CardActionHandler = (action: {
  actionValue: unknown
  openId: string
  chatId?: string
  messageId?: string
}) => void

export class FeishuBotService {
  private client: lark.Client | null = null
  private wsClient: unknown = null
  private messageHandler: MessageHandler | null = null
  private cardActionHandler: CardActionHandler | null = null
  private connected = false
  private botName: string | null = null
  private error: string | null = null

  /**
   * Start the bot with given credentials.
   * Establishes a WebSocket long connection to Feishu.
   */
  async start(config: FeishuConfig): Promise<void> {
    if (!config.appId || !config.appSecret) {
      throw new Error('Feishu App ID and App Secret are required')
    }

    try {
      // Create API client
      this.client = new lark.Client({
        appId: config.appId,
        appSecret: config.appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu
      })

      // Create event dispatcher with message and card action events
      const eventDispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: Record<string, unknown>) => {
          this.handleMessageEvent(data)
        },
        'card.action.trigger': async (data: Record<string, unknown>) => {
          this.handleCardActionEvent(data)
        }
      })

      // Create WebSocket client for long connection
      // Note: eventDispatcher is passed to start(), NOT to the constructor
      const WSClient = (lark as unknown as Record<string, typeof lark.Client>).WSClient as unknown as new (params: Record<string, unknown>) => { start(params: { eventDispatcher: lark.EventDispatcher }): Promise<void>; close(params?: { force?: boolean }): void }
      if (!WSClient) {
        throw new Error('WSClient not available in @larksuiteoapi/node-sdk. Please check SDK version.')
      }

      this.wsClient = new WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        loggerLevel: lark.LoggerLevel.WARN
      })

      // Start long connection - eventDispatcher must be passed here
      await (this.wsClient as { start(params: { eventDispatcher: lark.EventDispatcher }): Promise<void> }).start({ eventDispatcher })

      this.connected = true
      this.error = null

      // Fetch bot info
      await this.fetchBotInfo()

      console.log(`[FeishuBot] Connected successfully. Bot: ${this.botName || 'unknown'}`)
    } catch (err) {
      this.connected = false
      this.error = err instanceof Error ? err.message : String(err)
      console.error('[FeishuBot] Failed to start:', this.error)
      throw err
    }
  }

  /**
   * Stop the bot and close the WebSocket connection.
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      try {
        const ws = this.wsClient as { close(params?: { force?: boolean }): void }
        ws.close({ force: true })
      } catch (err) {
        console.error('[FeishuBot] Error stopping WSClient:', err)
      }
      this.wsClient = null
    }
    this.client = null
    this.connected = false
    this.botName = null
    this.error = null
    console.log('[FeishuBot] Stopped')
  }

  /**
   * Get current connection status.
   */
  getStatus(): FeishuStatus {
    return {
      enabled: this.connected || this.wsClient !== null,
      connected: this.connected,
      botName: this.botName ?? undefined,
      activeSessions: 0, // Filled by FeishuChannel
      error: this.error ?? undefined
    }
  }

  /**
   * Get the API client for sending messages.
   */
  getClient(): lark.Client | null {
    return this.client
  }

  /**
   * Register handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  /**
   * Register handler for card action callbacks.
   */
  onCardAction(handler: CardActionHandler): void {
    this.cardActionHandler = handler
  }

  /**
   * Send a text message to a chat.
   */
  async sendText(chatId: string, text: string): Promise<string | undefined> {
    if (!this.client) throw new Error('Feishu client not initialized')

    const res = await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text })
      }
    })

    return res?.data?.message_id
  }

  /**
   * Send a rich text (post) message to a chat.
   */
  async sendPost(chatId: string, content: Record<string, unknown>): Promise<string | undefined> {
    if (!this.client) throw new Error('Feishu client not initialized')

    const res = await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'post',
        content: JSON.stringify(content)
      }
    })

    return res?.data?.message_id
  }

  /**
   * Send an interactive card to a chat.
   */
  async sendCard(chatId: string, card: Record<string, unknown>): Promise<string | undefined> {
    if (!this.client) throw new Error('Feishu client not initialized')

    const res = await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card)
      }
    })

    return res?.data?.message_id
  }

  /**
   * Update an existing card message.
   */
  async updateCard(messageId: string, card: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error('Feishu client not initialized')

    await this.client.im.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(card)
      }
    })
  }

  /**
   * Test if the credentials are valid by fetching bot info.
   * Uses the /open-apis/bot/v3/info/ endpoint directly.
   */
  async testConnection(appId: string, appSecret: string): Promise<{ success: boolean; botName?: string; error?: string }> {
    try {
      const botInfo = await this.fetchBotInfoWithCredentials(appId, appSecret)
      return { success: true, botName: botInfo.botName }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  // ============================================
  // Private
  // ============================================

  private handleMessageEvent(data: Record<string, unknown>): void {
    if (!this.messageHandler) return

    try {
      const message = (data as Record<string, Record<string, unknown>>).message
      if (!message) return

      const sender = message.sender as Record<string, unknown> | undefined
      const chatId = message.chat_id as string
      const chatType = message.chat_type as string

      const event: FeishuMessageEvent = {
        messageId: message.message_id as string,
        chatId,
        chatType: chatType === 'p2p' ? 'p2p' : 'group',
        senderId: (sender?.sender_id as Record<string, string>)?.user_id || '',
        senderOpenId: (sender?.sender_id as Record<string, string>)?.open_id || '',
        content: message.content as string || '',
        msgType: message.message_type as string || 'text',
        raw: data
      }

      this.messageHandler(event)
    } catch (err) {
      console.error('[FeishuBot] Error parsing message event:', err)
    }
  }

  private handleCardActionEvent(data: Record<string, unknown>): void {
    if (!this.cardActionHandler) return

    try {
      const action = data.action as Record<string, unknown> | undefined
      if (!action) return

      const actionValue = action.value
      const openId = (data.open_id as string) || (data.operator as Record<string, string>)?.open_id || ''

      console.log('[FeishuBot] Card action received:', JSON.stringify({
        hasActionValue: actionValue !== undefined,
        actionValueType: typeof actionValue,
        actionValuePreview: typeof actionValue === 'string'
          ? actionValue.slice(0, 200)
          : JSON.stringify(actionValue).slice(0, 200),
        openId,
        openChatId: data.open_chat_id,
        openMessageId: data.open_message_id
      }))

      this.cardActionHandler({
        actionValue,
        openId,
        chatId: data.open_chat_id as string | undefined,
        messageId: data.open_message_id as string | undefined
      })
    } catch (err) {
      console.error('[FeishuBot] Error parsing card action event:', err)
    }
  }

  /**
   * Fetch bot info using direct HTTP API call.
   * The SDK client doesn't expose a `bot` namespace, so we use the raw HTTP endpoint.
   */
  private async fetchBotInfoWithCredentials(appId: string, appSecret: string): Promise<{ botName: string }> {
    // First get tenant_access_token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    })
    const tokenData = await tokenRes.json() as { code: number; msg: string; tenant_access_token?: string }
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      throw new Error(tokenData.msg || 'Failed to get access token')
    }

    // Then get bot info
    const botRes = await fetch('https://open.feishu.cn/open-apis/bot/v3/info/', {
      headers: { 'Authorization': `Bearer ${tokenData.tenant_access_token}` }
    })
    const botData = await botRes.json() as { code: number; msg: string; bot?: { app_name?: string } }
    if (botData.code !== 0) {
      throw new Error(botData.msg || 'Failed to get bot info')
    }

    return { botName: botData.bot?.app_name || 'Unknown' }
  }

  private async fetchBotInfo(): Promise<void> {
    if (!this.client) return

    try {
      const info = await this.fetchBotInfoWithCredentials(
        this.client.appId as string,
        this.client.appSecret as string
      )
      this.botName = info.botName
    } catch (err) {
      console.warn('[FeishuBot] Failed to fetch bot info:', err)
    }
  }
}
