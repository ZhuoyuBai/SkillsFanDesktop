/**
 * Conversation List - Resizable sidebar for multiple conversations
 * Supports drag-to-resize, inline title editing, and conversation management
 * Can be collapsed to show only icons
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationMeta } from '../../types'
import { MessageSquare } from '../icons/ToolIcons'
import { PanelLeftClose, PanelLeft, Search, SquarePen } from 'lucide-react'
import { HaloLogo } from '../brand/HaloLogo'
import { useSearchStore } from '../../stores/search.store'
import { useTranslation } from '../../i18n'
import { UserAvatarMenu } from './UserAvatarMenu'

// Width constraints (in pixels)
const MIN_WIDTH = 160 // Allow smaller width
const MAX_WIDTH = 400
const COLLAPSED_WIDTH = 48 // Width when collapsed (icon only)
const WIDTH_RATIO = 0.15 // 15% of window width

// Calculate width based on window width (clamped to constraints)
function calculateWidth(windowWidth: number): number {
  const targetWidth = Math.round(windowWidth * WIDTH_RATIO)
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, targetWidth))
}

function getDefaultWidth(): number {
  if (typeof window === 'undefined') return 240
  return calculateWidth(window.innerWidth)
}

interface ConversationListProps {
  conversations: ConversationMeta[]
  currentConversationId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete?: (id: string) => void
  onRename?: (id: string, newTitle: string) => void
  onClearAll?: () => void  // Clear all task history
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  isMobileOverlay?: boolean  // Mobile overlay mode - full width, no drag resize
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onClearAll,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOverlay = false
}: ConversationListProps) {
  const { t } = useTranslation()
  const [width, setWidth] = useState(getDefaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [hasUserResized, setHasUserResized] = useState(false) // Track if user manually resized

  // Update width when window resizes (only if user hasn't manually resized)
  useEffect(() => {
    if (hasUserResized) return

    const handleResize = () => {
      setWidth(calculateWidth(window.innerWidth))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [hasUserResized])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Handle drag resize (disabled in mobile overlay mode)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobileOverlay) return  // Disable drag on mobile overlay
    e.preventDefault()
    setIsDragging(true)
  }, [isMobileOverlay])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left
      const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
      setWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setHasUserResized(true) // User manually resized, stop auto-resize
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return t('Today')
    }

    return `${date.getMonth() + 1}-${date.getDate()}`
  }

  // Start editing a conversation title
  const handleStartEdit = (e: React.MouseEvent, conv: ConversationMeta) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditingTitle(conv.title || '')
  }

  // Save edited title
  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim() && onRename) {
      onRename(editingId, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  // Handle input key events
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  // Get search store
  const { openSearch } = useSearchStore()

  // Collapsed view - show only icons
  if (isCollapsed) {
    return (
      <div
        className="border-r border-border/40 flex flex-col bg-card relative"
        style={{ width: COLLAPSED_WIDTH }}
      >
        {/* Toggle button (no logo in collapsed state) */}
        <div className="px-2 py-3 border-b border-border/50 flex flex-col items-center">
          {onToggleCollapse && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowCollapseTooltip(false)
                  onToggleCollapse()
                }}
                onMouseEnter={() => setShowCollapseTooltip(true)}
                onMouseLeave={() => setShowCollapseTooltip(false)}
                className="p-2 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
                aria-label={t('Expand sidebar')}
                aria-expanded={false}
              >
                <PanelLeft size={20} />
              </button>
              {showCollapseTooltip && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                  <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
                    <span className="text-sm font-medium text-foreground">{t('Expand sidebar')}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* New conversation button (icon only) */}
        <div className="px-2 py-2 flex flex-col items-center gap-1">
          <button
            onClick={onNew}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
            title={t('New conversation')}
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={() => openSearch('global')}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
            title={t('Search')}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Collapsed conversation icons */}
        <div className="flex-1 overflow-auto py-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              role="button"
              tabIndex={0}
              aria-label={conversation.title}
              aria-selected={conversation.id === currentConversationId}
              onClick={() => onSelect(conversation.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(conversation.id)
                }
              }}
              className={`w-full p-2 flex justify-center cursor-pointer
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset
                ${conversation.id === currentConversationId
                  ? 'bg-primary/8'
                  : 'hover:bg-secondary/40'
                }`}
              title={conversation.title}
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>

        {/* User avatar menu (collapsed) */}
        <UserAvatarMenu collapsed={true} />
      </div>
    )
  }

  // Expanded view
  return (
    <div
      ref={containerRef}
      className={`flex flex-col relative ${isMobileOverlay ? 'bg-background flex-1' : 'border-r border-border/40 bg-card'}`}
      style={isMobileOverlay ? undefined : {
        width,
        transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: isDragging ? 'width' : 'auto'
      }}
    >
      {/* Header with logo and toggle button - hidden in mobile overlay (header is provided by parent) */}
      {!isMobileOverlay && (
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HaloLogo size={26} hoverOnly={true} />
          <span className="text-base font-medium text-foreground/80">技能范</span>
        </div>
        {onToggleCollapse && (
          <div className="relative">
            <button
              onClick={() => {
                setShowCollapseTooltip(false)
                onToggleCollapse()
              }}
              onMouseEnter={() => setShowCollapseTooltip(true)}
              onMouseLeave={() => setShowCollapseTooltip(false)}
              className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              aria-label={t('Collapse sidebar')}
              aria-expanded={true}
            >
              <PanelLeftClose size={18} />
            </button>
            {showCollapseTooltip && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-foreground">{t('Collapse sidebar')}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* New conversation + Search buttons */}
      <div className="px-4 py-3 border-b border-border/50 space-y-2">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-start gap-2 px-2 py-1.5
            text-sm font-medium text-foreground hover:bg-muted/60
            rounded transition-all duration-150
            active:scale-[0.98]"
        >
          <SquarePen className="w-4 h-4 text-foreground" />
          {t('New conversation')}
        </button>
        <button
          onClick={() => openSearch('global')}
          className="w-full flex items-center justify-start gap-2 px-2 py-1.5
            text-sm text-foreground hover:bg-muted/50
            rounded transition-all duration-150"
        >
          <Search className="w-4 h-4 text-foreground" />
          {t('Search')}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {t('Task history')}
          </span>
          {onClearAll && conversations.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded transition-colors"
              title={t('Clear all tasks')}
              aria-label={t('Clear all tasks')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            role="button"
            tabIndex={0}
            aria-label={`${conversation.title}, ${formatDate(conversation.updatedAt)}`}
            aria-selected={conversation.id === currentConversationId}
            onClick={() => editingId !== conversation.id && onSelect(conversation.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && editingId !== conversation.id) {
                e.preventDefault()
                onSelect(conversation.id)
              }
            }}
            className={`w-full px-4 py-2.5 text-left cursor-pointer group relative
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset
              ${conversation.id === currentConversationId
                ? 'bg-gradient-to-r from-primary/8 via-primary/5 to-transparent'
                : 'hover:bg-secondary/40'
              }`}
          >
            {/* Edit mode */}
            {editingId === conversation.id ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleSaveEdit}
                  className="flex-1 text-sm bg-input border border-border rounded px-2 py-1 focus:outline-none focus:border-primary min-w-0"
                  placeholder={t('Conversation title...')}
                />
                <button
                  onClick={handleSaveEdit}
                  className="p-1 hover:bg-secondary text-foreground rounded transition-colors flex-shrink-0"
                  title={t('Save')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm truncate flex-1 min-w-0">
                    {conversation.title}
                  </span>
                  {/* Action buttons (on hover) */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    {onRename && (
                      <button
                        onClick={(e) => handleStartEdit(e, conversation)}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
                        title={t('Edit title')}
                        aria-label={t('Edit title')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(conversation.id)
                        }}
                        className="p-1.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded transition-colors"
                        title={t('Delete conversation')}
                        aria-label={t('Delete conversation')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDate(conversation.updatedAt)}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* User avatar menu (expanded) */}
      <UserAvatarMenu collapsed={false} />

      {/* Drag handle - on right side (hidden in mobile overlay mode) */}
      {!isMobileOverlay && (
        <div
          className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group/handle
            transition-all duration-200
            ${isDragging ? 'bg-border/40' : ''}`}
          onMouseDown={handleMouseDown}
          title={t('Drag to resize width')}
        >
          {/* Visual hint line */}
          <div className="absolute inset-y-1/3 left-1/2 -translate-x-1/2 w-0.5 bg-border/60 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  )
}
