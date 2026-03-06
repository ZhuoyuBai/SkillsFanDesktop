/**
 * Conversation List - Resizable sidebar for multiple conversations
 * Supports drag-to-resize, inline title editing, and conversation management
 * Can be collapsed to show only icons
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ConversationMeta } from '../../types'
import type { LoopTaskMeta } from '../../../shared/types/loop-task'
import { MessageSquare } from '../icons/ToolIcons'
import { PanelLeftClose, PanelLeft, SquarePen, Zap } from 'lucide-react'
import { SpaceSwitcher } from '../space/SpaceSwitcher'
import { useTranslation } from '../../i18n'
import { UserAvatarMenu } from './UserAvatarMenu'
import { useLoopTaskStore } from '../../stores/loop-task.store'
import { useChatStore } from '../../stores/chat.store'
import { usePlatform } from '../layout/Header'
import { isElectron } from '../../api/transport'
import { ConfirmDialog } from '../ui/ConfirmDialog'

// Unified task item for combined list
type UnifiedTask = {
  id: string
  type: 'conversation' | 'loopTask'
  title: string
  updatedAt: string
  // Conversation specific
  conversation?: ConversationMeta
  // Loop task specific
  loopTask?: LoopTaskMeta
}

// Unified task item component
interface UnifiedTaskItemProps {
  task: UnifiedTask
  isActive: boolean
  isEditing: boolean
  editingTitle: string
  onSelect: () => void
  onStartEdit: (e: React.MouseEvent) => void
  onEditChange: (value: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onDelete: () => void
  canRename: boolean
  canDelete: boolean
  editInputRef: React.RefObject<HTMLInputElement | null>
  t: (key: string) => string
}

function UnifiedTaskItem({
  task,
  isActive,
  isEditing,
  editingTitle,
  onSelect,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  canRename,
  canDelete,
  editInputRef,
  t
}: UnifiedTaskItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEditSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEditCancel()
    }
  }

  // Get status info for loop tasks
  const getLoopTaskStatus = () => {
    if (!task.loopTask) return null
    const { status, completedCount, storyCount } = task.loopTask
    if (status === 'completed') return { text: t('Completed') }
    if (status === 'running') return { text: `${completedCount}/${storyCount}` }
    if (status === 'failed') return { text: '!' }
    if (storyCount > 0) return { text: `${completedCount}/${storyCount}` }
    return null
  }

  const loopStatus = getLoopTaskStatus()

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={task.title}
      aria-selected={isActive}
      onClick={() => !isEditing && onSelect()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`w-full px-3 py-2 text-left cursor-pointer group relative
        transition-all duration-200 rounded-lg mx-1
        focus:outline-none focus:ring-0
        ${isActive
          ? 'bg-secondary'
          : 'hover:bg-secondary/60'
        }`}
    >
      {isEditing ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={editInputRef}
            type="text"
            value={editingTitle}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onEditSave}
            className="flex-1 text-sm bg-input border border-border rounded px-2 py-1 focus:outline-none focus:border-primary min-w-0"
            placeholder={t('Task title...')}
          />
          <button
            onClick={onEditSave}
            className="p-1 hover:bg-secondary text-foreground rounded transition-colors flex-shrink-0"
            title={t('Save')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          {/* Title */}
          <span className="text-sm truncate flex-1 min-w-0">
            {task.title}
          </span>

          {/* Loop task status */}
          {loopStatus && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {loopStatus.text}
            </span>
          )}

          {/* Action buttons (on hover) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
            {canRename && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEdit(e)
                }}
                className="p-1 hover:bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
                title={t('Edit title')}
                aria-label={t('Edit title')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded transition-colors"
                title={t('Delete')}
                aria-label={t('Delete')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Width constraints (in pixels)
const MIN_WIDTH = 220 // Match space switcher header width
const MAX_WIDTH = 320
const COLLAPSED_WIDTH = 48 // Width when collapsed (icon only)
const WIDTH_RATIO = 0.2 // 20% of window width

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
  const platform = usePlatform()
  const isInElectron = isElectron()
  // macOS with hiddenInset: add padding for traffic lights
  const macTrafficLightPadding = isInElectron && platform.isMac
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
    cancelEditing,
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; taskType: 'conversation' | 'loopTask' } | null>(null)
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Merge and sort conversations and loop tasks
  const unifiedTasks = useMemo<UnifiedTask[]>(() => {
    const tasks: UnifiedTask[] = []

    // Add conversations
    for (const conv of conversations) {
      tasks.push({
        id: conv.id,
        type: 'conversation',
        title: conv.title,
        updatedAt: conv.updatedAt,
        conversation: conv
      })
    }

    // Add loop tasks
    for (const task of loopTasks) {
      tasks.push({
        id: task.id,
        type: 'loopTask',
        title: task.name,
        updatedAt: task.updatedAt,
        loopTask: task
      })
    }

    // Sort by updatedAt descending
    tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    return tasks
  }, [conversations, loopTasks])

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
        className="border-r border-border/30 flex flex-col bg-accent/40 relative"
        style={{ width: COLLAPSED_WIDTH }}
      >
        {/* Space switcher and toggle button in collapsed state */}
        <div className={`px-2 py-3 border-b border-border flex flex-col items-center gap-2 ${macTrafficLightPadding ? 'pt-10 drag-region' : ''}`}>
          <div className="no-drag"><SpaceSwitcher collapsed={true} /></div>
          {onToggleCollapse && (
            <div className="relative no-drag">
              <button
                onClick={() => {
                  setShowCollapseTooltip(false)
                  onToggleCollapse()
                }}
                onMouseEnter={() => setShowCollapseTooltip(true)}
                onMouseLeave={() => setShowCollapseTooltip(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
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
              cancelEditing()
              setSelectionType('conversation')
              onNew()
            }}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title={t('New conversation')}
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleNewLoopTask()}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            title={t('Auto task')}
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>

        {/* Collapsed unified task icons */}
        <div className="flex-1 overflow-auto py-2">
          {unifiedTasks.map((task) => (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              aria-label={task.title}
              aria-selected={
                (task.type === 'conversation' && task.id === currentConversationId && selectionType === 'conversation') ||
                (task.type === 'loopTask' && task.id === currentTaskId && selectionType === 'loopTask')
              }
              onClick={() => {
                if (task.type === 'conversation') {
                  handleSelectConversation(task.id)
                } else {
                  handleSelectLoopTask(task.id)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (task.type === 'conversation') {
                    handleSelectConversation(task.id)
                  } else {
                    handleSelectLoopTask(task.id)
                  }
                }
              }}
              className={`w-full p-2 flex justify-center cursor-pointer
                transition-all duration-200
                focus:outline-none focus:ring-0
                ${(task.type === 'conversation' && task.id === currentConversationId && selectionType === 'conversation') ||
                  (task.type === 'loopTask' && task.id === currentTaskId && selectionType === 'loopTask')
                  ? 'bg-primary/8'
                  : 'hover:bg-secondary/40'
                }`}
              title={task.title}
            >
              {task.type === 'conversation' ? (
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Zap className="w-4 h-4 text-teal-400" />
              )}
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
      className={`flex flex-col relative ${isMobileOverlay ? 'bg-background flex-1' : 'border-r border-border/30 bg-accent/40'}`}
      style={isMobileOverlay ? undefined : {
        width,
        transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: isDragging ? 'width' : 'auto'
      }}
    >
      {/* Header with space switcher and toggle button - hidden in mobile overlay (header is provided by parent) */}
      {!isMobileOverlay && (
      <div className={`px-4 py-3 border-b border-border flex items-center gap-2 ${macTrafficLightPadding ? 'pt-10 drag-region' : ''}`}>
        <div className="no-drag flex-1"><SpaceSwitcher /></div>
        {onToggleCollapse && (
          <div className="relative flex-shrink-0 no-drag">
            <button
              onClick={() => {
                setShowCollapseTooltip(false)
                onToggleCollapse()
              }}
              onMouseEnter={() => setShowCollapseTooltip(true)}
              onMouseLeave={() => setShowCollapseTooltip(false)}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              aria-label={t('Collapse sidebar')}
              aria-expanded={true}
            >
              <PanelLeftClose size={16} />
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
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              cancelEditing()
              setSelectionType('conversation')
              onNew()
            }}
            className="flex-1 flex items-center justify-start gap-3 pl-0 pr-3 py-1.5
              text-sm font-semibold text-foreground bg-muted/40 hover:bg-muted/60
              rounded-lg transition-all duration-150
              active:scale-[0.98]"
          >
            <SquarePen className="w-4 h-4 text-foreground" />
            {t('New conversation')}
          </button>
          <div className="relative group">
            <button
              onClick={() => handleNewLoopTask()}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50
                rounded-lg transition-all duration-150"
              aria-label={t('Auto task')}
            >
              <Zap className="w-4 h-4" />
            </button>
            {/* Tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50
              opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
              <div className="bg-popover border border-border rounded-lg shadow-lg px-2 py-1 whitespace-nowrap">
                <span className="text-xs text-foreground">{t('Auto task')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unified task list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {unifiedTasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('No tasks yet')}
          </div>
        ) : (
          <>
            <div className="px-4 py-1.5 text-xs text-muted-foreground font-medium">
              {t('History')}
            </div>
            {unifiedTasks.map((task) => (
              <UnifiedTaskItem
                key={task.id}
                task={task}
                isActive={
                  (task.type === 'conversation' && task.id === currentConversationId && selectionType === 'conversation') ||
                  (task.type === 'loopTask' && task.id === currentTaskId && selectionType === 'loopTask')
                }
                isEditing={editingId === task.id}
                editingTitle={editingTitle}
                onSelect={() => {
                  if (task.type === 'conversation') {
                    handleSelectConversation(task.id)
                  } else {
                    handleSelectLoopTask(task.id)
                  }
                }}
                onStartEdit={(e) => {
                  if (task.conversation) {
                    handleStartEdit(e, task.conversation)
                  } else if (task.loopTask) {
                    setEditingId(task.id)
                    setEditingTitle(task.loopTask.name)
                  }
                }}
                onEditChange={setEditingTitle}
                onEditSave={() => {
                  if (task.type === 'conversation' && onRename) {
                    onRename(task.id, editingTitle.trim())
                  } else if (task.type === 'loopTask') {
                    handleRenameLoopTask(task.id, editingTitle.trim())
                  }
                  setEditingId(null)
                  setEditingTitle('')
                }}
                onEditCancel={handleCancelEdit}
                onDelete={() => {
                  setDeleteConfirm({ taskId: task.id, taskType: task.type })
                }}
                canRename={task.type === 'conversation' ? !!onRename : true}
                canDelete={task.type === 'conversation' ? !!onDelete : true}
                editInputRef={editInputRef}
                t={t}
              />
            ))}
          </>
        )}
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title={deleteConfirm?.taskType === 'loopTask' ? t('Delete task?') : t('Delete conversation?')}
        message={deleteConfirm?.taskType === 'loopTask'
          ? t('Are you sure you want to delete this task?')
          : t('Are you sure you want to delete this conversation?')}
        confirmLabel={t('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm) {
            if (deleteConfirm.taskType === 'conversation' && onDelete) {
              onDelete(deleteConfirm.taskId)
            } else if (deleteConfirm.taskType === 'loopTask') {
              handleDeleteLoopTask(deleteConfirm.taskId)
            }
            setDeleteConfirm(null)
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
