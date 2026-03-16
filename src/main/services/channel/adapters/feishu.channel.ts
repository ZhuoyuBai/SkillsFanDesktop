/**
 * Feishu Channel Adapter
 *
 * Handles communication with Feishu (飞书) via bot long connection.
 * Normalizes inbound messages and dispatches outbound events as
 * Feishu rich text / interactive cards.
 */

import type { Channel } from '../channel.interface'
import type { NormalizedInboundMessage, NormalizedOutboundEvent } from '@shared/types/channel'
import type { FeishuConfig, FeishuSessionMapping } from '@shared/types/feishu'
import type { FeishuCardLocale } from '../../feishu'
import type { ElectronChannel } from './electron.channel'
import { existsSync } from 'fs'
import { app } from 'electron'
import { normalizeLocalFilePath } from '../../local-tools/path-utils'
import { getConfig, saveConfig, getActiveSpaceId } from '../../config.service'
import { createConversation, getConversation, updateConversation } from '../../conversation.service'
import {
  FeishuBotService,
  FeishuAccessControl,
  FeishuSessionRouter,
  hasFeishuConversationTarget,
  markdownToPost,
  chunkMessage,
  buildThinkingCard,
  buildToolApprovalCard,
  buildUserQuestionCard,
  buildToolApprovalResultCard,
  buildErrorCard,
  buildPairingPromptCard,
  buildPairingSuccessCard,
  buildRateLimitCard,
  buildCompleteCard,
  buildFailedCard,
  buildThinkingCardWithTools
} from '../../feishu'
import type { FeishuMessageEvent } from '../../feishu'
import { summarizeToolCall, upsertToolSummary } from '../../feishu/tool-status'
import { parseFeishuCardActionValue } from '../../feishu/card-action'
import { getChannelManager } from '../channel-manager'

interface ConversationThought {
  type?: string
  toolOutput?: string
}

interface ConversationImageAttachment {
  type?: string
  mediaType?: string
  data?: string
}

interface ConversationMessage {
  role?: string
  content?: string
  thoughts?: ConversationThought[]
  images?: ConversationImageAttachment[]
}

interface ConversationSnapshot {
  messages?: ConversationMessage[]
}

interface FeishuReplyImage {
  dedupeKey: string
  buffer?: Buffer
  filePath?: string
}

const LOCAL_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i

function decodeBase64Image(data: string): Buffer | null {
  const normalized = data
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '')

  if (!normalized) {
    return null
  }

  const buffer = Buffer.from(normalized, 'base64')
  return buffer.length > 0 ? buffer : null
}

function normalizeImageFileCandidate(candidate: string): string | null {
  const normalized = normalizeLocalFilePath(candidate)
  if (!normalized || !LOCAL_IMAGE_EXT_RE.test(normalized)) {
    return null
  }

  return existsSync(normalized) ? normalized : null
}

