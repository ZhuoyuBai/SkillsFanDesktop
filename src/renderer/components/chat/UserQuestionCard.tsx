/**
 * UserQuestionCard - Display AskUserQuestion prompt (Compact Design)
 *
 * When AI calls AskUserQuestion tool, this card appears to let user
 * select an answer. Execution pauses until user responds.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface QuestionOption {
  label: string
  description: string
}

interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

interface UserQuestionCardProps {
  questions: Question[]
  onAnswer: (answers: Record<string, string>) => void
  onSkip: () => void
}

export function UserQuestionCard({ questions, onAnswer, onSkip }: UserQuestionCardProps) {
  const { t } = useTranslation()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({})

  const handleOptionSelect = (questionText: string, optionLabel: string) => {
    setAnswers(prev => ({ ...prev, [questionText]: optionLabel }))
    setShowCustom(prev => ({ ...prev, [questionText]: false }))
  }

  const handleCustomSelect = (questionText: string) => {
    setShowCustom(prev => ({ ...prev, [questionText]: true }))
    setAnswers(prev => {
      const newAnswers = { ...prev }
      delete newAnswers[questionText]
      return newAnswers
    })
  }

  const handleCustomInput = (questionText: string, value: string) => {
    setCustomInputs(prev => ({ ...prev, [questionText]: value }))
    if (value.trim()) {
      setAnswers(prev => ({ ...prev, [questionText]: value.trim() }))
    } else {
      setAnswers(prev => {
        const newAnswers = { ...prev }
        delete newAnswers[questionText]
        return newAnswers
      })
    }
  }

  const handleSubmit = () => {
    if (Object.keys(answers).length === questions.length) {
      onAnswer(answers)
    }
  }

  const allQuestionsAnswered = Object.keys(answers).length === questions.length

  return (
    <div className="p-2.5 border border-primary/30 rounded-lg bg-primary/5 mb-2 max-h-[240px] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="text-primary" size={14} />
        <span className="text-xs font-medium text-primary">{t('AI is asking')}</span>
      </div>

      {questions.map((q, qIndex) => (
        <div key={qIndex} className="mb-3 last:mb-0">
          <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{q.header}</p>
          <p className="text-xs font-medium mb-2">{q.question}</p>

          <div className="space-y-1.5">
            {q.options.map((opt, optIndex) => {
              const isSelected = answers[q.question] === opt.label && !showCustom[q.question]
              return (
                <button
                  key={optIndex}
                  onClick={() => handleOptionSelect(q.question, opt.label)}
                  className={cn(
                    'w-full text-left p-2 rounded border transition-all',
                    'hover:border-primary/50 hover:bg-primary/5',
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                      : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      'w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}>
                      {isSelected && <Check size={8} className="text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs">{opt.label}</div>
                      {opt.description && (
                        <div className="text-[10px] text-muted-foreground leading-tight">{opt.description}</div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}

            {/* Custom answer option */}
            <button
              onClick={() => handleCustomSelect(q.question)}
              className={cn(
                'w-full text-left p-2 rounded border transition-all',
                'hover:border-primary/50 hover:bg-primary/5',
                showCustom[q.question]
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                  : 'border-border'
              )}
            >
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  'w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                  showCustom[q.question]
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30'
                )}>
                  {showCustom[q.question] && <Check size={8} className="text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">{t('Other')}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{t('Enter a custom answer')}</div>
                </div>
              </div>
            </button>

            {/* Custom input field */}
            {showCustom[q.question] && (
              <div className="pl-5 animate-in fade-in slide-in-from-top-1 duration-200">
                <input
                  type="text"
                  value={customInputs[q.question] || ''}
                  onChange={(e) => handleCustomInput(q.question, e.target.value)}
                  placeholder={t('Type your answer...')}
                  className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary"
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2 mt-3 pt-2 border-t border-border/50">
        <button
          onClick={handleSubmit}
          disabled={!allQuestionsAnswered}
          className={cn(
            'flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all',
            allQuestionsAnswered
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {t('Submit')}
        </button>
        <button
          onClick={onSkip}
          className="py-1.5 px-3 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          {t('Skip')}
        </button>
      </div>
    </div>
  )
}
