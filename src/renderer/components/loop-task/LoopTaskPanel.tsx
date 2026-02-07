/**
 * LoopTaskPanel - Main panel for loop task configuration and execution
 *
 * Two modes:
 * 1. Wizard Mode (isEditing=true): 4-step wizard for creating new task
 * 2. View Mode (isEditing=false): View existing task details and execution
 *
 * Wizard Steps:
 * 1. Create Task - Select project directory and creation method
 * 2. Plan Edit - Edit story list
 * 3. Confirm - Review and generate prd.json
 * 4. Execute - Run the task (no going back)
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Square,
  Loader2,
  RefreshCw,
  Circle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  X
} from 'lucide-react'
import { useLoopTaskStore } from '../../stores/loop-task.store'
import { useChatStore } from '../../stores/chat.store'
import { api } from '../../api'
import { cn } from '../../lib/utils'
import {
  StepIndicator,
  Step1CreateTask,
  Step2PlanEdit,
  Step3Confirm,
  Step4Execute
} from './steps'
import type { LoopTask, UserStory } from '../../../shared/types/loop-task'

interface LoopTaskPanelProps {
  spaceId: string
}

export function LoopTaskPanel({ spaceId }: LoopTaskPanelProps) {
  const { t } = useTranslation()
  const {
    getCurrentTask,
    isEditing,
    editingTask,
    wizardStep,
    cancelEditing,
    handleTaskUpdate,
    appendLog
  } = useLoopTaskStore()

  const { setSelectionType } = useChatStore()

  // Get current task (either editing or selected)
  const currentTask = getCurrentTask()
  const isNewTask = isEditing && !editingTask?.id

  // Listen for task updates (for view mode)
  useEffect(() => {
    const unsubTask = api.onRalphTaskUpdate?.((data: { task: LoopTask }) => {
      handleTaskUpdate(data.task)
    })

    const unsubLog = api.onRalphStoryLog?.((data: { taskId: string; storyId: string; log: string }) => {
      appendLog(data.log)
    })

    return () => {
      unsubTask?.()
      unsubLog?.()
    }
  }, [handleTaskUpdate, appendLog])

  // Handle cancel
  const handleCancel = async () => {
    // Clean up any browser views created during the wizard
    await api.destroyAllBrowserViews()

    cancelEditing()
    // If we were creating a new task, go back to conversation view
    if (isNewTask) {
      setSelectionType('conversation')
    }
  }

  // Empty state - no task selected and not editing
  if (!currentTask && !isEditing) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg mb-2">{t('No loop task selected')}</p>
        <p className="text-sm">{t('Select a task from the sidebar or create a new one')}</p>
      </div>
    )
  }

  // Wizard Mode
  if (isEditing) {
    return (
      <div className="flex flex-col h-full">
        {/* Header - Cancel button aligned with sidebar */}
        <div className="px-4 pt-16 pb-3 shrink-0">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
            <span>{t('Cancel')}</span>
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={wizardStep} />

        {/* Step Content - flex-1 to take remaining space, overflow-hidden to enable child scrolling */}
        <div className="flex-1 overflow-hidden">
          {wizardStep === 1 && <Step1CreateTask onCancel={handleCancel} />}
          {wizardStep === 2 && <Step2PlanEdit onCancel={handleCancel} />}
          {wizardStep === 3 && <Step3Confirm spaceId={spaceId} onCancel={handleCancel} />}
          {wizardStep === 4 && <Step4Execute />}
        </div>
      </div>
    )
  }

  // View Mode - Show existing task
  return <TaskViewMode task={currentTask!} spaceId={spaceId} />
}

// ============================================
// Task View Mode (for existing tasks)
// ============================================

interface TaskViewModeProps {
  task: LoopTask
  spaceId: string
}

