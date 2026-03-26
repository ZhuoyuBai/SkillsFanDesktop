/**
 * Agent Module - Message Utilities
 *
 * Utilities for building and parsing messages including:
 * - Multi-modal message construction (text + images)
 * - Canvas context formatting
 * - SDK message parsing into Thought objects
 */

import type { Thought, ImageAttachment, CanvasContext, Attachment, PdfAttachment, TextAttachment } from './types'
import { sanitizeWebSearchInput } from './tool-input-utils'
import {
  normalizeSdkStatusText,
  shouldSuppressSetModelStatus,
  stripLeadingSetModelStatus
} from '../../../shared/utils/sdk-status'

// ============================================
// Canvas Context Formatting
// ============================================

/**
 * Format Canvas Context for injection into user message
 * Returns empty string if no meaningful context to inject
 *
 * This provides AI awareness of what the user is currently viewing
 * in the content canvas (tabs, files, URLs, etc.)
 */
export function formatCanvasContext(canvasContext?: CanvasContext): string {
  if (!canvasContext?.isOpen || canvasContext.tabCount === 0) {
    return ''
  }

  const activeTab = canvasContext.activeTab
  const tabsSummary = canvasContext.tabs
    .map(t => `${t.isActive ? '▶ ' : '  '}${t.title} (${t.type})${t.path ? ` - ${t.path}` : ''}${t.url ? ` - ${t.url}` : ''}`)
    .join('\n')

  return `<halo_canvas>
Content canvas currently open in Halo:
- Total ${canvasContext.tabCount} tabs
- Active: ${activeTab ? `${activeTab.title} (${activeTab.type})` : 'None'}
${activeTab?.url ? `- URL: ${activeTab.url}` : ''}${activeTab?.path ? `- File path: ${activeTab.path}` : ''}

All tabs:
${tabsSummary}
</halo_canvas>

`
}

// ============================================
// Multi-Modal Message Building
// ============================================

/**
 * Build multi-modal message content for Claude API
 *
 * Supports three types of attachments:
 * - Images → Claude `image` content block (base64)
 * - PDFs → Claude `document` content block (base64)
 * - Text/Code → Prepended to message text with XML tags
 *
 * @param text - Text content of the message
 * @param images - Optional image attachments (legacy, backward compatible)
 * @param attachments - Optional general attachments (PDF, text, code)
 * @returns Plain text string or array of content blocks for multi-modal
 */
export function buildMessageContent(
  text: string,
  images?: ImageAttachment[],
  attachments?: Attachment[]
): string | Array<{ type: string; [key: string]: unknown }> {
  const hasImages = images && images.length > 0
  const hasAttachments = attachments && attachments.length > 0

  // Case 1: No attachments at all → plain text
  if (!hasImages && !hasAttachments) {
    return text
  }

  // Case 2: Only legacy images, no general attachments → existing behavior
  if (!hasAttachments && hasImages) {
    const contentBlocks: Array<{ type: string; [key: string]: unknown }> = []
    if (text.trim()) {
      contentBlocks.push({ type: 'text', text })
    }
    for (const image of images!) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType,
          data: image.data
        }
      })
    }
    return contentBlocks
  }

  // Case 3: General attachments (may include images, PDFs, text files)
  const allAttachments = attachments || []

  // Separate by type
  const imageAtts = allAttachments.filter(a => a.type === 'image') as ImageAttachment[]
  const pdfAtts = allAttachments.filter(a => a.type === 'pdf') as PdfAttachment[]
  const textAtts = allAttachments.filter(a => a.type === 'text') as TextAttachment[]

  // Also include legacy images
  if (hasImages) {
    for (const img of images!) {
      if (!imageAtts.some(a => a.id === img.id)) {
        imageAtts.push(img)
      }
    }
  }

  // Prepend text file contents as XML tags
  let enhancedText = text
  if (textAtts.length > 0) {
    const fileContents = textAtts.map(att => {
      const lang = att.language || ''
      return `<file name="${att.name}">\n\`\`\`${lang}\n${att.content}\n\`\`\`\n</file>`
    }).join('\n\n')
    enhancedText = `${fileContents}\n\n${text}`
  }

  // If only text attachments and no binary attachments, return as plain text
  if (imageAtts.length === 0 && pdfAtts.length === 0) {
    return enhancedText
  }

  // Build content blocks for multi-modal
  const contentBlocks: Array<{ type: string; [key: string]: unknown }> = []

  if (enhancedText.trim()) {
    contentBlocks.push({ type: 'text', text: enhancedText })
  }

  for (const img of imageAtts) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.data
      }
    })
  }

  for (const pdf of pdfAtts) {
    contentBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdf.data
      }
    })
  }

  return contentBlocks
}

