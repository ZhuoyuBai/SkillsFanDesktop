/**
 * StepIndicator - Visual step progress indicator for the wizard flow
 *
 * Displays the 4 steps of the task creation wizard:
 * 1. Create Task (select directory + method)
 * 2. Plan Edit (edit story list)
 * 3. Confirm (review and confirm)
 * 4. Execute (run the task)
 */

import { useTranslation } from 'react-i18next'
import type { WizardStep } from '../../../../shared/types/loop-task'

interface StepIndicatorProps {
  currentStep: WizardStep
}

const STEPS: { key: WizardStep; labelKey: string }[] = [
  { key: 1, labelKey: 'Step Create Task' },
  { key: 2, labelKey: 'Step Plan Edit' },
  { key: 3, labelKey: 'Step Confirm' },
  { key: 4, labelKey: 'Step Execute' }
]

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const { t } = useTranslation()
  const progress = (currentStep / STEPS.length) * 100

  return (
    <div className="px-6 py-4 shrink-0">
      {/* Progress bar */}
      <div className="relative h-1 bg-border/50 rounded-full mb-3">
        <div
          className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Current step text */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">
          {t(STEPS[currentStep - 1]?.labelKey || '')}
        </span>
        <span className="text-muted-foreground">
          {currentStep} / {STEPS.length}
        </span>
      </div>
    </div>
  )
}
