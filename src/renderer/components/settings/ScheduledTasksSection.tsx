/**
 * ScheduledTasksSection - Global view of all scheduled loop tasks across spaces
 *
 * Displays in Settings page. Shows active and paused scheduled tasks with
 * schedule info, next run time, and management actions (pause/resume/delete).
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock,
  Pause,
  Play,
  Trash2,
  Loader2,
  Calendar,
  Timer,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { api } from '../../api'
import { cn } from '../../lib/utils'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { formatScheduleDescription, formatNextRunTime } from '../loop-task/schedule'
import type { LoopTaskMeta, TaskSchedule } from '../../../shared/types/loop-task'

interface ScheduledTask extends LoopTaskMeta {
  spaceName?: string
}

export function ScheduledTasksSection() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      setError(null)
      const result = await api.loopTaskListScheduled()
      if (result.success && result.data) {
        setTasks(result.data as ScheduledTask[])
      } else {
        console.error('[ScheduledTasks] Load error:', result.error)
        setError(t('Failed to load scheduled tasks'))
      }
    } catch (err) {
      console.error('[ScheduledTasks] Load error:', err)
      setError(t('Failed to load scheduled tasks'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Pause a scheduled task
  const handleToggleSchedule = async (task: ScheduledTask) => {
    if (!task.schedule) return
    setTogglingId(task.id)
    try {
      const newSchedule: TaskSchedule = {
        ...task.schedule,
        enabled: !task.schedule.enabled
      }
      const result = await api.loopTaskUpdate(task.spaceId, task.id, { schedule: newSchedule })
      if (result.success) {
        await loadTasks()
      }
    } catch (err) {
      console.error('Failed to toggle schedule:', err)
    } finally {
      setTogglingId(null)
    }
  }

  // Remove schedule from a task
  const handleDeleteSchedule = async () => {
    if (!deleteTarget) return
    try {
      const newSchedule: TaskSchedule = {
        type: 'manual',
        enabled: false
      }
      const result = await api.loopTaskUpdate(deleteTarget.spaceId, deleteTarget.id, { schedule: newSchedule })
      if (result.success) {
        await loadTasks()
      }
    } catch (err) {
      console.error('Failed to delete schedule:', err)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Split into active and paused
  const activeTasks = tasks.filter(t => t.schedule?.enabled)
  const pausedTasks = tasks.filter(t => !t.schedule?.enabled)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t('Scheduled Tasks')}</h2>
        <button
          onClick={() => { setIsLoading(true); loadTasks() }}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={t('Refresh')}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('Scheduled tasks run automatically while SkillsFan is open. Closing the app will pause all schedules.')}
      </p>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
          <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center mb-3 text-muted-foreground">
            <Clock size={28} strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">{t('No scheduled tasks')}</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t('Create a Loop Task with a schedule to see it here.')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active tasks */}
          {activeTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm font-medium text-foreground">
                  {t('Active')} ({activeTasks.length})
                </span>
              </div>
              {activeTasks.map(task => (
                <ScheduledTaskCard
                  key={task.id}
                  task={task}
                  isToggling={togglingId === task.id}
                  onToggle={() => handleToggleSchedule(task)}
                  onDelete={() => setDeleteTarget(task)}
                />
              ))}
            </div>
          )}

          {/* Paused tasks */}
          {pausedTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t('Paused')} ({pausedTasks.length})
                </span>
              </div>
              {pausedTasks.map(task => (
                <ScheduledTaskCard
                  key={task.id}
                  task={task}
                  isToggling={togglingId === task.id}
                  onToggle={() => handleToggleSchedule(task)}
                  onDelete={() => setDeleteTarget(task)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('Remove Schedule')}
        message={t('This will remove the schedule from this task. The task itself will not be deleted.')}
        variant="danger"
        onConfirm={handleDeleteSchedule}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ============================================
// Task Card
// ============================================

interface ScheduledTaskCardProps {
  task: ScheduledTask
  isToggling: boolean
  onToggle: () => void
  onDelete: () => void
}

function ScheduledTaskCard({ task, isToggling, onToggle, onDelete }: ScheduledTaskCardProps) {
  const { t } = useTranslation()
  const schedule = task.schedule!
  const isActive = schedule.enabled

  return (
    <div className={cn(
      'border rounded-lg p-3 transition-colors',
      isActive ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-70'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Task name and space */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-foreground truncate">{task.name}</span>
            {task.spaceName && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                {task.spaceName}
              </span>
            )}
          </div>

          {/* Schedule info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {schedule.type === 'cron' ? <Calendar size={12} /> : <Timer size={12} />}
              {formatScheduleDescription(schedule, t)}
            </span>
            {schedule.nextScheduledAt && isActive && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatNextRunTime(schedule.nextScheduledAt, t)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggle}
            disabled={isToggling}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              isActive
                ? 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600'
                : 'hover:bg-success/10 text-muted-foreground hover:text-success'
            )}
            title={isActive ? t('Pause') : t('Resume')}
          >
            {isToggling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isActive ? (
              <Pause size={14} />
            ) : (
              <Play size={14} />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title={t('Remove Schedule')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

