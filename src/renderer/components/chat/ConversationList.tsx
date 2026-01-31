/**
 * Conversation List - Resizable sidebar for multiple conversations
 * Supports drag-to-resize, inline title editing, and conversation management
 * Can be collapsed to show only icons
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationMeta } from '../../types'
import { MessageSquare } from '../icons/ToolIcons'
import { PanelLeftClose, PanelLeft, SquarePen, Zap, ChevronRight } from 'lucide-react'
import { useSearchStore } from '../../stores/search.store'
import { SpaceSwitcher } from '../space/SpaceSwitcher'
import { useTranslation } from '../../i18n'
import { UserAvatarMenu } from './UserAvatarMenu'
import { useLoopTaskStore } from '../../stores/loop-task.store'
import { useChatStore } from '../../stores/chat.store'
import { LoopTaskItem } from '../loop-task/LoopTaskItem'

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
  onClearAll?: () => void  // Clear all normal tasks
  onClearAllAdvanced?: () => void  // Clear all advanced tasks
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  isMobileOverlay?: boolean  // Mobile overlay mode - full width, no drag resize
  spaceId?: string  // Current space ID for loop tasks
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onClearAll,
  onClearAllAdvanced,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOverlay = false,
  spaceId
}: ConversationListProps) {
  const { t } = useTranslation()
  const [width, setWidth] = useState(getDefaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [hasUserResized, setHasUserResized] = useState(false) // Track if user manually resized

  // Loop task store
  const {
    getTasks,
    getCurrentTaskId,
    selectTask,
    renameTask,
    deleteTask,
    startEditing,
    setCurrentSpace,
    loadTasks
  } = useLoopTaskStore()

  // Chat store for selection type
  const { setSelectionType, getSelectionType } = useChatStore()

  // Get loop tasks for current space
  const loopTasks = getTasks()
  const currentTaskId = getCurrentTaskId()
  const selectionType = getSelectionType()

  // Load loop tasks when space changes
  useEffect(() => {
    if (spaceId) {
      setCurrentSpace(spaceId)
      loadTasks(spaceId)
    }
  }, [spaceId, setCurrentSpace, loadTasks])

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
  const [isNormalTasksExpanded, setIsNormalTasksExpanded] = useState(true)
  const [isAdvancedTasksExpanded, setIsAdvancedTasksExpanded] = useState(true)
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

  // Handle conversation selection (set selection type)
  const handleSelectConversation = (id: string) => {
    setSelectionType('conversation')
    onSelect(id)
  }

  // Handle loop task selection
  const handleSelectLoopTask = (taskId: string) => {
    setSelectionType('loopTask')
    selectTask(taskId)
  }

  // Handle new loop task
  const handleNewLoopTask = () => {
    setSelectionType('loopTask')
    startEditing()
  }

  // Handle rename loop task
  const handleRenameLoopTask = (taskId: string, name: string) => {
    if (spaceId) {
      renameTask(spaceId, taskId, name)
    }
  }

  // Handle delete loop task
  const handleDeleteLoopTask = (taskId: string) => {
    if (spaceId) {
      deleteTask(spaceId, taskId)
    }
  }

  // Collapsed view - show only icons
  if (isCollapsed) {
    return (
      <div
        className="border-r border-border/40 flex flex-col bg-card relative"
        style={{ width: COLLAPSED_WIDTH }}
      >
        {/* Space switcher and toggle button in collapsed state */}
        <div className="px-2 py-3 border-b border-border/50 flex flex-col items-center gap-2">
          <SpaceSwitcher collapsed={true} />
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

        {/* New conversation + Advanced task buttons (icon only) */}
        <div className="px-2 py-2 flex flex-col items-center gap-1">
          <button
            onClick={() => {
              setIsNormalTasksExpanded(true)
              setIsAdvancedTasksExpanded(false)
              onNew()
            }}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
            title={t('New conversation')}
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setIsNormalTasksExpanded(false)
              setIsAdvancedTasksExpanded(true)
              handleNewLoopTask()
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
            title={t('Advanced task')}
          >
            <Zap className="w-4 h-4" />
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
              aria-selected={conversation.id === currentConversationId && selectionType === 'conversation'}
              onClick={() => handleSelectConversation(conversation.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectConversation(conversation.id)
                }
              }}
              className={`w-full p-2 flex justify-center cursor-pointer
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset
                ${conversation.id === currentConversationId && selectionType === 'conversation'
                  ? 'bg-primary/8'
                  : 'hover:bg-secondary/40'
                }`}
              title={conversation.title}
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}

          {/* Advanced tasks section (collapsed) */}
          {loopTasks.length > 0 && (
            <>
              <div className="border-t border-border/50 my-2" />
              {loopTasks.map((task) => (
                <LoopTaskItem
                  key={task.id}
                  task={task}
                  isActive={task.id === currentTaskId && selectionType === 'loopTask'}
                  onSelect={() => handleSelectLoopTask(task.id)}
                  onRename={(name) => handleRenameLoopTask(task.id, name)}
                  onDelete={() => handleDeleteLoopTask(task.id)}
                  isCollapsed={true}
                />
              ))}
            </>
          )}
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
      {/* Header with space switcher and toggle button - hidden in mobile overlay (header is provided by parent) */}
      {!isMobileOverlay && (
      <div className="px-3 py-3 border-b border-border/50 flex items-center gap-2">
        <SpaceSwitcher />
        {onToggleCollapse && (
          <div className="relative flex-shrink-0">
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

      {/* New conversation + Advanced task buttons */}
      <div className="px-4 py-3 border-b border-border/50 space-y-2">
        <button
          onClick={() => {
            setIsNormalTasksExpanded(true)
            setIsAdvancedTasksExpanded(false)
            onNew()
          }}
          className="w-full flex items-center justify-start gap-2 px-2 py-1.5
            text-sm font-medium text-foreground hover:bg-muted/60
            rounded transition-all duration-150
            active:scale-[0.98]"
        >
          <SquarePen className="w-4 h-4 text-foreground" />
          {t('New conversation')}
        </button>
        <button
          onClick={() => {
            setIsNormalTasksExpanded(false)
            setIsAdvancedTasksExpanded(true)
            handleNewLoopTask()
          }}
          className="w-full flex items-center justify-start gap-2 px-2 py-1.5
            text-sm text-foreground hover:bg-muted/50
            rounded transition-all duration-150"
        >
          <Zap className="w-4 h-4 text-foreground" />
          {t('Advanced task')}
        </button>
      </div>

      {/* Task history with collapsible categories */}
      <div className="flex-1 overflow-auto">
        {/* Normal Tasks - Collapsible */}
        <div>
          <div className="flex items-center px-4 py-1.5 hover:bg-muted/50 transition-colors">
            <button
              onClick={() => setIsNormalTasksExpanded(!isNormalTasksExpanded)}
              className="flex-1 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isNormalTasksExpanded ? 'rotate-90' : ''}`} />
              <span>{t('Normal tasks')}</span>
              <span className="text-muted-foreground/60">({conversations.length})</span>
            </button>
            {onClearAll && conversations.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClearAll()
                }}
                className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded transition-colors"
                title={t('Clear all')}
                aria-label={t('Clear all normal tasks')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
          {isNormalTasksExpanded && (
            <div>
              {conversations.length === 0 ? (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {t('No tasks yet')}
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${conversation.title}, ${formatDate(conversation.updatedAt)}`}
                    aria-selected={conversation.id === currentConversationId && selectionType === 'conversation'}
                    onClick={() => editingId !== conversation.id && handleSelectConversation(conversation.id)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && editingId !== conversation.id) {
                        e.preventDefault()
                        handleSelectConversation(conversation.id)
                      }
                    }}
                    className={`w-full px-4 py-2.5 text-left cursor-pointer group relative
                      transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset
                      ${conversation.id === currentConversationId && selectionType === 'conversation'
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
                ))
              )}
            </div>
          )}
        </div>

        {/* Advanced Tasks - Collapsible */}
        <div className="border-t border-border/50 mt-1">
          <div className="flex items-center px-4 py-1.5 hover:bg-muted/50 transition-colors">
            <button
              onClick={() => setIsAdvancedTasksExpanded(!isAdvancedTasksExpanded)}
              className="flex-1 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isAdvancedTasksExpanded ? 'rotate-90' : ''}`} />
              <span>{t('Advanced tasks')}</span>
              <span className="text-muted-foreground/60">({loopTasks.length})</span>
            </button>
            {onClearAllAdvanced && loopTasks.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClearAllAdvanced()
                }}
                className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded transition-colors"
                title={t('Clear all')}
                aria-label={t('Clear all advanced tasks')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
          {isAdvancedTasksExpanded && (
            <div>
              {loopTasks.length === 0 ? (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {t('No advanced tasks yet')}
                </div>
              ) : (
                <div className="px-2">
                  {loopTasks.map((task) => (
                    <LoopTaskItem
                      key={task.id}
                      task={task}
                      isActive={task.id === currentTaskId && selectionType === 'loopTask'}
                      onSelect={() => handleSelectLoopTask(task.id)}
                      onRename={(name) => handleRenameLoopTask(task.id, name)}
                      onDelete={() => handleDeleteLoopTask(task.id)}
                      isCollapsed={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
