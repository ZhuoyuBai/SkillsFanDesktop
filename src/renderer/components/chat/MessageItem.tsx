/**
 * MessageItem - Single message display with enhanced streaming visualization
 * Includes collapsible thought process and file changes footer for assistant messages
 *
 * Working State Design:
 * - During generation: subtle breathing glow + "AI working" indicator
 * - The indicator is gentle, not intrusive, letting user focus on content
 * - When complete: indicator fades out smoothly
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Lightbulb,
  Wrench,
  CheckCircle2,
  XCircle,
  Info,
  FileText,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react'
import { getToolIcon } from '../icons/ToolIcons'
import { BrowserTaskCard, isBrowserTool } from '../tool/BrowserTaskCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { CompactTextRenderer } from './CompactTextRenderer'
import { FileChangesFooter } from '../diff'
import { MessageAttachments } from './AttachmentPreview'
import { HaloLogo } from '../brand/HaloLogo'
import type { Message, Thought } from '../../types'
import { useTranslation } from '../../i18n'
import {
  getLatestVisibleActiveToolUseIds,
  getMatchingToolResult
} from '../../../shared/utils/thought-dedupe'
import { shouldUseCompactLogText } from '../../utils/message-text-rendering'
import { normalizeAssistantContent } from '../../../shared/utils/assistant-content'

interface MessageItemProps {
  message: Message
  hideThoughts?: boolean
  isInContainer?: boolean
  isWorking?: boolean  // True when AI is still generating (not yet complete)
  isWaitingMore?: boolean  // True when content paused (e.g., during tool call), show "..." animation
}

// Collapsible thought history component
function ThoughtHistory({ thoughts }: { thoughts: Thought[] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()

  // Filter out result type (final reply is in message bubble)
  const displayThoughts = thoughts.filter(t => t.type !== 'result')

  if (displayThoughts.length === 0) return null

  // Stats
  const thinkingCount = thoughts.filter(t => t.type === 'thinking').length
  const toolCount = thoughts.filter(t => t.type === 'tool_use').length

  return (
    <div className="mt-3 border-t border-border/20 pt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span>{t('View thought process')}</span>
        <span className="text-muted-foreground/50">
          ({thinkingCount > 0 && `${thinkingCount} ${t('thoughts')}`}
          {thinkingCount > 0 && toolCount > 0 && ', '}
          {toolCount > 0 && `${toolCount} ${t('tools')}`})
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2 animate-slide-down">
          {displayThoughts.map((thought) => (
            <ThoughtItem key={thought.id} thought={thought} />
          ))}
        </div>
      )}
    </div>
  )
}

// Compact display for web tools (WebFetch / WebSearch)
function WebToolCompactItem({ thought }: { thought: Thought }) {
  const { t } = useTranslation()
  const Icon = getToolIcon(thought.toolName!)
  const input = thought.toolInput || {}

  let summary = ''
  if (thought.toolName === 'WebFetch') {
    const url = String(input.url || '')
    try {
      summary = new URL(url).hostname.replace('www.', '')
    } catch {
      summary = url.slice(0, 30)
    }
  } else {
    summary = String(input.query || '').slice(0, 30)
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
      <CheckCircle2 size={12} className="text-muted-foreground/50 flex-shrink-0" />
      <Icon size={12} className="flex-shrink-0" />
      <span className="truncate">
        {thought.toolName === 'WebFetch'
          ? t('Fetched {{url}}', { url: summary })
          : t('Searched {{query}}', { query: summary })}
      </span>
    </div>
  )
}

// Single thought item
function ThoughtItem({ thought }: { thought: Thought }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()

  // Compact one-line display for web tools
  if (thought.type === 'tool_use' && (thought.toolName === 'WebFetch' || thought.toolName === 'WebSearch')) {
    return <WebToolCompactItem thought={thought} />
  }

  const getTypeInfo = () => {
    switch (thought.type) {
      case 'thinking':
        return { label: t('Thinking'), color: 'text-muted-foreground', Icon: Lightbulb }
      case 'tool_use':
        return {
          label: `${t('Calling')} ${thought.toolName}`,
          color: 'text-blue-400',
          Icon: thought.toolName ? getToolIcon(thought.toolName) : Wrench
        }
      case 'tool_result':
        return {
          label: t('Tool result'),
          color: thought.isError ? 'text-red-400' : 'text-green-400',
          Icon: thought.isError ? XCircle : CheckCircle2
        }
      case 'system':
        return { label: t('System'), color: 'text-muted-foreground', Icon: Info }
      case 'error':
        return { label: t('Error'), color: 'text-red-400', Icon: XCircle }
      default:
        return { label: thought.type, color: 'text-muted-foreground', Icon: FileText }
    }
  }

  const info = getTypeInfo()
  const content = thought.type === 'tool_use'
    ? JSON.stringify(thought.toolInput, null, 2)
    : thought.type === 'tool_result'
      ? thought.toolOutput
      : thought.content

  const previewLength = 100
  const needsTruncate = content && content.length > previewLength

  return (
    <div className="flex gap-2 text-xs">
      <info.Icon size={14} className={info.color} />
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${info.color}`}>{info.label}</span>
        {content && (
          <div className="mt-0.5 text-muted-foreground/70">
            <span className="whitespace-pre-wrap break-words">
              {isExpanded || !needsTruncate ? content : content.substring(0, previewLength) + '...'}
            </span>
            {needsTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-1 text-primary/60 hover:text-primary"
              >
                {isExpanded ? t('Collapse') : t('Expand')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function MessageItem({ message, hideThoughts = false, isInContainer = false, isWorking = false, isWaitingMore = false }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isStreaming = (message as any).isStreaming
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()
  const userAttachments = useMemo(() => {
    if (!isUser) return []
    if (message.attachments && message.attachments.length > 0) return message.attachments
    return message.images || []
  }, [isUser, message.attachments, message.images])

  const normalizedAssistantContent = useMemo(() => {
    if (isUser || !message.content) return message.content
    return normalizeAssistantContent(message.content)
  }, [isUser, message.content])

  // Handle copying message content to clipboard
  const handleCopyMessage = useCallback(async () => {
    if (!normalizedAssistantContent) return
    try {
      await navigator.clipboard.writeText(normalizedAssistantContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }, [normalizedAssistantContent])

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Right-click context menu for selected text
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString()
    if (selection && selection.trim()) {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }
  }, [])

  // Copy selected text from context menu
  const handleCopySelection = useCallback(async () => {
    const selection = window.getSelection()?.toString()
    if (!selection) return
    try {
      await navigator.clipboard.writeText(selection)
      setContextMenu(null)
    } catch (err) {
      console.error('Failed to copy selection:', err)
    }
  }, [])

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!contextMenu) return
    const handleClose = () => setContextMenu(null)
    document.addEventListener('mousedown', handleClose)
    document.addEventListener('scroll', handleClose, true)
    return () => {
      document.removeEventListener('mousedown', handleClose)
      document.removeEventListener('scroll', handleClose, true)
    }
  }, [contextMenu])

  // Extract browser tools from thoughts (tool_use type with browser tool names)
  // Note: Tool calls are stored in thoughts, not in message.toolCalls
  const browserToolCalls = useMemo(() => {
    const thoughts = message.thoughts || []
    const visibleActiveToolUseIds = getLatestVisibleActiveToolUseIds(thoughts)
    return thoughts
      .filter(t =>
        t.type === 'tool_use' &&
        t.toolName &&
        isBrowserTool(t.toolName) &&
        (getMatchingToolResult(thoughts, t) || visibleActiveToolUseIds.has(t.id))
      )
      .map(t => ({
        id: t.id,
        name: t.toolName!,
        status: getMatchingToolResult(thoughts, t)?.isError
          ? 'error' as const
          : getMatchingToolResult(thoughts, t)
            ? 'success' as const
            : 'running' as const,
        input: t.toolInput || {},
      }))
  }, [message.thoughts])

  // Check if there are running browser tools (based on isWorking state)
  const hasBrowserActivity = isWorking && browserToolCalls.length > 0
  const hasMessageContent = Boolean(message.content)
  const shouldRenderShell = isUser
    || hasMessageContent
    || Boolean(isStreaming)
    || Boolean(isWaitingMore)
    || userAttachments.length > 0

  // Extract file paths from thoughts for clickable file links in markdown
  const filePathMap = useMemo(() => {
    const thoughts = message.thoughts || []
    const map: Record<string, string> = {}
    for (const t of thoughts) {
      if (t.type === 'tool_use' && (t.toolName === 'Write' || t.toolName === 'Edit' || t.toolName === 'Read')) {
        const filePath = (t.toolInput as Record<string, unknown>)?.file_path as string
        if (filePath) {
          const fileName = filePath.split('/').pop() || filePath
          map[fileName] = filePath
          map[filePath] = filePath
        }
      }
    }
    return Object.keys(map).length > 0 ? map : undefined
  }, [message.thoughts])

  const useCompactLogRenderer = useMemo(() => {
    if (isUser || !normalizedAssistantContent) {
      return false
    }
    return shouldUseCompactLogText(normalizedAssistantContent)
  }, [isUser, normalizedAssistantContent])

  const auxiliaryContent = (
    <>
      {browserToolCalls.length > 0 && (
        <BrowserTaskCard
          browserToolCalls={browserToolCalls}
          isActive={isWorking || hasBrowserActivity}
        />
      )}

      {!hideThoughts && !isUser && message.thoughts && message.thoughts.length > 0 && (
        <ThoughtHistory thoughts={message.thoughts} />
      )}

      {!isUser && message.thoughts && message.thoughts.length > 0 && (
        <FileChangesFooter thoughts={message.thoughts} />
      )}
    </>
  )

  // CLI-style message content
  const messageContent = shouldRenderShell ? (
    <div
      onContextMenu={handleContextMenu}
      className={`flex items-start gap-2.5 py-2 px-3 overflow-y-hidden overflow-x-auto w-full rounded ${
        isUser ? 'bg-muted/15' : 'bg-muted/8'
      }`}
    >
      {/* CLI indicator */}
      <span className={`flex-shrink-0 text-[13px] leading-relaxed select-none ${
        isUser ? 'text-foreground' : 'text-orange-400'
      }`}>
        {isUser ? '❯' : '⏺'}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* User message attachments (displayed before text) */}
        {isUser && userAttachments.length > 0 && (
          <MessageAttachments attachments={userAttachments} />
        )}

        {/* Message content */}
        <div className="break-words leading-relaxed text-[13px]" data-message-content>
          {hasMessageContent && (
            isUser ? (
              <span className="whitespace-pre-wrap text-foreground">{message.content}</span>
            ) : useCompactLogRenderer ? (
              <CompactTextRenderer content={normalizedAssistantContent} />
            ) : (
              <MarkdownRenderer content={normalizedAssistantContent} filePathMap={filePathMap} />
            )
          )}
          {isStreaming && (
            <span className="inline-flex items-center ml-1 align-middle">
              <HaloLogo size={16} animated={true} />
            </span>
          )}
          {isWaitingMore && !isStreaming && (
            <span className="inline-flex items-center ml-1 align-middle">
              <HaloLogo size={16} animated={true} />
            </span>
          )}
        </div>

        {auxiliaryContent}
      </div>
    </div>
  ) : (
    <div className="pl-7 pr-3 py-1">
      {auxiliaryContent}
    </div>
  )

  // Hover action buttons
  const actionButtons = normalizedAssistantContent ? (
    <div className="absolute top-1 right-0 opacity-0 group-hover:opacity-100
      flex items-center gap-0.5 bg-background border border-border shadow-sm
      rounded-lg p-0.5 transition-all z-10">
      <button
        onClick={handleCopyMessage}
        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title={t('Copy message')}
      >
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  ) : null

  // Right-click context menu portal
  const contextMenuPortal = contextMenu ? createPortal(
    <div
      className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleCopySelection}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent rounded transition-colors"
      >
        <Copy size={14} />
        <span>{t('Copy')}</span>
      </button>
    </div>,
    document.body
  ) : null

  // When in container, just return without wrapper
  if (isInContainer) {
    return (
      <div data-message-id={message.id}>
        <div className="relative group">
          {messageContent}
          {actionButtons}
        </div>
        {contextMenuPortal}
      </div>
    )
  }

  // Normal case: left-aligned CLI style
  return (
    <div
      className="animate-fade-in"
      data-message-id={message.id}
    >
      <div className="relative group">
        {messageContent}
        {actionButtons}
      </div>
      {contextMenuPortal}
    </div>
  )
}
