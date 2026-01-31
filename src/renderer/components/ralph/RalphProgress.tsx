/**
 * Ralph Progress - Execution progress view
 *
 * Shows real-time progress of loop task execution:
 * - Story list with status indicators
 * - Progress bar
 * - Current execution log
 * - Stop button
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Circle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  Square,
  X
} from 'lucide-react'
import {
  useRalphStore,
  type RalphTask,
  type UserStory,
  getCompletedCount,
  getProgressPercent,
  formatDuration
} from '../../stores/ralph.store'
import { api } from '../../api'
import { useAppStore } from '../../stores/app.store'

export function RalphProgress() {
  const { t } = useTranslation()
  const { goBack } = useAppStore()
  const {
    currentTask,
    setCurrentTask,
    currentLog,
    appendLog,
    clearLog,
    reset
  } = useRalphStore()

  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [isStopping, setIsStopping] = useState(false)

  // Listen for task updates
  useEffect(() => {
    const unsubTask = api.onRalphTaskUpdate?.((data: { task: RalphTask }) => {
      setCurrentTask(data.task)
    })

    const unsubLog = api.onRalphStoryLog?.((data: { taskId: string; storyId: string; log: string }) => {
      appendLog(data.log)
    })

    return () => {
      unsubTask?.()
      unsubLog?.()
    }
  }, [setCurrentTask, appendLog])

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

  const handleStop = async () => {
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

  const handleClose = () => {
    reset()
    goBack()
  }

  if (!currentTask) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t('No task running')}
      </div>
    )
  }

  const completedCount = getCompletedCount(currentTask)
  const totalCount = currentTask.stories.length
  const progress = getProgressPercent(currentTask)
  const isRunning = currentTask.status === 'running'
  const isCompleted = currentTask.status === 'completed'
  const isFailed = currentTask.status === 'failed'

  return (
    <div className="flex flex-col h-full">
      {/* Header Info */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">{currentTask.description}</h2>
            <p className="text-sm text-muted-foreground">
              {t('Branch')}: <code className="bg-muted px-1 rounded">{currentTask.branchName}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={handleStop}
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
            <button
              onClick={handleClose}
              className="px-3 py-1.5 border border-border rounded-md hover:bg-accent transition-colors flex items-center gap-1.5"
            >
              <X size={14} />
              {t('Close')}
            </button>
          </div>
        </div>
      </div>

      {/* Story List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {currentTask.stories.map((story) => (
            <StoryProgressCard
              key={story.id}
              story={story}
              isExpanded={expandedStories.has(story.id)}
              onToggle={() => toggleExpand(story.id)}
            />
          ))}
        </div>
      </div>

      {/* Progress Footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            {t('Progress')}: {completedCount}/{totalCount} ({progress}%)
          </span>
          <span className="text-sm text-muted-foreground">
            {t('Iteration')}: {currentTask.iteration}/{currentTask.maxIterations}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <div className="px-4 py-4 bg-green-500/10 border-t border-green-500/20">
          <div className="flex items-center justify-center gap-2 text-green-600">
            <CheckCircle size={20} />
            <span className="font-medium">{t('All tasks completed!')}</span>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="px-4 py-4 bg-destructive/10 border-t border-destructive/20">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <XCircle size={20} />
            <span className="font-medium">{t('Task failed')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Story Progress Card
// ============================================

interface StoryProgressCardProps {
  story: UserStory
  isExpanded: boolean
  onToggle: () => void
}

function StoryProgressCard({ story, isExpanded, onToggle }: StoryProgressCardProps) {
  const { t } = useTranslation()

  const statusIcon = {
    pending: <Circle className="text-muted-foreground" size={16} />,
    running: <Loader2 className="text-primary animate-spin" size={16} />,
    completed: <CheckCircle className="text-green-500" size={16} />,
    failed: <XCircle className="text-red-500" size={16} />
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
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {statusIcon}
        <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
        <span className="flex-1 font-medium text-foreground truncate">{story.title}</span>
        {story.duration && (
          <span className="text-sm text-muted-foreground">{formatDuration(story.duration)}</span>
        )}
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="pt-3 space-y-3">
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
              <ul className="list-disc list-inside space-y-1">
                {story.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>

            {story.commitHash && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{t('Commit')}</div>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{story.commitHash}</code>
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
