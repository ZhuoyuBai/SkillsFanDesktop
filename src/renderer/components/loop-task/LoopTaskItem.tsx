/**
 * LoopTaskItem - Task list item component
 *
 * Displays task metadata in the sidebar:
 * - Status icon (color-coded)
 * - Task name (editable)
 * - Progress indicator
 * - Project path
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Pencil,
  Trash2
} from 'lucide-react'
import type { LoopTaskMeta, TaskStatus } from '../../stores/loop-task.store'

interface LoopTaskItemProps {
  task: LoopTaskMeta
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  isCollapsed?: boolean
}

// Status icon component
function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-destructive" />
    case 'paused':
      return <PauseCircle className="w-3.5 h-3.5 text-yellow-500" />
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

export function LoopTaskItem({
  task,
  isActive,
  onSelect,
  onRename,
  onDelete,
  isCollapsed = false
}: LoopTaskItemProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [editingName, setEditingName] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingName(task.name)
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    const trimmed = editingName.trim()
    // Validate: non-empty and between 1-100 characters
    if (trimmed && trimmed.length >= 1 && trimmed.length <= 100 && trimmed !== task.name) {
      onRename(trimmed)
    } else if (!trimmed || trimmed.length === 0) {
      // Revert to original name if empty
      setEditingName(task.name)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setEditingName(task.name)
      setIsEditing(false)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Confirm before deleting
    if (window.confirm(t('Are you sure you want to delete this task?'))) {
      onDelete()
    }
  }

  // Extract project folder name from path
  const projectFolder = task.projectDir.split('/').pop() || task.projectDir

  // Collapsed mode: just icon
  if (isCollapsed) {
    return (
      <button
        onClick={onSelect}
        className={`w-full p-1.5 rounded-md transition-colors flex items-center justify-center ${
          isActive
            ? 'bg-gradient-to-r from-primary/8 via-primary/5 to-transparent'
            : 'hover:bg-secondary/40'
        }`}
        title={task.name}
      >
        <StatusIcon status={task.status} />
      </button>
    )
  }

  return (
    <div
      onClick={() => !isEditing && onSelect()}
      className={`group w-full px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150 ${
        isActive
          ? 'bg-gradient-to-r from-primary/8 via-primary/5 to-transparent'
          : 'hover:bg-secondary/40'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          <StatusIcon status={task.status} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Task name */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-1 py-0 text-sm bg-input border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-foreground truncate">
                {task.name}
              </span>
              {/* Progress badge */}
              {task.storyCount > 0 && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                  {task.completedCount}/{task.storyCount}
                </span>
              )}
            </div>
          )}

          {/* Project path */}
          <div className="text-[11px] text-muted-foreground truncate" title={task.projectDir}>
            {projectFolder}
          </div>
        </div>

        {/* Action buttons (show on hover) */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleStartEdit}
              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              title={t('Rename')}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title={t('Delete')}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
