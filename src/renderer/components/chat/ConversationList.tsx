/**
 * Conversation List - Resizable sidebar for multiple conversations
 * Supports drag-to-resize, inline title editing, and conversation management
 * Can be collapsed to show only icons
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationMeta } from '../../types'
import { MessageSquare, Plus } from '../icons/ToolIcons'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '../../i18n'

// Width constraints (in pixels)
const MIN_WIDTH = 140
const MAX_WIDTH = 320
const DEFAULT_WIDTH = 192 // w-48 = 12rem = 192px
const COLLAPSED_WIDTH = 48 // Width when collapsed (icon only)

interface ConversationListProps {
  conversations: ConversationMeta[]
  currentConversationId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete?: (id: string) => void
  onRename?: (id: string, newTitle: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  isCollapsed = false,
  onToggleCollapse
}: ConversationListProps) {
  const { t } = useTranslation()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Handle drag resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

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

  // Collapsed view - show only icons
  if (isCollapsed) {
    return (
      <div
        className="border-r border-border flex flex-col bg-card/50 relative"
        style={{ width: COLLAPSED_WIDTH }}
      >
        {/* Toggle button */}
        {onToggleCollapse && (
          <div className="px-2 py-3 border-b border-border flex justify-center">
            <button
              onClick={onToggleCollapse}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              title={t('Expand')}
              aria-label={t('Expand sidebar')}
              aria-expanded={false}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* New conversation button (icon only) */}
        <div className="px-2 py-3 border-b border-border flex justify-center">
          <button
            onClick={onNew}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
            title={t('New conversation')}
          >
            <Plus className="w-4 h-4" />
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
                  ? 'bg-primary/8 border-l-2 border-primary/70'
                  : 'hover:bg-secondary/40 border-l-2 border-transparent'
                }`}
              title={conversation.title}
            >
              <MessageSquare className="w-4 h-4 text-orange-500" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Expanded view
  return (
    <div
      ref={containerRef}
      className="border-r border-border flex flex-col bg-card/50 relative"
      style={{
        width,
        transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: isDragging ? 'width' : 'auto'
      }}
    >
      {/* Header with toggle button */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{t('Conversations')}</span>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title={t('Collapse')}
            aria-label={t('Collapse sidebar')}
            aria-expanded={true}
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* New conversation button */}
      <div className="px-4 py-3 border-b border-border">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5
            text-sm font-medium text-primary
            bg-primary/8 hover:bg-primary/15
            border border-primary/20 hover:border-primary/30
            rounded-lg transition-all duration-200
            shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          {t('New conversation')}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto py-2">
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
                ? 'bg-gradient-to-r from-primary/8 via-primary/5 to-transparent border-l-2 border-primary/70'
                : 'hover:bg-secondary/40 border-l-2 border-transparent'
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
                  className="p-1 hover:bg-primary/20 text-primary rounded transition-colors flex-shrink-0"
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
                  <MessageSquare className="w-4 h-4 text-orange-500 flex-shrink-0 -mt-px" />
                  <span className="text-sm truncate flex-1 min-w-0">
                    {conversation.title}
                  </span>
                  {/* Action buttons (on hover) */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    {onRename && (
                      <button
                        onClick={(e) => handleStartEdit(e, conversation)}
                        className="p-1.5 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded transition-colors"
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

      {/* Drag handle - on right side */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group/handle
          transition-all duration-200
          ${isDragging ? 'bg-primary/60' : 'hover:bg-primary/40'}`}
        onMouseDown={handleMouseDown}
        title={t('Drag to resize width')}
      >
        {/* Visual hint line */}
        <div className="absolute inset-y-1/3 left-1/2 -translate-x-1/2 w-0.5 bg-border/60 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}