function extractLocalImagePaths(text: string): string[] {
  if (!text) return []

  const matches = new Set<string>()
  const addCandidate = (candidate: string): void => {
    const normalized = normalizeImageFileCandidate(candidate)
    if (normalized) {
      matches.add(normalized)
    }
  }

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    addCandidate(match[1])
  }

  for (const match of text.matchAll(/(?:file:\/\/[^\s`]+?\.(?:png|jpe?g|gif|webp|bmp|tiff?)|~\/[^\s`]+?\.(?:png|jpe?g|gif|webp|bmp|tiff?)|\/[^\s`]+?\.(?:png|jpe?g|gif|webp|bmp|tiff?))/gi)) {
    addCandidate(match[0])
  }

  return [...matches]
}

function extractReplyImagesFromMessage(message: ConversationMessage | undefined): FeishuReplyImage[] {
  if (!message) return []

  const images: FeishuReplyImage[] = []
  const seen = new Set<string>()
  const pushBuffer = (mediaType: string | undefined, data: string | undefined): void => {
    if (!mediaType?.startsWith('image/') || !data) return

    const buffer = decodeBase64Image(data)
    if (!buffer) return

    const dedupeKey = `buffer:${mediaType}:${data.slice(0, 128)}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    images.push({ dedupeKey, buffer })
  }

  const pushFilePath = (filePath: string | undefined): void => {
    if (!filePath) return

    const normalized = normalizeImageFileCandidate(filePath)
    if (!normalized) return

    const dedupeKey = `file:${normalized}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    images.push({ dedupeKey, filePath: normalized })
  }

  for (const image of message.images || []) {
    if (image.type === 'image') {
      pushBuffer(image.mediaType, image.data)
    }
  }

  for (const thought of message.thoughts || []) {
    const toolOutput = thought.toolOutput
    if (!toolOutput) continue

    for (const filePath of extractLocalImagePaths(toolOutput)) {
      pushFilePath(filePath)
    }

    try {
      const parsed = JSON.parse(toolOutput) as Array<{
        type?: string
        text?: string
        file_path?: string
        source?: {
          type?: string
          data?: string
          media_type?: string
        }
      }>

      if (!Array.isArray(parsed)) continue

      for (const block of parsed) {
        if (block.type === 'image') {
          if (block.source?.type === 'base64') {
            pushBuffer(block.source.media_type, block.source.data)
          }
          pushFilePath(block.file_path)
        }

        if (typeof block.text === 'string') {
          for (const filePath of extractLocalImagePaths(block.text)) {
            pushFilePath(filePath)
          }
        }
      }
    } catch {
      // Ignore non-JSON tool output.
    }
  }

  for (const filePath of extractLocalImagePaths(message.content || '')) {
    pushFilePath(filePath)
  }

  return images
}

export class FeishuChannel implements Channel {
  readonly id = 'feishu'
  readonly name = 'Feishu Bot'

  private botService = new FeishuBotService()
  private accessControl = new FeishuAccessControl()
  private sessionRouter = new FeishuSessionRouter()
  private messageHandler: ((msg: NormalizedInboundMessage) => void) | null = null

  /** Track thinking card message IDs per conversation for later update */
  private thinkingCardIds = new Map<string, string>()
  /** Track accumulated message text per conversation for final send */
  private messageBuffers = new Map<string, string>()
  /** Typing indicator interval per conversation */
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  /** Whether we have already sent final content/error for a conversation */
  private deliveredOutputs = new Set<string>()
  /** Whether we have already sent reply images for a conversation */
  private deliveredReplyImages = new Set<string>()
  /** Track tool call IDs that already triggered an approval card, to prevent duplicate notifications */
  private approvedToolCalls = new Set<string>()
  /** Track approval card message IDs by tool call ID so card updates do not depend on callback payload shape */
  private approvalCards = new Map<string, {
    messageId: string
    chatId: string
    conversationId: string
    toolName: string
  }>()
  /** Track active tools per conversation for aggregated thinking card */
  private activeTools = new Map<string, Array<{ key: string; text: string }>>()
  /** Dedup inbound messages by messageId (飞书 WebSocket may retry) */
  private processedMessages = new Map<string, number>()
  private static readonly DEDUP_TTL_MS = 5 * 60 * 1000

  async initialize(): Promise<void> {
    const config = getConfig()
    const feishuConfig = (config as Record<string, unknown>).feishu as FeishuConfig | undefined

    if (!feishuConfig?.enabled || !feishuConfig.appId || !feishuConfig.appSecret) {
      console.log('[FeishuChannel] Not enabled or missing credentials, skipping initialization')
      return
    }

    this.sessionRouter.initialize()

    // Register message handler
    this.botService.onMessage((event) => this.handleIncomingMessage(event))

    // Register card action handler (tool approval, user question answers)
    this.botService.onCardAction((action) => this.handleCardAction(action))

    try {
      await this.botService.start(feishuConfig)
      console.log('[FeishuChannel] Initialized successfully')
    } catch (err) {
      console.error('[FeishuChannel] Failed to initialize:', err)
    }
  }

  private getLocaleTag(): FeishuCardLocale {
    const locale = app.getLocale().toLowerCase()
    if (locale.startsWith('zh-tw') || locale.startsWith('zh-hk') || locale.startsWith('zh-mo')) {
      return 'zh-TW'
    }
    if (locale.startsWith('zh')) {
      return 'zh-CN'
    }
    return 'en'
  }

  private getRemoteSourceLabel(): string {
    const locale = this.getLocaleTag()
    if (locale === 'zh-TW') return '飛書'
    if (locale === 'zh-CN') return '飞书'
    return 'Feishu'
  }

  private getRemoteChatLabel(chatType: FeishuMessageEvent['chatType']): string {
    const locale = this.getLocaleTag()
    if (locale === 'zh-TW') return chatType === 'p2p' ? '私聊' : '群聊'
    if (locale === 'zh-CN') return chatType === 'p2p' ? '私聊' : '群聊'
    return chatType === 'p2p' ? 'DM' : 'Group'
  }

  private getTitleSeparator(): string {
    return this.getLocaleTag() === 'en' ? ': ' : '：'
  }

  private formatRemoteConversationTitle(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    const truncated = normalized.slice(0, 50) + (normalized.length > 50 ? '...' : '')
    return `${this.getRemoteSourceLabel()}${this.getTitleSeparator()}${truncated}`
  }

  private isLegacyRemoteTitle(title: string): boolean {
    const normalized = title.trim()
    if (!normalized) return false
    if (/^feishu\s+chat$/i.test(normalized)) return true
    return /^(Feishu|飞书|飛書)\s*[:：]\s*(DM|Group|Direct Message|私聊|群聊)$/i.test(normalized)
  }

  private async ensureConversationTitle(
    spaceId: string,
    conversationId: string,
    incomingText: string
  ): Promise<void> {
    const normalizedIncoming = incomingText.replace(/\s+/g, ' ').trim()
    if (!normalizedIncoming) return

    const conversation = getConversation(spaceId, conversationId) as {
      title?: string
      messages?: Array<{ role?: string; content?: string }>
    } | null
    if (!conversation) return

    // First message in a remote conversation: use "Feishu: <message>" style title.
    if ((conversation.messages?.length || 0) === 0) {
      updateConversation(spaceId, conversationId, {
        title: this.formatRemoteConversationTitle(normalizedIncoming)
      } as any)
      return
    }

    // Migrate legacy placeholder titles ("Feishu: DM", "Feishu Chat", etc.) once.
    if (conversation.title && this.isLegacyRemoteTitle(conversation.title)) {
      const firstUser = conversation.messages?.find(
        (msg) => msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim().length > 0
      )
      const sourceText = firstUser?.content || normalizedIncoming
      updateConversation(spaceId, conversationId, {
        title: this.formatRemoteConversationTitle(sourceText)
      } as any)
    }
  }

  dispatch(event: NormalizedOutboundEvent): void {
    // Find the chat ID for this conversation
    const sessions = this.sessionRouter.getAllSessions()
    const targetSessions = sessions.filter(s => s.conversationId === event.conversationId)

    for (const session of targetSessions) {
      this.dispatchToChat(session.chatId, event).catch(err => {
        console.error(`[FeishuChannel] Failed to dispatch to chat ${session.chatId}:`, err)
      })
    }
  }

  dispatchGlobal(_channel: string, _data: Record<string, unknown>): void {
    // Global events (like MCP status) are not dispatched to Feishu
  }

  onMessage(handler: (msg: NormalizedInboundMessage) => void): void {
    this.messageHandler = handler
  }

  async shutdown(): Promise<void> {
    // Clear all intervals
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval)
    }
    this.typingIntervals.clear()
    this.thinkingCardIds.clear()
    this.messageBuffers.clear()
    this.activeTools.clear()
    this.approvalCards.clear()
    this.deliveredReplyImages.clear()

    await this.botService.stop()
    this.messageHandler = null
    console.log('[FeishuChannel] Shut down')
  }

  // ============================================
  // Public API (for IPC handlers)
  // ============================================

  getBotService(): FeishuBotService {
    return this.botService
  }

  getSessionRouter(): FeishuSessionRouter {
    return this.sessionRouter
  }

  /**
   * Enable the Feishu bot with the given config.
   */
  async enable(feishuConfig: FeishuConfig): Promise<void> {
    this.sessionRouter.initialize()
    this.botService.onMessage((event) => this.handleIncomingMessage(event))
    this.botService.onCardAction((action) => this.handleCardAction(action))
    await this.botService.start(feishuConfig)
  }

  /**
   * Disable the Feishu bot.
   */
  async disable(): Promise<void> {
    await this.botService.stop()
  }

  // ============================================
  // Card Action Callbacks
  // ============================================

  private async handleCardAction(action: {
    actionValue: unknown
    openId: string
    chatId?: string
    messageId?: string
  }): Promise<void> {
    try {
      const value = parseFeishuCardActionValue(action.actionValue)
      if (!value) {
        console.warn('[FeishuChannel] Ignoring card action with empty/invalid value')
        return
      }

      const actionType = value.action
      const conversationId = value.conversationId

      console.log('[FeishuChannel] Parsed card action:', JSON.stringify({
        actionType,
        conversationId,
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        valueMessageId: value.messageId,
        messageId: action.messageId
      }))

      if (!conversationId) {
        console.warn('[FeishuChannel] Card action missing conversationId')
        return
      }

      // Dynamic import to avoid circular deps
      const { handleToolApproval, handleUserQuestionAnswer } = await import('../../agent')

      switch (actionType) {
        case 'tool_approve': {
          const locale = this.getLocaleTag()
          handleToolApproval(conversationId, true)
          // Update card to show result
          const storedApproval = value.toolCallId ? this.approvalCards.get(value.toolCallId) : undefined
          const approvalMessageId = action.messageId || value.messageId || storedApproval?.messageId
          const toolName = value.toolName || storedApproval?.toolName || 'Tool'
          if (approvalMessageId) {
            try {
              await this.botService.updateCard(
                approvalMessageId,
                buildToolApprovalResultCard(toolName, true, locale)
              )
            } catch (error) {
              console.warn('[FeishuChannel] Failed to update approval card after approve, sending fallback card:', error)
              const fallbackChatId = action.chatId || storedApproval?.chatId
              if (fallbackChatId) {
                await this.botService.sendCard(
                  fallbackChatId,
                  buildToolApprovalResultCard(toolName, true, locale)
                ).catch((sendError) => {
                  console.warn('[FeishuChannel] Failed to send fallback approval result card:', sendError)
                })
              }
            }
            if (value.toolCallId) {
              this.approvalCards.delete(value.toolCallId)
              this.approvedToolCalls.delete(value.toolCallId)
            }
          } else {
            console.warn('[FeishuChannel] Approval succeeded but no message ID was available to update the card')
            const fallbackChatId = action.chatId || storedApproval?.chatId
            if (fallbackChatId) {
              await this.botService.sendCard(
                fallbackChatId,
                buildToolApprovalResultCard(toolName, true, locale)
              ).catch((sendError) => {
                console.warn('[FeishuChannel] Failed to send fallback approval result card without message ID:', sendError)
              })
            }
            if (value.toolCallId) {
              this.approvalCards.delete(value.toolCallId)
              this.approvedToolCalls.delete(value.toolCallId)
            }
          }
          break
        }
        case 'tool_reject': {
          const locale = this.getLocaleTag()
          handleToolApproval(conversationId, false)
          const storedApproval = value.toolCallId ? this.approvalCards.get(value.toolCallId) : undefined
          const approvalMessageId = action.messageId || value.messageId || storedApproval?.messageId
          const toolName = value.toolName || storedApproval?.toolName || 'Tool'
          if (approvalMessageId) {
            try {
              await this.botService.updateCard(
                approvalMessageId,
                buildToolApprovalResultCard(toolName, false, locale)
              )
            } catch (error) {
              console.warn('[FeishuChannel] Failed to update approval card after reject, sending fallback card:', error)
              const fallbackChatId = action.chatId || storedApproval?.chatId
              if (fallbackChatId) {
                await this.botService.sendCard(
                  fallbackChatId,
                  buildToolApprovalResultCard(toolName, false, locale)
                ).catch((sendError) => {
                  console.warn('[FeishuChannel] Failed to send fallback rejection result card:', sendError)
                })
              }
            }
            if (value.toolCallId) {
              this.approvalCards.delete(value.toolCallId)
              this.approvedToolCalls.delete(value.toolCallId)
            }
          } else {
            console.warn('[FeishuChannel] Rejection succeeded but no message ID was available to update the card')
            const fallbackChatId = action.chatId || storedApproval?.chatId
            if (fallbackChatId) {
              await this.botService.sendCard(
                fallbackChatId,
                buildToolApprovalResultCard(toolName, false, locale)
              ).catch((sendError) => {
                console.warn('[FeishuChannel] Failed to send fallback rejection result card without message ID:', sendError)
              })
            }
            if (value.toolCallId) {
              this.approvalCards.delete(value.toolCallId)
              this.approvedToolCalls.delete(value.toolCallId)
            }
          }
          break
        }
        case 'user_answer': {
          const answer = value.answer
          if (answer) {
            handleUserQuestionAnswer(conversationId, { answer })
          }
          break
        }
      }
    } catch (err) {
      console.error('[FeishuChannel] Error handling card action:', err)
    }
  }

  private parseCardActionValue(raw: unknown): Record<string, string> | null {
    return parseFeishuCardActionValue(raw)
  }

  // ============================================
  // Inbound: Feishu -> Agent
  // ============================================

  private async handleIncomingMessage(event: FeishuMessageEvent): Promise<void> {
    // Dedup: Feishu WebSocket may redeliver the same message on timeout/retry
    if (this.processedMessages.has(event.messageId)) {
      console.log(`[FeishuChannel] Duplicate message ignored: ${event.messageId}`)
      return
    }
    this.processedMessages.set(event.messageId, Date.now())
    this.cleanupProcessedMessages()

    const config = getConfig()
    const feishuConfig = (config as Record<string, unknown>).feishu as FeishuConfig | undefined
    if (!feishuConfig) return

    const { chatId, chatType } = event

    // Group policy check
    if (chatType === 'group' && feishuConfig.groupPolicy === 'disabled') {
      return
    }
    // TODO: For 'mention' policy, check if bot was @mentioned

    // Access control check
    if (!this.accessControl.isAllowed(chatId, feishuConfig)) {
      await this.handlePairing(event, feishuConfig)
      return
    }

    // Parse message content
    const text = this.extractTextContent(event)
    if (!text) return

    console.log(`[FeishuChannel] Message from ${chatId}: "${text.substring(0, 80)}"`)

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(text, chatId)
      return
    }

    // Resolve or create session
    const session = await this.resolveOrCreateSession(event, feishuConfig)
    await this.ensureConversationTitle(session.spaceId, session.conversationId, text)

    console.log(`[FeishuChannel] Session: spaceId=${session.spaceId}, convId=${session.conversationId}`)

    // Track conversation for this channel
    getChannelManager().trackConversation(session.conversationId, this.id)

    // Update last message time
    this.sessionRouter.touchSession(chatId)

    // Send to agent service (use current mainWindow to avoid nullifying ElectronChannel)
    try {
      const { sendMessage } = await import('../../agent')
      const electronChannel = getChannelManager().getChannel<ElectronChannel>('electron')
      const mainWindow = electronChannel?.getMainWindow() ?? null
      if (!mainWindow) {
        throw new Error('Main window is not available')
      }
      console.log(`[FeishuChannel] Sending to agent...`)
      await sendMessage(mainWindow, {
        spaceId: session.spaceId,
        conversationId: session.conversationId,
        message: text
      })
      console.log(`[FeishuChannel] Agent completed for ${chatId}`)
    } catch (err) {
      console.error('[FeishuChannel] Failed to send message to agent:', err)
      await this.botService.sendCard(chatId, buildErrorCard(
        err instanceof Error ? err.message : 'Failed to process message',
        this.getLocaleTag()
      ))
    }
  }

  private async handlePairing(event: FeishuMessageEvent, config: FeishuConfig): Promise<void> {
    const text = this.extractTextContent(event)

    // Check if this looks like a pairing code (6 digits)
    if (text && /^\d{6}$/.test(text.trim())) {
      const result = this.accessControl.verifyPairingCode(event.chatId, text, config)

      if (result.rateLimited) {
        await this.botService.sendCard(event.chatId, buildRateLimitCard(this.getLocaleTag()))
        return
      }

      if (result.success) {
        // Add to whitelist and persist
        const newAllowed = [...config.allowedChatIds, event.chatId]
        saveConfig({ feishu: { ...config, allowedChatIds: newAllowed } } as Record<string, unknown>)

        await this.botService.sendCard(event.chatId, buildPairingSuccessCard(this.getLocaleTag()))
        return
      }
    }

    // Send pairing prompt
    await this.botService.sendCard(event.chatId, buildPairingPromptCard(this.getLocaleTag()))
  }

  private t(key: string, params?: Record<string, string | number | boolean>): string {
    const locale = this.getLocaleTag()
    const translations: Record<string, Record<'zh-CN' | 'zh-TW' | 'en', string>> = {
      'status.bot': { 'zh-CN': '机器人', 'zh-TW': '機器人', en: 'Bot' },
      'status.connected': { 'zh-CN': '已连接', 'zh-TW': '已連線', en: 'Connected' },
      'status.activeSessions': { 'zh-CN': '活跃会话', 'zh-TW': '活躍對話', en: 'Active sessions' },
      'stop.done': { 'zh-CN': '已停止执行。', 'zh-TW': '已停止執行。', en: 'Agent execution stopped.' },
      'new.created': { 'zh-CN': '已创建新对话：{id}', 'zh-TW': '已建立新對話：{id}', en: 'New conversation created: {id}' },
      'commands.help': {
        'zh-CN': '可用命令：/status, /stop, /new',
        'zh-TW': '可用指令：/status, /stop, /new',
        en: 'Available commands: /status, /stop, /new'
      }
    }
    let text = translations[key]?.[locale] ?? translations[key]?.en ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }

  private async handleCommand(text: string, chatId: string): Promise<void> {
    const [command, ...args] = text.split(' ')

    switch (command) {
      case '/status': {
        const status = this.botService.getStatus()
        await this.botService.sendText(chatId,
          `${this.t('status.bot')}: ${status.botName || 'unknown'}\n` +
          `${this.t('status.connected')}: ${status.connected}\n` +
          `${this.t('status.activeSessions')}: ${this.sessionRouter.getSessionCount()}`
        )
        break
      }
      case '/stop': {
        const session = this.sessionRouter.getSession(chatId)
        if (session) {
          // Import dynamically to avoid circular deps
          const { stopGeneration } = await import('../../agent')
          stopGeneration(session.conversationId)
          await this.botService.sendText(chatId, this.t('stop.done'))
        }
        break
      }
      case '/new': {
        const session = this.sessionRouter.getSession(chatId)
        if (session) {
          const title = `${this.getRemoteSourceLabel()}${this.getTitleSeparator()}${this.getRemoteChatLabel(session.chatType)}`
          const conv = createConversation(session.spaceId, title)
          session.conversationId = conv.id
          this.sessionRouter.setSession(session)
          await this.botService.sendText(chatId, this.t('new.created', { id: conv.id.slice(0, 8) }))
        }
        break
      }
      default:
        await this.botService.sendText(chatId, this.t('commands.help'))
    }
  }

  private extractTextContent(event: FeishuMessageEvent): string {
    if (event.msgType !== 'text') return ''

    try {
      const content = JSON.parse(event.content)
      return content.text || ''
    } catch {
      return event.content || ''
    }
  }

  private async createNewSession(
    event: FeishuMessageEvent,
    config: FeishuConfig,
    preferredSpaceId?: string
  ): Promise<FeishuSessionMapping> {
    // Use configured default space, then renderer's active space, then skillsfan-temp fallback
    let spaceId = preferredSpaceId || config.defaultSpaceId || getActiveSpaceId()
    let conversation
    const initialTitle = `${this.getRemoteSourceLabel()}${this.getTitleSeparator()}${this.getRemoteChatLabel(event.chatType)}`
    try {
      conversation = createConversation(spaceId, initialTitle)
    } catch (err) {
      if (spaceId !== 'skillsfan-temp') {
        console.warn(`[FeishuChannel] Failed to create conversation in space ${spaceId}, fallback to skillsfan-temp`, err)
        spaceId = 'skillsfan-temp'
        conversation = createConversation(spaceId, initialTitle)
      } else {
        throw err
      }
    }

    const mapping: FeishuSessionMapping = {
      chatId: event.chatId,
      chatType: event.chatType,
      chatName: this.getRemoteChatLabel(event.chatType),
      spaceId,
      conversationId: conversation.id,
      openId: event.senderOpenId,
      pairedAt: Date.now(),
      lastMessageAt: Date.now()
    }

    this.sessionRouter.setSession(mapping)
    return mapping
  }

  private async resolveOrCreateSession(
    event: FeishuMessageEvent,
    config: FeishuConfig
  ): Promise<FeishuSessionMapping> {
    let session = this.sessionRouter.getSession(event.chatId)
    let preferredSpaceId: string | undefined

    if (session && !hasFeishuConversationTarget(session.spaceId, session.conversationId)) {
      preferredSpaceId = session.spaceId
      console.warn(
        `[FeishuChannel] Stale session mapping detected for chat ${event.chatId}, conversation ${session.conversationId}. Recreating session.`
      )
      this.sessionRouter.removeSession(event.chatId)
      session = null
    }

    if (!session) {
      session = await this.createNewSession(event, config, preferredSpaceId)
    }

    return session
  }

  // ============================================
  // Outbound: Agent -> Feishu
  // ============================================

  private async dispatchToChat(chatId: string, event: NormalizedOutboundEvent): Promise<void> {
    const convId = event.conversationId
    const payload = event.payload

    switch (event.type) {
      case 'agent:start': {
        // Send thinking card
        const locale = this.getLocaleTag()
        const msgId = await this.botService.sendCard(chatId, buildThinkingCard(locale))
        if (msgId) {
          this.thinkingCardIds.set(convId, msgId)
        }
        // Reset message buffer
        this.messageBuffers.set(convId, '')
        this.deliveredOutputs.delete(convId)
        this.deliveredReplyImages.delete(convId)
        this.approvedToolCalls.clear()
        this.activeTools.set(convId, [])
        break
      }

      case 'agent:message': {
        const text = (payload.text as string) || (payload.delta as string) || ''
        const isComplete = payload.isComplete as boolean

        if (!isComplete) {
          // Accumulate streaming text
          const existing = this.messageBuffers.get(convId) || ''
          this.messageBuffers.set(convId, existing + text)
        } else {
          // Final message - send the complete text
          const fullText = (this.messageBuffers.get(convId) || '') + text
          this.messageBuffers.delete(convId)

          if (fullText.trim()) {
            await this.sendFormattedMessage(chatId, fullText)
            this.deliveredOutputs.add(convId)
          }

          // Update thinking card to complete
          await this.clearThinkingCard(convId)
        }
        break
      }

      case 'agent:thought': {
        // Optionally show thought summary - skip for now to reduce noise
        break
      }

      case 'agent:tool-call': {
        const locale = this.getLocaleTag()
        const toolName = payload.name as string || 'unknown'
        const toolInput = payload.input as Record<string, unknown> | undefined
        const requiresApproval = payload.requiresApproval as boolean
        const toolCallId = payload.id as string || ''

        const approvalKey = toolCallId || `${convId}:${toolName}`

        // Skip tools that already have an approval card (prevents duplicate notification
        // from permission-handler + SDK stream both emitting agent:tool-call)
        if (this.approvedToolCalls.has(approvalKey)) {
          break
        }

        if (requiresApproval) {
          this.approvedToolCalls.add(approvalKey)
          const inputStr = toolInput ? JSON.stringify(toolInput, null, 2) : ''
          const approvalCardId = await this.botService.sendCard(
            chatId,
            buildToolApprovalCard(toolName, inputStr, convId, toolCallId, undefined, locale)
          )
          if (toolCallId && approvalCardId) {
            this.approvalCards.set(toolCallId, {
              messageId: approvalCardId,
              chatId,
              conversationId: convId,
              toolName
            })
            // Embed the message ID into button payload so future callbacks can still
            // patch the original card even if in-memory state is lost after restart.
            await this.botService.updateCard(
              approvalCardId,
              buildToolApprovalCard(toolName, inputStr, convId, toolCallId, approvalCardId, locale)
            ).catch((error) => {
              console.warn('[FeishuChannel] Failed to persist approval card message ID into button payload:', error)
            })
          }
        } else {
          // Suppress notifications for internal/high-frequency tools to reduce noise
          const SILENT_TOOLS = new Set([
            'TodoWrite', 'Read', 'Grep', 'Glob', 'Write', 'Edit',
            'ToolSearch', 'Skill', 'NotebookEdit'
          ])
          if (!SILENT_TOOLS.has(toolName)) {
            // Aggregate tool calls into the thinking card instead of sending separate messages
            const tools = upsertToolSummary(
              this.activeTools.get(convId) || [],
              summarizeToolCall(locale, toolName, toolInput)
            )
            this.activeTools.set(convId, tools)

            const thinkingMsgId = this.thinkingCardIds.get(convId)
            if (thinkingMsgId) {
              await this.botService.updateCard(
                thinkingMsgId,
                buildThinkingCardWithTools(
                  tools.map((tool) => tool.text),
                  locale
                )
              ).catch(() => { /* ignore update errors */ })
            }
          }
        }
        break
      }

      case 'agent:user-question': {
        const question = payload.question as string || ''
        const options = payload.options as string[] || []
        const questionId = payload.id as string || ''

        if (options.length > 0) {
          await this.botService.sendCard(
            chatId,
            buildUserQuestionCard(question, options, convId, questionId, this.getLocaleTag())
          )
        } else {
          await this.botService.sendText(chatId, `❓ ${question}`)
        }
        break
      }

      case 'agent:error': {
        const errorMsg = payload.error as string || payload.message as string || 'Unknown error'
        await this.botService.sendCard(chatId, buildErrorCard(errorMsg, this.getLocaleTag()))
        this.deliveredOutputs.add(convId)
        this.activeTools.delete(convId)
        await this.clearThinkingCard(convId, 'error')
        break
      }

      case 'agent:complete': {
        // Some failure paths only emit complete without agent:message.
        // Backfill with the latest assistant content so Feishu users can see the actual reason.
        const conversation = getConversation(event.spaceId, convId) as ConversationSnapshot | null
        const lastAssistant = conversation?.messages?.slice().reverse().find((msg) => msg.role === 'assistant')

        if (!this.deliveredOutputs.has(convId)) {
          const fallbackText = (lastAssistant?.content || '').trim()
          if (fallbackText) {
            await this.sendFormattedMessage(chatId, fallbackText)
            this.deliveredOutputs.add(convId)
          }
        }

        if (!this.deliveredReplyImages.has(convId)) {
          const replyImages = extractReplyImagesFromMessage(lastAssistant)
          if (replyImages.length > 0) {
            for (const image of replyImages) {
              try {
                const imageKey = await this.botService.uploadImage(image.buffer || image.filePath!)
                await this.botService.sendImage(chatId, imageKey)
              } catch (error) {
                console.warn('[FeishuChannel] Failed to send reply image to Feishu:', error)
              }
            }
          }
          this.deliveredReplyImages.add(convId)
        }

        this.activeTools.delete(convId)
        this.deliveredReplyImages.delete(convId)
        await this.clearThinkingCard(convId)
        this.deliveredOutputs.delete(convId)
        break
      }

      // Ignore other event types for Feishu
      default:
        break
    }
  }

  private async sendFormattedMessage(chatId: string, text: string): Promise<void> {
    const chunks = chunkMessage(text)

    for (const chunk of chunks) {
      const postContent = markdownToPost(chunk)
      await this.botService.sendPost(chatId, postContent)
    }
  }

  private async clearThinkingCard(
    conversationId: string,
    status: 'success' | 'error' = 'success'
  ): Promise<void> {
    const thinkingMsgId = this.thinkingCardIds.get(conversationId)
    if (thinkingMsgId) {
      try {
        await this.botService.updateCard(
          thinkingMsgId,
          status === 'error'
            ? buildFailedCard(this.getLocaleTag())
            : buildCompleteCard(this.getLocaleTag())
        )
      } catch {
        // Ignore errors updating the thinking card
      }
      this.thinkingCardIds.delete(conversationId)
    }
  }

  private cleanupProcessedMessages(): void {
    const now = Date.now()
    for (const [id, ts] of this.processedMessages) {
      if (now - ts > FeishuChannel.DEDUP_TTL_MS) {
        this.processedMessages.delete(id)
      }
    }
  }
}
