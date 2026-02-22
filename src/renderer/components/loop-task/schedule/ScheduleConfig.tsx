/**
 * ScheduleConfig - Inline schedule configuration component
 *
 * Used in Step2PlanEdit for task creation wizard.
 * Renders as a bordered card with toggle header and SchedulePicker body.
 */

import { useTranslation } from 'react-i18next'
import { Clock, Info } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SchedulePicker } from './SchedulePicker'
import type { TaskSchedule } from '../../../../shared/types/loop-task'

interface ScheduleConfigProps {
  schedule?: TaskSchedule
  onChange: (schedule: TaskSchedule) => void
}

export function ScheduleConfig({ schedule, onChange }: ScheduleConfigProps) {
  const { t } = useTranslation()
  const isEnabled = schedule?.enabled ?? false

  const handleToggle = () => {
    const newSchedule: TaskSchedule = schedule?.type && schedule.type !== 'manual'
      ? { ...schedule, enabled: !isEnabled }
      : { type: 'cron', cronExpression: '0 9 * * *', enabled: !isEnabled }
    onChange(newSchedule)
  }

  return (
    <div className="border border-border rounded-lg">
      {/* Header with toggle */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">{t('Schedule')}</label>
          <div className="relative group/tooltip">
            <Info size={13} className="text-muted-foreground cursor-default" />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 bg-popover border border-border text-xs text-muted-foreground rounded-md px-2.5 py-2 shadow-md opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 whitespace-normal">
              {t('Runs only while SkillsFan is open')}
            </div>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors',
            isEnabled ? 'bg-primary' : 'bg-muted'
          )}
        >
          <div className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            isEnabled ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </button>
      </div>

      {/* Picker body - only show when enabled */}
      {isEnabled && schedule && (
        <div className="px-4 pb-4 pt-0 border-t border-border">
          <div className="pt-3">
            <SchedulePicker schedule={schedule} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  )
}
