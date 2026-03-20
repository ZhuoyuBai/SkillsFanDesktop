/**
 * SkillCreationPanel - 3-step wizard panel for creating new skills
 *
 * Renders inside SpacePage's right panel (same area as ChatView/LoopTaskPanel).
 * Controlled by selectionType === 'skillCreation'.
 *
 * Step 1: Describe your skill (form)
 * Step 2: Preview and edit (AI-generated SKILL.md)
 * Step 3: Success (save complete)
 */

import { useEffect } from 'react'
import { useSkillCreationStore } from '../../stores/skill-creation.store'
import { useChatStore } from '../../stores/chat.store'
import { Step1DescribeSkill } from './Step1DescribeSkill'
import { Step2PreviewEdit } from './Step2PreviewEdit'
import { Step3Complete } from './Step3Complete'
import { useTranslation } from '../../i18n'
import { cn } from '../../lib/utils'

// Inline step indicator (similar to LoopTask but self-contained)
function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const { t } = useTranslation()
  const { setWizardStep } = useSkillCreationStore()

  const steps = [
    { key: 1 as const, label: t('Describe') },
    { key: 2 as const, label: t('Preview & Edit') },
    { key: 3 as const, label: t('Complete') }
  ]

  return (
    <div className="px-6 py-2.5 shrink-0">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = step.key < currentStep
          const isCurrent = step.key === currentStep
          const canClick = isCompleted && currentStep < 3

          return (
            <div key={step.key} className="contents">
              <button
                onClick={() => canClick && setWizardStep(step.key)}
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
                  {step.key}
                </span>
                {step.label}
              </button>

              {index < steps.length - 1 && (
                <div className="flex-1 h-[2px] mx-3 bg-border rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500 ease-out',
                      step.key < currentStep ? 'bg-primary w-full' : 'w-0'
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

interface SkillCreationPanelProps {
  spaceId: string
}

export function SkillCreationPanel({ spaceId }: SkillCreationPanelProps) {
  const { wizardStep, spaceId: storeSpaceId, reset } = useSkillCreationStore()

  // Initialize store with spaceId if needed
  useEffect(() => {
    if (storeSpaceId !== spaceId) {
      useSkillCreationStore.setState({ spaceId })
    }
  }, [spaceId, storeSpaceId])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Step indicator - flush to top (with traffic light padding on macOS) */}
      <div className="pt-12 shrink-0">
        <StepIndicator currentStep={wizardStep} />
      </div>

      {/* Step content - flex-1 to take remaining space, overflow-hidden to enable child scrolling */}
      <div className="flex-1 overflow-hidden min-h-0">
        {wizardStep === 1 && <Step1DescribeSkill />}
        {wizardStep === 2 && <Step2PreviewEdit />}
        {wizardStep === 3 && <Step3Complete />}
      </div>
    </div>
  )
}
