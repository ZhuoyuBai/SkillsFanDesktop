/**
 * StepIndicator - Compact horizontal bar step indicator
 *
 * Displays steps inline with connecting lines:
 *   1 · Create Task ━━━ 2 · Plan Edit ━━━ 3 · Execute
 *
 * - Completed: primary color, clickable to go back
 * - Current: foreground bold
 * - Future: muted
 * - Cannot click back from Step 3 (execution)
 */

import { useTranslation } from 'react-i18next'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { cn } from '../../../lib/utils'
import type { WizardStep } from '../../../../shared/types/loop-task'

interface StepIndicatorProps {
  currentStep: WizardStep
}

const STEP_KEYS: WizardStep[] = [1, 2, 3]

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const { t } = useTranslation()
  const { setWizardStep } = useLoopTaskStore()

  // Use static t() calls so i18n scanner can extract keys
  const stepLabels: Record<WizardStep, string> = {
    1: t('Step Create Task'),
    2: t('Step Plan Edit'),
    3: t('Step Execute')
  }

  const handleStepClick = (stepKey: WizardStep) => {
    // Can only go back to completed steps, never forward
    // Cannot go back once in Step 3 (execution started)
    if (stepKey < currentStep && currentStep < 3) {
      setWizardStep(stepKey)
    }
  }

  return (
    <div className="px-6 py-2.5 shrink-0">
      <div className="flex items-center">
        {STEP_KEYS.map((step, index) => {
          const isCompleted = step < currentStep
          const isCurrent = step === currentStep
          const canClick = isCompleted && currentStep < 3

          return (
            <div key={step} className="contents">
              {/* Step label */}
              <button
                onClick={() => handleStepClick(step)}
                disabled={!canClick}
                className={cn(
                  'flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors duration-300',
                  isCompleted && 'text-primary',
                  isCompleted && canClick && 'cursor-pointer hover:text-primary/80',
                  isCurrent && 'text-foreground font-semibold',
                  !isCompleted && !isCurrent && 'text-muted-foreground',
                  !canClick && !isCurrent && 'cursor-default'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 transition-all duration-300',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-foreground/10 text-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}>
                  {step}
                </span>
                {stepLabels[step]}
              </button>

              {/* Connecting line (not after last step) */}
              {index < STEP_KEYS.length - 1 && (
                <div className="flex-1 h-[2px] mx-3 bg-border rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500 ease-out',
                      step < currentStep ? 'bg-primary w-full' : 'w-0'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