function TaskViewMode({ task, spaceId }: TaskViewModeProps) {
  const { t } = useTranslation()
  const { updateTask, executionLog, appendLog, handleTaskUpdate, clearLog } = useLoopTaskStore()

  const [isLoading, setIsLoading] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const isRunning = task.status === 'running'
  const isCompleted = task.status === 'completed'
  const isFailed = task.status === 'failed'
  const isIdle = task.status === 'idle'

  const completedCount = task.stories.filter((s) => s.status === 'completed').length
  const totalCount = task.stories.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Toggle story expand
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

  // Start execution
  const handleStart = async () => {
    if (task.stories.length === 0) {
      setError(t('Please add at least one story'))
      return
    }

    setIsLoading(true)
    setError(null)
    clearLog()

    try {
      const result = await api.ralphStart(spaceId, task.id)
      if (!result.success) {
        setError(result.error || t('Failed to start task'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  // Stop execution (after confirmation)
  const handleStopConfirm = async () => {
    setShowStopConfirm(false)
    setIsStopping(true)
    try {
      await api.ralphStop(task.id)
      // Clean up any browser views created during execution
      await api.destroyAllBrowserViews()
    } catch (err) {
      console.error('Failed to stop task:', err)
    } finally {
      setIsStopping(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">{task.name || t('Loop Task')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('Status')}: {t(task.status)}
              {task.branchName && (
                <>
                  {' '}
                  · {t('Branch')}: <code className="bg-muted px-1 rounded">{task.branchName}</code>
                </>
              )}
            </p>
          </div>
          {isRunning && (
            <button
              onClick={() => setShowStopConfirm(true)}
              disabled={isStopping}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {isStopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              {t('Stop')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Progress (when running or completed) */}
          {(isRunning || isCompleted || isFailed) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {completedCount}/{totalCount} {t('stories')} ({progress}%)
                </span>
                <span className="text-muted-foreground">
                  {t('Iteration')}: {task.iteration}/{task.maxIterations}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    isFailed ? 'bg-destructive' : isCompleted ? 'bg-success' : 'bg-primary'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {isCompleted && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">{t('All tasks completed!')}</span>
                </div>
              )}
              {isFailed && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle size={16} />
                  <span className="text-sm font-medium">{t('Task failed')}</span>
                </div>
              )}
            </div>
          )}

          {/* Story List */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {t('User Stories')} ({task.stories.length})
            </label>
            {task.stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                isExpanded={expandedStories.has(story.id)}
                onToggle={() => toggleExpand(story.id)}
              />
            ))}
          </div>

          {/* Execution Log (when running) */}
          {(isRunning || executionLog) && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">{t('Execution Log')}</label>
              <div className="h-64 p-3 bg-muted/30 border border-border rounded-lg overflow-auto font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                {executionLog || t('Waiting for logs...')}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {isIdle && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="max-w-2xl mx-auto flex justify-end">
            <button
              onClick={handleStart}
              disabled={isLoading || task.stories.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {t('Start Execution')}
            </button>
          </div>
        </div>
      )}

      {/* Stop Confirmation Dialog */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-sm shadow-lg">
            <div className="p-4 space-y-3">
              <h3 className="font-medium text-foreground">{t('Stop task?')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('Stop task confirm message')}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleStopConfirm}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
              >
                {t('Stop')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Story Card (for view mode)
// ============================================

interface StoryCardProps {
  story: UserStory
  isExpanded: boolean
  onToggle: () => void
}

function StoryCard({ story, isExpanded, onToggle }: StoryCardProps) {
  const { t } = useTranslation()

  const statusIcon = {
    pending: <Circle className="text-muted-foreground" size={14} />,
    running: <Loader2 className="text-primary animate-spin" size={14} />,
    completed: <CheckCircle2 className="text-success" size={14} />,
    failed: <XCircle className="text-destructive" size={14} />
  }[story.status]

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-colors',
        story.status === 'running'
          ? 'border-primary bg-primary/10'
          : story.status === 'completed'
            ? 'border-success/30 bg-success/5'
            : story.status === 'failed'
              ? 'border-destructive/30 bg-destructive/10'
              : 'border-border bg-card'
      )}
    >
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        {statusIcon}
        <span className="w-5 h-5 flex items-center justify-center bg-muted rounded text-xs font-medium text-muted-foreground">
          {story.priority}
        </span>
        <span className="flex-1 font-medium text-foreground text-sm truncate">{story.title}</span>
        {story.duration && (
          <span className="text-xs text-muted-foreground">
            {Math.round(story.duration / 1000)}s
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn('text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
        />
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border">
          <div className="pt-3 space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">{t('Description')}</div>
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
                <div className="text-xs font-medium text-muted-foreground mb-1">{t('Notes')}</div>
                <p className="text-sm text-muted-foreground">{story.notes}</p>
              </div>
            )}

            {story.commitHash && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{t('Commit')}</div>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">{story.commitHash}</code>
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
