/**
 * Step4Execute - Fourth step of the wizard (final step)
 *
 * Shows:
 * - Execution progress bar
 * - Story status list with real-time updates
 * - Execution log
 *
 * No "Back" button - cannot return to previous steps
 * Can stop execution
 */

import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Square,
  Loader2,
  Circle,
  CheckCircle2,
  XCircle,
  ChevronDown
} from 'lucide-react'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { api } from '../../../api'
import { cn } from '../../../lib/utils'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { UserStory, LoopTask } from '../../../../shared/types/loop-task'

export function Step4Execute() {
  const { t } = useTranslation()
  const {
    getCurrentTask,
    executionLog,
    handleTaskUpdate,
    appendLog
  } = useLoopTaskStore()

  const [isStopping, setIsStopping] = useState(false)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const logRef = useRef<HTMLDivElement>(null)

  const currentTask = getCurrentTask()

  // Subscribe to task updates
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

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [executionLog])

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

  // Stop execution
  const handleStopConfirm = async () => {
    if (!currentTask) return

    setShowStopConfirm(false)
    setIsStopping(true)
    try {
      await api.ralphStop(currentTask.id)
    } catch (err) {
      console.error('Failed to stop task:', err)
    } finally {
      setIsStopping(false)
    }
  }

  // Calculate progress
  const stories = currentTask?.stories || []
  const completedCount = stories.filter((s) => s.status === 'completed').length
  const totalCount = stories.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const isRunning = currentTask?.status === 'running'
  const isCompleted = currentTask?.status === 'completed'
  const isFailed = currentTask?.status === 'failed'

  // Get current running story
  const currentStory = stories.find((s) => s.status === 'running')

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {completedCount}/{totalCount} {t('sub-tasks')} ({progress}%)
              </span>
              <span className="text-muted-foreground">
                {t('Iteration')}: {currentTask?.iteration || 0}/{currentTask?.maxIterations || 10}
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
            {currentStory && (
              <p className="text-sm text-muted-foreground">
                {t('Current')}: {currentStory.title}
              </p>
            )}
          </div>

          {/* Completion/Failure Status */}
          {isCompleted && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="text-success" size={16} />
              <span className="text-sm font-medium text-success">
                {t('All tasks completed!')}
              </span>
            </div>
          )}
          {isFailed && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <XCircle className="text-destructive" size={16} />
              <span className="text-sm font-medium text-destructive">{t('Task failed')}</span>
            </div>
          )}

          {/* Story Status List */}
          <div className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">{t('Sub-task Status')}</h3>
            {stories.map((story) => (
              <StoryStatusCard
                key={story.id}
                story={story}
                isExpanded={expandedStories.has(story.id)}
                onToggle={() => toggleExpand(story.id)}
              />
            ))}
          </div>

          {/* Execution Log */}
          <div className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">{t('Execution Log')}</h3>
            <div
              ref={logRef}
              className="h-64 p-3 bg-muted/30 border border-border rounded-lg overflow-auto font-mono text-xs text-muted-foreground whitespace-pre-wrap"
            >
              {executionLog || t('Waiting for logs...')}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Only stop button, no back */}
      {isRunning && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="max-w-2xl mx-auto flex justify-end">
            <button
              onClick={() => setShowStopConfirm(true)}
              disabled={isStopping}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isStopping ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Square size={14} />
              )}
              {t('Stop')}
            </button>
          </div>
        </div>
      )}

      {/* Stop Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showStopConfirm}
        title={t('Stop task?')}
        message={t('Stop task confirm message')}
        confirmLabel={t('Stop')}
        variant="danger"
        onConfirm={handleStopConfirm}
        onCancel={() => setShowStopConfirm(false)}
      />
    </div>
  )
}

// ============================================
// Story Status Card
// ============================================

interface StoryStatusCardProps {
  story: UserStory
  isExpanded: boolean
  onToggle: () => void
}

function StoryStatusCard({ story, isExpanded, onToggle }: StoryStatusCardProps) {
  const { t } = useTranslation()

  const statusIcon = {
    pending: <Circle className="text-muted-foreground" size={14} />,
    running: <Loader2 className="text-primary animate-spin" size={14} />,
    completed: <CheckCircle2 className="text-success" size={14} />,
    failed: <XCircle className="text-destructive" size={14} />
  }[story.status]

  const statusText = {
    pending: t('Pending'),
    running: t('Running'),
    completed: t('Completed'),
    failed: t('Failed')
  }[story.status]

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-colors',
        story.status === 'running'
          ? 'border-primary bg-primary/10'
          : story.status === 'completed'
            ? 'border-success/30 bg-success/10'
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
        <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
        <span className="flex-1 text-sm text-foreground truncate">{story.title}</span>
        <span className="text-xs text-muted-foreground">{statusText}</span>
        {story.duration && (
          <span className="text-xs text-muted-foreground">
            ({Math.round(story.duration / 1000)}s)
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            'text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border space-y-2">
          <div className="pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('Description')}
            </div>
            <p className="text-sm text-foreground">{story.description}</p>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('Acceptance Criteria')}
            </div>
            <ul className="list-disc list-inside text-sm text-foreground">
              {story.acceptanceCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

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
      )}
    </div>
  )
}
