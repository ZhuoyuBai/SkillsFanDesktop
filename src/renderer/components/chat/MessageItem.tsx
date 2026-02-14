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
import { FileChangesFooter } from '../diff'
import { MessageImages } from './ImageAttachmentPreview'
import { HaloLogo } from '../brand/HaloLogo'
import type { Message, Thought } from '../../types'
import { useTranslation } from '../../i18n'

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

// Single thought item
function ThoughtItem({ thought }: { thought: Thought }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()

  const getTypeInfo = () => {
    switch (thought.type) {
      case 'thinking':
        return { label: t('Thinking'), color: 'text-muted-foreground', Icon: Lightbulb }
      case 'tool_use':
        return {
          label: `${t('Calling')} ${thought.toolName}`,
          color: 'text-amber-400',
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

  // Handle copying message content to clipboard
  const handleCopyMessage = useCallback(async () => {
    if (!message.content) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }, [message.content])

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
    return thoughts
      .filter(t => t.type === 'tool_use' && t.toolName && isBrowserTool(t.toolName))
      .map(t => ({
        id: t.id,
        name: t.toolName!,
        status: 'success' as const,  // Thoughts are recorded after completion
        input: t.toolInput || {},
      }))
  }, [message.thoughts])

  // Check if there are running browser tools (based on isWorking state)
  const hasBrowserActivity = isWorking && browserToolCalls.length > 0

  // Message bubble content
  const bubble = (
    <div
      onContextMenu={handleContextMenu}
      className={`rounded-2xl px-4 py-3 overflow-y-hidden overflow-x-auto w-full ${
        isUser ? 'message-user' : 'message-assistant'
      } ${isStreaming ? 'streaming-message' : ''} ${isWorking ? 'message-working' : ''}`}
    >
      {/* Working indicator - shows when AI is working */}
      {isWorking && !isUser && (
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/20 working-indicator-fade">
          <Sparkles size={12} className="text-primary/60 animate-pulse-gentle" />
          <span className="text-xs text-muted-foreground/70">{t('Halo is working')}</span>
        </div>
      )}

      {/* User message images (displayed before text) */}
      {isUser && message.images && message.images.length > 0 && (
        <MessageImages images={message.images} />
      )}

      {/* Message content with streaming cursor */}
      <div className="break-words leading-relaxed" data-message-content>
        {message.content && (
          isUser ? (
            // User messages: simple whitespace-preserving text
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            // Assistant messages: full markdown rendering
            <MarkdownRenderer content={message.content} />
          )
        )}
        {/* Streaming logo animation when actively receiving tokens */}
        {isStreaming && (
          <span className="inline-flex items-center ml-1 align-middle">
            <HaloLogo size={16} animated={true} />
          </span>
        )}
        {/* Waiting logo when content paused but still working (e.g., tool call in progress) */}
        {isWaitingMore && !isStreaming && (
          <span className="inline-flex items-center ml-1 align-middle">
            <HaloLogo size={16} animated={true} />
          </span>
        )}
      </div>

      {/* Browser task card - browser tools displayed separately */}
      {browserToolCalls.length > 0 && (
        <BrowserTaskCard
          browserToolCalls={browserToolCalls}
          isActive={isWorking || hasBrowserActivity}
        />
      )}

      {/* Thought history - only for assistant messages with thoughts (when not hidden) */}
      {!hideThoughts && !isUser && message.thoughts && message.thoughts.length > 0 && (
        <ThoughtHistory thoughts={message.thoughts} />
      )}

      {/* File changes footer - only for assistant messages with thoughts */}
      {!isUser && message.thoughts && message.thoughts.length > 0 && (
        <FileChangesFooter thoughts={message.thoughts} />
      )}

    </div>
  )

  // Hover copy button - shown on all messages with content
  const copyButton = message.content ? (
    <button
      onClick={handleCopyMessage}
      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100
        p-1.5 rounded-lg bg-background border border-border shadow-sm
        text-muted-foreground hover:text-foreground transition-all z-10"
      title={t('Copy message')}
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
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

  // When in container, just return the bubble without wrapper
  if (isInContainer) {
    return (
      <div data-message-id={message.id}>
        <div className="relative group">
          {bubble}
          {copyButton}
        </div>
        {contextMenuPortal}
      </div>
    )
  }

  // Normal case: wrap with flex container
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
      data-message-id={message.id}
    >
      <div className="relative group max-w-[85%]">
        {bubble}
        {copyButton}
      </div>
      {contextMenuPortal}
    </div>
  )
}
