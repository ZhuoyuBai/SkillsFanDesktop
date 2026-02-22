/**
 * ScheduleEditModal - Modal wrapper for editing task schedules
 *
 * Used in LoopTaskPanel for editing schedules of existing tasks.
 * Renders a modal overlay with enable toggle, SchedulePicker, and Save/Cancel.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/utils'
import { SchedulePicker } from './SchedulePicker'
import type { TaskSchedule } from '../../../../shared/types/loop-task'

interface ScheduleEditModalProps {
  schedule: TaskSchedule
  onSave: (schedule: TaskSchedule) => void
  onClose: () => void
}

export function ScheduleEditModal({ schedule, onSave, onClose }: ScheduleEditModalProps) {
  const { t } = useTranslation()
  const [local, setLocal] = useState<TaskSchedule>(() => ({
    ...schedule,
    type: schedule.type === 'manual' ? 'cron' : schedule.type,
    cronExpression: schedule.cronExpression || '0 9 * * *',
    enabled: schedule.enabled ?? true
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-2xl w-[400px] p-6">
        <h3 className="text-base font-medium mb-4">{t('Edit Schedule')}</h3>

        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t('Enable')}</span>
            <button
              onClick={() => setLocal({ ...local, enabled: !local.enabled })}
              className={cn(
                'relative w-10 h-5 rounded-full transition-colors',
                local.enabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                local.enabled ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          {/* Picker */}
          <SchedulePicker
            schedule={local}
            onChange={(s) => setLocal({ ...s, enabled: local.enabled })}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={() => onSave(local)}
            className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
