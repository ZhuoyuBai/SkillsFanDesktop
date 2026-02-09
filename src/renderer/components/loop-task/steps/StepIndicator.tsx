/**
 * StepIndicator - Visual step progress indicator for the wizard flow
 *
 * Displays the 3 steps with connected dots:
 * - Completed: primary dot with checkmark, clickable to go back
 * - Current: primary dot with ring glow
 * - Future: muted outlined dot
 *
 * Cannot click back from Step 3 (execution).
 */

import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
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

  // Progress line: percentage of the track that is filled
  // Track spans from center of dot 1 to center of dot 3
  const progressPercent = ((currentStep - 1) / (STEP_KEYS.length - 1)) * 100

  return (
    <div className="px-6 py-5 shrink-0">
      <div className="relative flex items-start">
        {/* Track line (background) — spans between first and last dot centers */}
        <div className="absolute top-[15px] left-[16.67%] right-[16.67%] h-[2px] bg-border rounded-full" />
        {/* Active progress line */}
        <div className="absolute top-[15px] left-[16.67%] right-[16.67%] h-[2px] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step dots */}
        {STEP_KEYS.map((step) => {
          const isCompleted = step < currentStep
          const isCurrent = step === currentStep
          const canClick = isCompleted && currentStep < 3

          return (
            <div key={step} className="flex-1 flex flex-col items-center relative z-10">
              <button
                onClick={() => handleStepClick(step)}
                disabled={!canClick}
                className={cn(
                  'w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
                  isCompleted && 'bg-primary text-primary-foreground shadow-sm',
                  isCompleted && canClick && 'cursor-pointer hover:shadow-md hover:scale-105',
                  isCurrent && 'bg-primary text-primary-foreground shadow-md ring-[3px] ring-primary/25',
                  !isCompleted && !isCurrent && 'bg-background border-2 border-muted text-muted-foreground',
                  !canClick && !isCurrent && 'cursor-default'
                )}
              >
                {isCompleted ? <Check size={14} strokeWidth={2.5} /> : step}
              </button>
              <span
                className={cn(
                  'text-[11px] mt-2 text-center leading-tight transition-colors duration-300',
                  isCurrent && 'text-foreground font-medium',
                  isCompleted && 'text-foreground',
                  !isCompleted && !isCurrent && 'text-muted-foreground'
                )}
              >
                {stepLabels[step]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