/**
 * Hide noisy SDK status lines that don't help the user.
 */
export function shouldSuppressSdkStatus(statusText: string): boolean {
  return shouldSuppressSetModelStatus(normalizeSdkStatusText(statusText))
}

export function normalizeToolThoughtName(name?: string): string | undefined {
  if (!name) return name

  switch (name) {
    case 'web_search':
      return 'WebSearch'
    case 'web_fetch':
      return 'WebFetch'
    default:
      return name
  }
}

function isWebSearchToolName(name?: string): boolean {
  const normalizedName = normalizeToolThoughtName(name)
  return normalizedName === 'WebSearch' || normalizedName === 'mcp__web-tools__WebSearch'
}

export function normalizeToolThoughtInput(
  toolName: string | undefined,
  input: unknown
): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }

  const normalizedInput = input as Record<string, unknown>
  return isWebSearchToolName(toolName)
    ? sanitizeWebSearchInput(normalizedInput)
    : normalizedInput
}

function formatWebSearchResultContent(content: Array<Record<string, unknown>>): string {
  return content
    .map((item) => {
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const url = typeof item.url === 'string' ? item.url.trim() : ''
      if (title && url) return `${title} - ${url}`
      return title || url
    })
    .filter(Boolean)
    .join('\n')
}

export function serializeToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const webSearchResults = content.every((item) =>
      item && typeof item === 'object' && (item as Record<string, unknown>).type === 'web_search_result'
    )
    if (webSearchResults) {
      return formatWebSearchResultContent(content as Array<Record<string, unknown>>)
    }
  }

  if (content === undefined || content === null) {
    return ''
  }

  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function parseAssistantContentBlock(
  block: Record<string, any>,
  timestamp: string,
  parentToolId?: string
): Thought | null {
  if (block.type === 'thinking') {
    return {
      id: generateThoughtId(),
      type: 'thinking',
      content: block.thinking || '',
      timestamp
    }
  }

  if (block.type === 'tool_use' || block.type === 'server_tool_use') {
    const toolName = normalizeToolThoughtName(block.name)
    let toolInput = normalizeToolThoughtInput(toolName, block.input)
    const isSkillInvocation = Boolean(toolName && isSkillToolName(toolName))

    if (isSkillInvocation && toolInput) {
      toolInput = {
        ...toolInput,
        skill: typeof toolInput.skill === 'string'
          ? toolInput.skill
          : typeof toolInput.name === 'string'
            ? toolInput.name
            : undefined
      }
    }

    return {
      id: block.id || generateThoughtId(),
      type: 'tool_use',
      content: `Tool call: ${toolName || block.name || 'tool'}`,
      timestamp,
      toolName,
      toolInput,
      parentToolId,
      isSkillInvocation
    }
  }

  if (block.type === 'text') {
    const visibleText = stripLeadingSetModelStatus(block.text || '')
    if (!visibleText.trim()) {
      return null
    }

    return {
      id: generateThoughtId(),
      type: 'text',
      content: visibleText,
      timestamp
    }
  }

  if (block.type === 'web_search_tool_result') {
    return {
      id: block.tool_use_id || generateThoughtId(),
      type: 'tool_result',
      content: 'Tool execution succeeded',
      timestamp,
      toolName: 'WebSearch',
      toolOutput: serializeToolResultContent(block.content),
      isError: false,
      parentToolId
    }
  }

  return null
}

function parseUserContentBlock(
  block: Record<string, any>,
  timestamp: string,
  parentToolId?: string
): Thought | null {
  if (block.type !== 'tool_result') {
    return null
  }

  const isError = block.is_error || false
  const resultContent = serializeToolResultContent(block.content)

  return {
    id: block.tool_use_id || generateThoughtId(),
    type: 'tool_result',
    content: isError ? 'Tool execution failed' : 'Tool execution succeeded',
    timestamp,
    toolOutput: resultContent,
    isError,
    parentToolId
  }
}

