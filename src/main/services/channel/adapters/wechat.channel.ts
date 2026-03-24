/**
 * WeChat Channel Adapter
 *
 * Handles communication with WeChat personal accounts via Tencent's iLink Bot API.
 * Normalizes inbound messages and dispatches outbound events as plain text replies.
 */

import type { Channel } from '../channel.interface'
import type { NormalizedInboundMessage, NormalizedOutboundEvent } from '@shared/types/channel'
import type { WeChatConfig, WeChatAccount, ILinkMessage, WeChatSessionMapping } from '@shared/types/wechat'
import type { ElectronChannel } from './electron.channel'
import { getConfig, saveConfig, getActiveSpaceId, getHaloDir } from '../../config.service'
import { createConversation, getConversation, updateConversation } from '../../conversation.service'
import { getChannelManager } from '../channel-manager'
import { ILinkClient } from '../../wechat/ilink-client'
import { WeChatPollingEngine } from '../../wechat/polling-engine'
import { resolveQRCodeImageSource } from '../../wechat/qrcode-image'
import { WeChatSessionRouter } from '../../wechat/session-router'
import { WeChatAccessControl } from '../../wechat/access-control'
import { markdownToPlainText, chunkMessage } from '../../wechat/message-formatter'
import fs from 'fs'
import path from 'path'

export class WeChatChannel implements Channel {
  readonly id = 'wechat'
  readonly name = 'WeChat'

  private client = new ILinkClient()
  private pollingEngine = new WeChatPollingEngine()
  private sessionRouter = new WeChatSessionRouter()
  private accessControl = new WeChatAccessControl()
  private messageHandler: ((msg: NormalizedInboundMessage) => void) | null = null

  /** Accumulated message text per conversation for final send */
  private messageBuffers = new Map<string, string>()
  /** Typing interval per conversation */
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  /** Whether we have already sent final output for a conversation */
  private deliveredOutputs = new Set<string>()
  /** Stored account info */
  private account: WeChatAccount | null = null

  async initialize(): Promise<void> {
    const config = getConfig()
    const wechatConfig = (config as Record<string, unknown>).wechat as WeChatConfig | undefined

    if (!wechatConfig?.enabled) {
      console.log('[WeChatChannel] Not enabled, skipping initialization')
      return
    }

      this.sessionRouter.initialize()

    // Load persisted account
    this.account = this.loadAccount()
    if (!this.account) {
      console.log('[WeChatChannel] No saved account, waiting for QR login')
      return
    }
    if (!this.account.baseUrl) {
      console.warn('[WeChatChannel] Saved account has no baseUrl. Please log out and scan again to refresh the WeChat routing endpoint.')
    }

    // Set up message handler and start polling
    this.pollingEngine.onMessage((msg, botToken) => this.handleIncomingMessage(msg, botToken))
    this.pollingEngine.start(this.account.botToken, this.account.baseUrl)
    console.log('[WeChatChannel] Initialized and polling started')
  }

  dispatch(event: NormalizedOutboundEvent): void {
    const session = this.sessionRouter.getSessionByConversation(event.conversationId)
    if (!session) return

    this.dispatchToUser(session.fromUserId, session.contextToken, event).catch(err => {
      console.error(`[WeChatChannel] Failed to dispatch to ${session.fromUserId}:`, err)
    })
  }

  dispatchGlobal(_channel: string, _data: Record<string, unknown>): void {
    // Global events are not dispatched to WeChat
  }

  onMessage(handler: (msg: NormalizedInboundMessage) => void): void {
    this.messageHandler = handler
  }

