/**
 * LoopTaskPanel - Main panel for loop task configuration and execution
 *
 * Integrated panel that shows:
 * - Task configuration (project, source, iterations)
 * - Story list with editing
 * - Execution progress when running
 *
 * Replaces the separate RalphPage with inline panel rendering
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  FileJson,
  Sparkles,
  PenLine,
  Play,
  Square,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useLoopTaskStore } from '../../stores/loop-task.store'
import { useChatStore } from '../../stores/chat.store'
import { api } from '../../api'
import type { LoopTask, UserStory, TaskSource } from '../../../shared/types/loop-task'
import { StoryEditModal } from '../ralph/StoryEditModal'

interface LoopTaskPanelProps {
  spaceId: string
}

export function LoopTaskPanel({ spaceId }: LoopTaskPanelProps) {
  const { t } = useTranslation()
  const {
    getCurrentTask,
    isEditing,
    editingTask,
    updateEditing,
    cancelEditing,
    createTask,
    updateTask,
    reorderStories,
    handleTaskUpdate,
    appendLog,
    clearLog
  } = useLoopTaskStore()

  const { setSelectionType } = useChatStore()

  // Get current task (either editing or selected)
  const currentTask = getCurrentTask()
  const isNewTask = isEditing && !editingTask?.id
  const task = isEditing ? editingTask : currentTask

  // Local state
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [editingStory, setEditingStory] = useState<UserStory | null>(null)
  const [isCreatingStory, setIsCreatingStory] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [localStories, setLocalStories] = useState<UserStory[]>([])

  // Sync local stories with task stories
  useEffect(() => {
    if (task?.stories) {
      setLocalStories(task.stories)
    } else {
      setLocalStories([])
    }
  }, [task?.stories])

  // Listen for task updates
  useEffect(() => {
    const unsubTask = api.onRalphTaskUpdate?.((data: { task: LoopTask }) => {
      handleTaskUpdate(data.task)
      // Use store's getState() to get latest task ID instead of closure-captured currentTask
      const state = useLoopTaskStore.getState()
      const latestTaskId = state.getCurrentTaskId()
      if (latestTaskId === data.task.id) {
        setLocalStories(data.task.stories)
      }
    })

    const unsubLog = api.onRalphStoryLog?.((data: { taskId: string; storyId: string; log: string }) => {
      appendLog(data.log)
    })

    return () => {
      unsubTask?.()
      unsubLog?.()
    }
  }, [handleTaskUpdate, appendLog])

  // Handlers
  const handleSelectFolder = async () => {
    try {
      const result = await api.selectFolder()
      if (result.success && result.data) {
        updateEditing({ projectDir: result.data })
        setLocalError(null)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
  }

  const handleSourceChange = (source: TaskSource) => {
    updateEditing({ source })
  }

  const handleImportPrd = async () => {
    if (!task?.projectDir) {
      setLocalError(t('Please select a project directory'))
      return
    }

    setIsLoading(true)
    setLocalError(null)
    try {
      const result = await api.ralphImportPrd({ projectDir: task.projectDir })
      if (result.success && result.data) {
        setLocalStories(result.data.stories)
        updateEditing({
          stories: result.data.stories,
          branchName: result.data.branchName || '',
          description: result.data.description || ''
        })
      } else {
        setLocalError(result.error || t('Failed to import prd.json'))
      }
    } catch (err) {
      setLocalError(t('Failed to import prd.json'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateStories = async () => {
    if (!task?.projectDir) {
      setLocalError(t('Please select a project directory'))
      return
    }
    if (!task?.description?.trim()) {
      setLocalError(t('Please enter a feature description'))
      return
    }

    setIsLoading(true)
    setLocalError(null)
    try {
      const result = await api.ralphGenerateStories({
        projectDir: task.projectDir,
        description: task.description
      })
      if (result.success && result.data) {
        setLocalStories(result.data)
        updateEditing({ stories: result.data })
      } else {
        setLocalError(result.error || t('Failed to generate stories'))
      }
    } catch (err) {
      setLocalError(t('Failed to generate stories'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTask = async () => {
    if (!task?.projectDir) {
      setLocalError(t('Please select a project directory'))
      return
    }

    setIsLoading(true)
    setLocalError(null)
    try {
      const newTask = await createTask(spaceId, {
        projectDir: task.projectDir,
        description: task.description || '',
        source: task.source || 'manual',
        stories: localStories,
        maxIterations: task.maxIterations || 10,
        branchName: task.branchName
      })

      // Clear editing state and select the new task
      clearLog()
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartExecution = async () => {
    if (!currentTask) return
    if (localStories.length === 0) {
      setLocalError(t('Please add at least one story'))
      return
    }

    setIsLoading(true)
    setLocalError(null)
    try {
      // Update stories if changed
      if (JSON.stringify(localStories) !== JSON.stringify(currentTask.stories)) {
        await updateTask(spaceId, currentTask.id, { stories: localStories })
      }

      // Start execution
      const result = await api.ralphStart(spaceId, currentTask.id)
      if (!result.success) {
        setLocalError(result.error || t('Failed to start task'))
      }
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopExecution = async () => {
    if (!currentTask) return

    setIsStopping(true)
    try {
      await api.ralphStop(currentTask.id)
    } catch (err) {
      console.error('Failed to stop task:', err)
    } finally {
      setIsStopping(false)
    }
  }

  const handleCancel = () => {
    cancelEditing()
    // If we were creating a new task, go back to conversation view
    if (isNewTask) {
      setSelectionType('conversation')
    }
  }

  // Story management
  const toggleExpand = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev)
      if (next.has(storyId)) {
        next.delete(storyId)
      } else {
        next.add(storyId)
      }
      return next
    })
  }

  const handleAddStory = () => {
    setIsCreatingStory(true)
    setEditingStory({
      id: '',
      title: '',
      description: '',
      acceptanceCriteria: ['Typecheck passes'],
      priority: localStories.length + 1,
      status: 'pending',
      notes: ''
    })
  }

  const handleSaveStory = (story: UserStory) => {
    if (isCreatingStory) {
      // Generate US-xxx format ID (consistent with backend)
      const maxId = localStories.reduce((max, s) => {
        const match = s.id.match(/US-(\d+)/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)
      const newId = `US-${String(maxId + 1).padStart(3, '0')}`

      const newStory = {
        ...story,
        id: newId
      }
      setLocalStories([...localStories, newStory])
    } else {
      // Update existing
      setLocalStories(localStories.map((s) => (s.id === story.id ? story : s)))
    }
    setEditingStory(null)
    setIsCreatingStory(false)
  }

  const handleRemoveStory = (storyId: string) => {
    setLocalStories(localStories.filter((s) => s.id !== storyId))
  }

  const handleMoveStory = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= localStories.length) return

    const newStories = [...localStories]
    const [removed] = newStories.splice(index, 1)
    newStories.splice(newIndex, 0, removed)
    // Update priorities
    newStories.forEach((s, i) => {
      s.priority = i + 1
    })
    setLocalStories(newStories)

    // Save to backend if task exists (not a new task being created)
    if (currentTask?.id) {
      try {
        await reorderStories(spaceId, currentTask.id, index, newIndex)
      } catch (err) {
        console.error('Failed to reorder stories:', err)
        // Revert on failure
        setLocalStories(task?.stories || [])
      }
    }
  }

  // Source options
  const sourceOptions: { value: TaskSource; icon: React.ReactNode; label: string; desc: string }[] = [
    {
      value: 'import',
      icon: <FileJson size={18} />,
      label: t('Import from prd.json'),
      desc: t('Load existing stories from prd.json file')
    },
    {
      value: 'generate',
      icon: <Sparkles size={18} />,
      label: t('AI Generate'),
      desc: t('Generate stories from feature description')
    },
    {
      value: 'manual',
      icon: <PenLine size={18} />,
      label: t('Manual Create'),
      desc: t('Create stories manually one by one')
    }
  ]

  // Determine if task is running
  const isRunning = currentTask?.status === 'running'
  const isCompleted = currentTask?.status === 'completed'
  const isFailed = currentTask?.status === 'failed'
  // Use localStories for progress calculation to ensure consistency with story cards
  const completedCount = localStories.filter((s) => s.status === 'completed').length
  const totalCount = localStories.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Empty state
  if (!task && !isEditing) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg mb-2">{t('No loop task selected')}</p>
        <p className="text-sm">{t('Select a task from the sidebar or create a new one')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {isNewTask ? t('New Loop Task') : (task?.name || t('Loop Task'))}
            </h2>
            {currentTask && (
              <p className="text-sm text-muted-foreground">
                {t('Status')}: {t(currentTask.status)}
                {currentTask.branchName && (
                  <> · {t('Branch')}: <code className="bg-muted px-1 rounded">{currentTask.branchName}</code></>
                )}
              </p>
            )}
          </div>
          {/* Status indicator */}
          {currentTask && (
            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  onClick={handleStopExecution}
                  disabled={isStopping}
                  className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isStopping ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Square size={14} />
                  )}
                  {t('Stop')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          {/* Configuration Section (show when editing or idle) */}
          {(isEditing || !isRunning) && (
            <>
              {/* Project Directory */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {t('Project Directory')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={task?.projectDir || ''}
                    onChange={(e) => isEditing && updateEditing({ projectDir: e.target.value })}
                    placeholder="/path/to/your/project"
                    disabled={!isEditing}
                    className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                  {isEditing && (
                    <button
                      onClick={handleSelectFolder}
                      className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-2"
                    >
                      <FolderOpen size={16} />
                      {t('Browse')}
                    </button>
                  )}
                </div>
              </div>

              {/* Task Source (only when creating new task) */}
              {isNewTask && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    {t('Task Source')}
                  </label>
                  <div className="grid gap-2">
                    {sourceOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleSourceChange(option.value)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                          task?.source === option.value
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        }`}
                      >
                        <div
                          className={`mt-0.5 ${
                            task?.source === option.value ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        >
                          {option.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground text-sm">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature Description (for AI generation) */}
              {task?.source === 'generate' && isEditing && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {t('Feature Description')}
                  </label>
                  <textarea
                    value={task?.description || ''}
                    onChange={(e) => updateEditing({ description: e.target.value })}
                    placeholder={t('Describe the feature you want to implement...')}
                    rows={3}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <button
                    onClick={handleGenerateStories}
                    disabled={isLoading || !task?.description?.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {isLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {t('Generate Stories')}
                  </button>
                </div>
              )}

              {/* Import button for prd.json */}
              {task?.source === 'import' && isEditing && (
                <button
                  onClick={handleImportPrd}
                  disabled={isLoading || !task?.projectDir}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <FileJson size={16} />
                  )}
                  {t('Import prd.json')}
                </button>
              )}

              {/* Max Iterations */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {t('Max Iterations')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={task?.maxIterations || 10}
                    onChange={(e) => isEditing && updateEditing({ maxIterations: parseInt(e.target.value) || 10 })}
                    min={1}
                    max={50}
                    disabled={!isEditing}
                    className="w-24 px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                  <span className="text-sm text-muted-foreground">{t('iterations')}</span>
                </div>
              </div>
            </>
          )}

          {/* Stories Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                {t('User Stories')} ({localStories.length})
              </label>
              {(isEditing || currentTask?.status === 'idle') && (
                <button
                  onClick={handleAddStory}
                  className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  {t('Add')}
                </button>
              )}
            </div>

            {localStories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                <p>{t('No stories yet')}</p>
                {(isEditing || currentTask?.status === 'idle') && (
                  <button
                    onClick={handleAddStory}
                    className="mt-2 text-primary hover:underline"
                  >
                    {t('Add your first story')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {localStories.map((story, index) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    index={index}
                    total={localStories.length}
                    isExpanded={expandedStories.has(story.id)}
                    isEditable={isEditing || currentTask?.status === 'idle'}
                    onToggle={() => toggleExpand(story.id)}
                    onEdit={() => {
                      setIsCreatingStory(false)
                      setEditingStory(story)
                    }}
                    onRemove={() => handleRemoveStory(story.id)}
                    onMoveUp={() => handleMoveStory(index, 'up')}
                    onMoveDown={() => handleMoveStory(index, 'down')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Progress Section (when running or completed) */}
          {(isRunning || isCompleted || isFailed) && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                {t('Progress')}
              </label>
              <div className="p-4 border border-border rounded-lg bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {completedCount}/{totalCount} {t('stories')} ({progress}%)
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t('Iteration')}: {currentTask?.iteration}/{currentTask?.maxIterations}
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isFailed ? 'bg-destructive' : isCompleted ? 'bg-green-500' : 'bg-primary'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {isCompleted && (
                  <div className="mt-3 flex items-center gap-2 text-green-600">
                    <CheckCircle2 size={16} />
                    <span className="text-sm font-medium">{t('All tasks completed!')}</span>
                  </div>
                )}
                {isFailed && (
                  <div className="mt-3 flex items-center gap-2 text-destructive">
                    <XCircle size={16} />
                    <span className="text-sm font-medium">{t('Task failed')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error display */}
          {localError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {localError}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleCreateTask}
                disabled={isLoading || !task?.projectDir}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {t('Create Task')}
              </button>
            </>
          ) : currentTask?.status === 'idle' ? (
            <>
              <div />
              <button
                onClick={handleStartExecution}
                disabled={isLoading || localStories.length === 0}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                {t('Start Execution')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Story Edit Modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory}
          isNew={isCreatingStory}
          onSave={handleSaveStory}
          onClose={() => {
            setEditingStory(null)
            setIsCreatingStory(false)
          }}
        />
      )}
    </div>
  )
}

// ============================================
// Story Card Component
// ============================================

interface StoryCardProps {
  story: UserStory
  index: number
  total: number
  isExpanded: boolean
  isEditable: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function StoryCard({
  story,
  index,
  total,
  isExpanded,
  isEditable,
  onToggle,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown
}: StoryCardProps) {
  const { t } = useTranslation()

  const statusIcon = {
    pending: <Circle className="text-muted-foreground" size={14} />,
    running: <Loader2 className="text-primary animate-spin" size={14} />,
    completed: <CheckCircle2 className="text-green-500" size={14} />,
    failed: <XCircle className="text-red-500" size={14} />
  }[story.status]

  const isActive = story.status === 'running'

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isActive
          ? 'border-primary bg-primary/5'
          : story.status === 'completed'
          ? 'border-green-500/30 bg-green-500/5'
          : story.status === 'failed'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-border bg-card'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {statusIcon}
        <span className="w-5 h-5 flex items-center justify-center bg-muted rounded text-xs font-medium text-muted-foreground">
          {story.priority}
        </span>
        <span className="flex-1 font-medium text-foreground text-sm truncate">
          {story.title}
        </span>

        {/* Actions */}
        {isEditable && (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('Move up')}
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('Move down')}
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title={t('Edit')}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onRemove}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title={t('Remove')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Details */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border/50">
          <div className="pt-3 space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('Description')}
              </div>
              <p className="text-sm text-foreground">{story.description}</p>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('Acceptance Criteria')}
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {story.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>

            {story.notes && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t('Notes')}
                </div>
                <p className="text-sm text-muted-foreground">{story.notes}</p>
              </div>
            )}

            {story.error && (
              <div>
                <div className="text-xs font-medium text-destructive mb-1">{t('Error')}</div>
                <p className="text-sm text-destructive">{story.error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
