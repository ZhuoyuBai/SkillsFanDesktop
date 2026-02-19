/**
 * UserQuestionCard - Display AskUserQuestion prompt (Compact Design)
 *
 * When AI calls AskUserQuestion tool, this card appears to let user
 * select an answer. Execution pauses until user responds.
 *
 * Features:
 * - Tab-based navigation for multiple questions
 * - Scrollable options area for long lists
 * - Auto-advance to next unanswered question
 */

import { useState, useEffect, useRef } from 'react'
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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const justAnsweredRef = useRef(false)

  // Auto-advance to next unanswered question when current one is answered
  useEffect(() => {
    if (!justAnsweredRef.current) return
    justAnsweredRef.current = false

    const currentQ = questions[currentQuestionIndex]
    if (currentQ && answers[currentQ.question]) {
      // Find next unanswered question
      const nextUnansweredIdx = questions.findIndex(
        (q, idx) => idx > currentQuestionIndex && !answers[q.question]
      )
      if (nextUnansweredIdx !== -1) {
        // Small delay for visual feedback
        const timer = setTimeout(() => {
          setCurrentQuestionIndex(nextUnansweredIdx)
        }, 150)
        return () => clearTimeout(timer)
      }
    }
  }, [answers, currentQuestionIndex, questions])

  const handleOptionSelect = (questionText: string, optionLabel: string) => {
    justAnsweredRef.current = true
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
  const currentQuestion = questions[currentQuestionIndex]
  const hasMultipleQuestions = questions.length > 1

  return (
    <div className="p-2.5 border border-primary/30 rounded-lg bg-primary/5 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="text-primary" size={14} />
        <span className="text-xs font-medium text-primary">{t('AI is asking')}</span>
      </div>

      {/* Tab navigation for multiple questions */}
      {hasMultipleQuestions && (
        <div className="flex gap-1 mb-2 pb-2 border-b border-border/50 overflow-x-auto scrollbar-hide">
          {questions.map((q, idx) => {
            const isActive = idx === currentQuestionIndex
            const isAnswered = !!answers[q.question]
            return (
              <button
                key={idx}
                onClick={() => setCurrentQuestionIndex(idx)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md whitespace-nowrap transition-all flex items-center gap-1',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isAnswered
                      ? 'bg-primary/20 text-primary hover:bg-primary/30'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {q.header}
                {isAnswered && !isActive && <Check size={10} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Current question content */}
      {currentQuestion && (
        <div className="max-h-[180px] overflow-y-auto">
          <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{currentQuestion.header}</p>
          <p className="text-xs font-medium mb-2">{currentQuestion.question}</p>

          <div className="space-y-1.5">
            {currentQuestion.options.map((opt, optIndex) => {
              const isSelected = answers[currentQuestion.question] === opt.label && !showCustom[currentQuestion.question]
              return (
                <button
                  key={optIndex}
                  onClick={() => handleOptionSelect(currentQuestion.question, opt.label)}
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
              onClick={() => handleCustomSelect(currentQuestion.question)}
              className={cn(
                'w-full text-left p-2 rounded border transition-all',
                'hover:border-primary/50 hover:bg-primary/5',
                showCustom[currentQuestion.question]
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                  : 'border-border'
              )}
            >
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  'w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                  showCustom[currentQuestion.question]
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30'
                )}>
                  {showCustom[currentQuestion.question] && <Check size={8} className="text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">{t('Other')}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{t('Enter a custom answer')}</div>
                </div>
              </div>
            </button>

            {/* Custom input field */}
            {showCustom[currentQuestion.question] && (
              <div className="pl-5 animate-in fade-in slide-in-from-top-1 duration-200">
                <input
                  type="text"
                  value={customInputs[currentQuestion.question] || ''}
                  onChange={(e) => handleCustomInput(currentQuestion.question, e.target.value)}
                  placeholder={t('Type your answer...')}
                  className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none focus:ring-0 focus:border-primary/50"
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer with submit/skip buttons */}
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
