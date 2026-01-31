/**
 * StepIndicator - Visual step progress indicator for the wizard flow
 *
 * Displays the 4 steps of the task creation wizard:
 * 1. Create Task (select directory + method)
 * 2. Plan Edit (edit story list)
 * 3. Confirm (review and confirm)
 * 4. Execute (run the task)
 */

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WizardStep } from '../../../../shared/types/loop-task'

interface StepIndicatorProps {
  currentStep: WizardStep
}

const STEPS: { key: WizardStep; labelKey: string }[] = [
  { key: 1, labelKey: 'Create Task' },
  { key: 2, labelKey: 'Plan Edit' },
  { key: 3, labelKey: 'Confirm' },
  { key: 4, labelKey: 'Execute' }
]

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-2 py-4 border-b border-border px-4 shrink-0">
      {STEPS.map((step, index) => (
        <Fragment key={step.key}>
          <div
            className={cn(
              'flex items-center gap-2 transition-colors',
              step.key === currentStep && 'text-primary',
              step.key < currentStep && 'text-green-600',
              step.key > currentStep && 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                step.key === currentStep && 'border-primary bg-primary/10 text-primary',
                step.key < currentStep && 'border-green-600 bg-green-600 text-white',
                step.key > currentStep && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {step.key < currentStep ? <Check size={14} /> : step.key}
            </span>
            <span className="text-sm hidden sm:inline">{t(step.labelKey)}</span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={cn(
                'w-8 h-0.5 transition-colors',
                step.key < currentStep ? 'bg-green-600' : 'bg-border'
              )}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}