export function parseSDKMessageThoughts(message: any, displayModel?: string, parentToolId?: string): Thought[] {
  const timestamp = new Date().toISOString()

  if (message.type === 'system') {
    if (message.subtype === 'init') {
      const modelName = displayModel || message.model || 'claude'
      return [{
        id: generateThoughtId(),
        type: 'system',
        content: `Connected | Model: ${modelName}`,
        timestamp
      }]
    }
    return []
  }

  if (message.type === 'assistant') {
    const content = message.message?.content
    if (!Array.isArray(content)) {
      return []
    }

    return content
      .map((block) => parseAssistantContentBlock(block as Record<string, any>, timestamp, parentToolId))
      .filter((thought): thought is Thought => thought !== null)
  }

  if (message.type === 'user') {
    const content = message.message?.content

    if (typeof content === 'string') {
      const match = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)
      if (match) {
        return [{
          id: generateThoughtId(),
          type: 'text',
          content: match[1].trim(),
          timestamp
        }]
      }
    }

    if (!Array.isArray(content)) {
      return []
    }

    return content
      .map((block) => parseUserContentBlock(block as Record<string, any>, timestamp, parentToolId))
      .filter((thought): thought is Thought => thought !== null)
  }

  if (message.type === 'result') {
    return [{
      id: generateThoughtId(),
      type: 'result',
      content: message.message?.result || message.result || '',
      timestamp,
      duration: message.duration_ms
    }]
  }

  return []
}

// ============================================
// SDK Message Parsing
// ============================================

/**
 * Generate a unique thought ID
 */
function generateThoughtId(): string {
  return `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function isSkillToolName(name: string): boolean {
  return name === 'Skill' || name === 'mcp__skill__Skill'
}

/**
 * Parse SDK message into a Thought object
 *
 * @param message - Raw SDK message
 * @param displayModel - The actual model name to display (user-configured model, not SDK's internal model)
 * @param parentToolId - Parent tool ID if this is a child tool call (e.g., inside a Skill)
 * @returns Thought object or null if message type is not relevant
 */
export function parseSDKMessage(message: any, displayModel?: string, parentToolId?: string): Thought | null {
  return parseSDKMessageThoughts(message, displayModel, parentToolId)[0] || null
}

// ============================================
// Token Usage Extraction
// ============================================

/**
 * Extract single API call usage from assistant message
 */
export function extractSingleUsage(assistantMsg: any): {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
} | null {
  const msgUsage = assistantMsg.message?.usage
  if (!msgUsage) return null

  return {
    inputTokens: msgUsage.input_tokens || 0,
    outputTokens: msgUsage.output_tokens || 0,
    cacheReadTokens: msgUsage.cache_read_input_tokens || 0,
    cacheCreationTokens: msgUsage.cache_creation_input_tokens || 0
  }
}

/**
 * Extract token usage from result message
 */
export function extractResultUsage(resultMsg: any, lastSingleUsage: ReturnType<typeof extractSingleUsage>): {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  contextWindow: number
} | null {
  const modelUsage = resultMsg.modelUsage as Record<string, { contextWindow?: number }> | undefined
  const totalCostUsd = resultMsg.total_cost_usd as number | undefined

  // Get context window from first model in modelUsage (usually only one model)
  let contextWindow = 200000  // Default to 200K
  if (modelUsage) {
    const firstModel = Object.values(modelUsage)[0]
    if (firstModel?.contextWindow) {
      contextWindow = firstModel.contextWindow
    }
  }

  // Use last API call usage (single) + cumulative cost
  if (lastSingleUsage) {
    return {
      ...lastSingleUsage,
      totalCostUsd: totalCostUsd || 0,
      contextWindow
    }
  }

  // Fallback: If no assistant message, use result.usage (cumulative, less accurate but has data)
  const usage = resultMsg.usage as {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  } | undefined

  if (usage) {
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      totalCostUsd: totalCostUsd || 0,
      contextWindow
    }
  }

  return null
}