  async shutdown(): Promise<void> {
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval)
    }
    this.typingIntervals.clear()
    this.messageBuffers.clear()
    this.deliveredOutputs.clear()

    this.pollingEngine.stop()
    this.messageHandler = null
    console.log('[WeChatChannel] Shut down')
  }

  // ============================================
  // Public API (for IPC handlers)
  // ============================================

  getClient(): ILinkClient {
    return this.client
  }

  getPollingEngine(): WeChatPollingEngine {
    return this.pollingEngine
  }

  getSessionRouter(): WeChatSessionRouter {
    return this.sessionRouter
  }

  getAccount(): WeChatAccount | null {
    return this.account
  }

  /**
   * Start QR code login flow.
   */
  async getQRCode(): Promise<{ qrcode: string; qrcodeImage?: string }> {
    const response = await this.client.getQRCode()

    return {
      qrcode: response.qrcode,
      qrcodeImage: await resolveQRCodeImageSource(
        response.qrcode,
        response.qrcode_img_content,
        response.url || response.qrcodeUrl as string | undefined
      )
    }
  }

  /**
   * Check QR code scan status.
   * Returns bot_token when login is confirmed.
   */
  async checkQRCodeStatus(qrcode: string): Promise<{ status: number; botToken?: string }> {
    const response = await this.client.getQRCodeStatus(qrcode)
    if (response.bot_token) {
      // Login successful - save account and start polling
      this.account = {
        botToken: response.bot_token,
        baseUrl: response.baseurl,
        loggedInAt: Date.now()
      }
      this.saveAccount(this.account)

      // Ensure config has wechat enabled
      const config = getConfig()
      const wechatConfig = (config as Record<string, unknown>).wechat as WeChatConfig | undefined
      if (!wechatConfig?.enabled) {
        saveConfig({
          wechat: {
            enabled: true,
            pairingCode: wechatConfig?.pairingCode || WeChatAccessControl.generatePairingCode(),
            allowedUserIds: wechatConfig?.allowedUserIds || [],
            defaultSpaceId: wechatConfig?.defaultSpaceId
          }
        } as Record<string, unknown>)
      }

      // Initialize session router and start polling
      this.sessionRouter.initialize()
      this.pollingEngine.onMessage((msg, botToken) => this.handleIncomingMessage(msg, botToken))
      this.pollingEngine.start(this.account.botToken, this.account.baseUrl)

      console.log(
        `[WeChatChannel] Login successful, polling started${this.account.baseUrl ? ` via ${this.account.baseUrl}` : ''}`
      )
    }
    return { status: response.status, botToken: response.bot_token }
  }

  /**
   * Get current status.
   */
  getStatus(): { enabled: boolean; connected: boolean; nickname?: string; activeSessions: number; error?: string } {
    return {
      enabled: this.account !== null,
      connected: this.pollingEngine.isRunning(),
      nickname: this.account?.nickname,
      activeSessions: this.sessionRouter.getSessionCount()
    }
  }

  /**
   * Logout and stop polling.
   */
  async logout(): Promise<void> {
    this.pollingEngine.stop()
    this.account = null
    this.deleteAccount()

    const config = getConfig()
    const wechatConfig = (config as Record<string, unknown>).wechat as WeChatConfig | undefined
    if (wechatConfig) {
      saveConfig({
        wechat: { ...wechatConfig, enabled: false }
      } as Record<string, unknown>)
    }

    console.log('[WeChatChannel] Logged out')
  }

  // ============================================
  // Inbound: WeChat -> Agent
  // ============================================

  private async handleIncomingMessage(msg: ILinkMessage, botToken: string): Promise<void> {
    const config = getConfig()
    const wechatConfig = (config as Record<string, unknown>).wechat as WeChatConfig | undefined
    if (!wechatConfig) return

    const { from_user_id: fromUserId, context_token: contextToken } = msg

    // Extract text content
    const text = this.extractTextContent(msg)
    if (!text) return

    console.log(`[WeChatChannel] Message from ${fromUserId}: "${text.substring(0, 80)}"`)

    // Access control check
    if (!this.accessControl.isAllowed(fromUserId, wechatConfig)) {
      console.log(`[WeChatChannel] User ${fromUserId} is not paired yet`)
      await this.handlePairing(fromUserId, contextToken, text, botToken, wechatConfig)
      return
    }

    if (await this.handlePendingToolApproval(text, fromUserId, contextToken, botToken)) {
      return
    }

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(text, fromUserId, contextToken, botToken, wechatConfig)
      return
    }

    // Resolve or create session
    const session = await this.resolveOrCreateSession(fromUserId, contextToken, wechatConfig)

    // Update conversation title for new conversations
    await this.ensureConversationTitle(session.spaceId, session.conversationId, text)

    console.log(`[WeChatChannel] Session: spaceId=${session.spaceId}, convId=${session.conversationId}`)

    // Track conversation for this channel
    getChannelManager().trackConversation(session.conversationId, this.id)

    // Update session
    this.sessionRouter.touchSession(fromUserId, contextToken)

    // Send typing indicator
    this.client.sendTyping(botToken, fromUserId, contextToken, this.pollingEngine.getBaseUrl()).catch(() => {})

    // Send to agent service
    try {
      const { sendMessage } = await import('../../agent')
      const electronChannel = getChannelManager().getChannel<ElectronChannel>('electron')
      const mainWindow = electronChannel?.getMainWindow() ?? null
      if (!mainWindow) {
        throw new Error('Main window is not available')
      }

      await sendMessage(mainWindow, {
        spaceId: session.spaceId,
        conversationId: session.conversationId,
        message: text
      })
      console.log(`[WeChatChannel] Agent completed for ${fromUserId}`)
    } catch (err) {
      console.error('[WeChatChannel] Failed to send message to agent:', err)
      const errorText = err instanceof Error ? err.message : 'Failed to process message'
      await this.sendTextSafely(
        botToken,
        fromUserId,
        contextToken,
        `Error: ${errorText}`,
        'agent error notice'
      )
    }
  }

  private extractTextContent(msg: ILinkMessage): string | null {
    if (!msg.item_list || msg.item_list.length === 0) return null

    for (const item of msg.item_list) {
      if (item.type === 1 && item.text_item?.text) {
        return item.text_item.text.trim()
      }
    }

    // For non-text messages, return a placeholder
    const typeNames: Record<number, string> = {
      2: 'image', 3: 'voice', 4: 'file', 5: 'video'
    }
    const firstType = msg.item_list[0]?.type
    if (firstType && typeNames[firstType]) {
      return `[${typeNames[firstType]}]`
    }

    return null
  }

  private async handlePairing(
    fromUserId: string,
    contextToken: string,
    text: string,
    botToken: string,
    config: WeChatConfig
  ): Promise<void> {
    // Check if this looks like a pairing code (6 digits)
    if (/^\d{6}$/.test(text.trim())) {
      const result = this.accessControl.verifyPairingCode(fromUserId, text, config)

      if (result.rateLimited) {
        await this.sendTextSafely(
          botToken,
          fromUserId,
          contextToken,
          'Too many attempts. Please try again later.',
          'pairing rate-limit notice'
        )
        return
      }

      if (result.success) {
        // Add to whitelist and persist
        const newAllowed = [...config.allowedUserIds, fromUserId]
        saveConfig({
          wechat: { ...config, allowedUserIds: newAllowed }
        } as Record<string, unknown>)

        console.log(`[WeChatChannel] Pairing successful for ${fromUserId}`)
        await this.sendTextSafely(
          botToken,
          fromUserId,
          contextToken,
          'Pairing successful. You can now send normal messages.\n配对成功，现在可以正常发送消息了。',
          'pairing success notice'
        )
        return
      }

      await this.sendTextSafely(
        botToken,
        fromUserId,
        contextToken,
        'Incorrect pairing code. Before sending normal messages, please send the 6-digit pairing code shown in SkillsFan settings.\n配对码不正确。首次正常发送消息前，请先发送 SkillsFan 设置页里的 6 位配对码。',
        'invalid pairing code notice'
      )
      return
    }

    // Send pairing prompt
    await this.sendTextSafely(
      botToken,
      fromUserId,
      contextToken,
      'Before sending normal messages for the first time, please send the 6-digit pairing code shown in SkillsFan settings.\n首次正常发送消息前，请先发送 SkillsFan 设置页里的 6 位配对码。',
      'pairing prompt'
    )
  }

  private async handleCommand(
    text: string,
    fromUserId: string,
    contextToken: string,
    botToken: string,
    config: WeChatConfig
  ): Promise<void> {
    const command = text.split(' ')[0]

    switch (command) {
      case '/status': {
        const status = this.getStatus()
        await this.sendTextSafely(
          botToken,
          fromUserId,
          contextToken,
          `WeChat Bot Status:\n` +
          `Connected: ${status.connected}\n` +
          `Active sessions: ${status.activeSessions}`,
          'status response'
        )
        break
      }
      case '/stop': {
        const session = this.sessionRouter.getSession(fromUserId)
        if (session) {
          const { stopGeneration } = await import('../../agent')
          stopGeneration(session.conversationId)
          await this.sendTextSafely(
            botToken,
            fromUserId,
            contextToken,
            'Agent execution stopped.',
            'stop confirmation'
          )
        }
        break
      }
      case '/new': {
        const existing = this.sessionRouter.getSession(fromUserId)
        const session = await this.createNewSession(
          fromUserId,
          contextToken,
          config,
          existing?.spaceId,
          existing?.pairedAt
        )
        await this.sendTextSafely(
          botToken,
          fromUserId,
          contextToken,
          `New conversation created: ${session.conversationId.slice(0, 8)}`,
          'new conversation confirmation'
        )
        break
      }
      default: {
        await this.sendTextSafely(
          botToken,
          fromUserId,
          contextToken,
          'Available commands: /status, /stop, /new',
          'command help'
        )
      }
    }
  }

  private async handlePendingToolApproval(
    text: string,
    fromUserId: string,
    contextToken: string,
    botToken: string
  ): Promise<boolean> {
    const session = this.sessionRouter.getSession(fromUserId)
    if (!session) return false

    const normalized = text.trim().toLowerCase()
    const approvalMap: Record<string, boolean> = {
      y: true,
      yes: true,
      n: false,
      no: false
    }
    if (!(normalized in approvalMap)) return false

    const { activeSessions, handleToolApproval } = await import('../../agent')
    const activeSession = activeSessions.get(session.conversationId)
    if (!activeSession?.pendingPermissionResolve) {
      return false
    }

    const approved = approvalMap[normalized]
    handleToolApproval(session.conversationId, approved)

    await this.sendTextSafely(
      botToken,
      fromUserId,
      contextToken,
      approved
        ? 'Approval received. Continuing execution.\n已收到批准，继续执行。'
        : 'Request rejected. I stopped that action.\n已拒绝该请求，我已经停止执行。',
      approved ? 'tool approval confirmation' : 'tool rejection confirmation'
    )

    return true
  }

  private async resolveOrCreateSession(
    fromUserId: string,
    contextToken: string,
    config: WeChatConfig
  ): Promise<{ spaceId: string; conversationId: string }> {
    let session = this.sessionRouter.getSession(fromUserId)
    let preferredSpaceId: string | undefined

    if (session && !getConversation(session.spaceId, session.conversationId)) {
      preferredSpaceId = session.spaceId
      console.warn(
        `[WeChatChannel] Stale session mapping detected for user ${fromUserId}, conversation ${session.conversationId}. Recreating session.`
      )
      this.sessionRouter.removeSession(fromUserId)
      session = null
    }

    if (!session) {
      session = await this.createNewSession(fromUserId, contextToken, config, preferredSpaceId)
    }

    return { spaceId: session.spaceId, conversationId: session.conversationId }
  }

  private async createNewSession(
    fromUserId: string,
    contextToken: string,
    config: WeChatConfig,
    preferredSpaceId?: string,
    pairedAt?: number
  ): Promise<WeChatSessionMapping> {
    let spaceId = preferredSpaceId || config.defaultSpaceId || getActiveSpaceId()
    let conversation
    const title = this.getConversationTitle(fromUserId)

    try {
      conversation = createConversation(spaceId, title)
    } catch (err) {
      if (spaceId !== 'skillsfan-temp') {
        console.warn(`[WeChatChannel] Failed to create conversation in space ${spaceId}, fallback to skillsfan-temp`, err)
        spaceId = 'skillsfan-temp'
        conversation = createConversation(spaceId, title)
      } else {
        throw err
      }
    }

    const mapping: WeChatSessionMapping = {
      fromUserId,
      spaceId,
      conversationId: conversation.id,
      contextToken,
      pairedAt: pairedAt ?? Date.now(),
      lastMessageAt: Date.now()
    }

    this.sessionRouter.setSession(mapping)
    console.log(`[WeChatChannel] Created new session for ${fromUserId}: ${conversation.id}`)
    return mapping
  }

  private async ensureConversationTitle(
    spaceId: string,
    conversationId: string,
    incomingText: string
  ): Promise<void> {
    const normalized = incomingText.replace(/\s+/g, ' ').trim()
    if (!normalized) return

    const conversation = getConversation(spaceId, conversationId) as {
      title?: string
      messages?: Array<{ role?: string }>
    } | null
    if (!conversation) return

    if ((conversation.messages?.length || 0) === 0) {
      const truncated = normalized.slice(0, 50) + (normalized.length > 50 ? '...' : '')
      updateConversation(spaceId, conversationId, {
        title: `WeChat: ${truncated}`
      } as any)
    }
  }

  // ============================================
  // Outbound: Agent -> WeChat
  // ============================================

  private async dispatchToUser(
    fromUserId: string,
    contextToken: string,
    event: NormalizedOutboundEvent
  ): Promise<void> {
    const botToken = this.pollingEngine.getBotToken()
    if (!botToken) return

    const convId = event.conversationId
    const payload = event.payload

    switch (event.type) {
      case 'agent:start': {
        // Reset state for new generation
        this.messageBuffers.delete(convId)
        this.deliveredOutputs.delete(convId)

        // Send typing indicator periodically
        const baseUrl = this.pollingEngine.getBaseUrl()
        this.client.sendTyping(botToken, fromUserId, contextToken, baseUrl).catch(() => {})
        const interval = setInterval(() => {
          this.client.sendTyping(botToken, fromUserId, contextToken, baseUrl).catch(() => {})
        }, 10000) // Every 10 seconds
        this.typingIntervals.set(convId, interval)
        break
      }

      case 'agent:message': {
        const fullContent = payload.content as string | undefined
        if (typeof fullContent === 'string' && fullContent.length > 0) {
          this.messageBuffers.set(convId, fullContent)
          break
        }

        const delta = (payload.text as string) || (payload.delta as string) || ''
        if (delta) {
          const existing = this.messageBuffers.get(convId) || ''
          this.messageBuffers.set(convId, existing + delta)
        }
        break
      }

      case 'agent:tool-call': {
        const requiresApproval = payload.requiresApproval as boolean
        if (requiresApproval) {
          const toolName = (payload.toolName as string) || 'Tool'
          await this.sendTextSafely(
            botToken,
            fromUserId,
            contextToken,
            `Tool "${toolName}" requires approval.\nReply Y to approve or N to reject.`,
            'tool approval request'
          )
        }
        break
      }

      case 'agent:user-question': {
        const question = (payload.question as string) || 'Question from agent'
        await this.sendTextSafely(botToken, fromUserId, contextToken, question, 'agent question')
        break
      }

      case 'agent:complete': {
        // Stop typing indicator
        this.clearTypingInterval(convId)

        // Send accumulated text
        if (!this.deliveredOutputs.has(convId)) {
          this.deliveredOutputs.add(convId)
          let fullText = this.messageBuffers.get(convId) || ''
          this.messageBuffers.delete(convId)

          if (!fullText) {
            const conversation = getConversation(event.spaceId, convId) as {
              messages?: Array<{ role?: string; content?: string }>
            } | null
            const lastAssistant = conversation?.messages?.slice().reverse().find((msg) => msg.role === 'assistant')
            fullText = lastAssistant?.content || ''
          }

          if (fullText) {
            const plainText = markdownToPlainText(fullText)
            const chunks = chunkMessage(plainText)
            for (const chunk of chunks) {
              await this.sendTextSafely(botToken, fromUserId, contextToken, chunk, 'reply chunk')
            }
          }
        }
        break
      }

      case 'agent:error': {
        this.clearTypingInterval(convId)

        if (!this.deliveredOutputs.has(convId)) {
          this.deliveredOutputs.add(convId)
          const errorMsg = (payload.error as string) || (payload.message as string) || 'An error occurred'
          await this.sendTextSafely(
            botToken,
            fromUserId,
            contextToken,
            `Error: ${errorMsg}`,
            'agent failure notice'
          )
        }
        break
      }
    }
  }

  private getConversationTitle(fromUserId: string): string {
    const label = fromUserId.split('@')[0] || 'chat'
    return `WeChat: ${label}`
  }

  private async sendTextSafely(
    botToken: string,
    fromUserId: string,
    contextToken: string,
    text: string,
    purpose: string
  ): Promise<void> {
    try {
      const baseUrl = this.pollingEngine.getBaseUrl()
      console.log(
        `[WeChatChannel] Sending ${purpose} to ${fromUserId} via ${baseUrl || 'https://ilinkai.weixin.qq.com'} (len=${text.length})`
      )
      await this.client.sendText(botToken, fromUserId, contextToken, text, baseUrl)
    } catch (err) {
      console.error(`[WeChatChannel] Failed to send ${purpose} to ${fromUserId}:`, err)
    }
  }

  private clearTypingInterval(convId: string): void {
    const interval = this.typingIntervals.get(convId)
    if (interval) {
      clearInterval(interval)
      this.typingIntervals.delete(convId)
    }
  }

  // ============================================
  // Account Persistence
  // ============================================

  private getAccountFilePath(): string {
    return path.join(getHaloDir(), 'wechat-account.json')
  }

  private loadAccount(): WeChatAccount | null {
    try {
      const filePath = this.getAccountFilePath()
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as WeChatAccount
      }
    } catch (err) {
      console.warn('[WeChatChannel] Failed to load account:', err)
    }
    return null
  }

  private saveAccount(account: WeChatAccount): void {
    try {
      const filePath = this.getAccountFilePath()
      fs.writeFileSync(filePath, JSON.stringify(account, null, 2), 'utf-8')
    } catch (err) {
      console.error('[WeChatChannel] Failed to save account:', err)
    }
  }

  private deleteAccount(): void {
    try {
      const filePath = this.getAccountFilePath()
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      console.warn('[WeChatChannel] Failed to delete account file:', err)
    }
  }
}
