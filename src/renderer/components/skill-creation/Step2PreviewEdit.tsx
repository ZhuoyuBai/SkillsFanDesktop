/**
 * Step2PreviewEdit - Two phases:
 *   1. Generating: real-time streaming preview of SKILL.md being generated
 *   2. Complete: sectioned editor (Metadata + Instructions) for review/edit
 */

import { useEffect, useRef } from 'react'
import { useSkillCreationStore } from '../../stores/skill-creation.store'
import { useChatStore } from '../../stores/chat.store'
import { StreamdownRenderer } from '../chat/StreamdownRenderer'
import { ArrowLeft, RefreshCw, Save } from 'lucide-react'
import { useTranslation } from '../../i18n'

export function Step2PreviewEdit() {
  const { t } = useTranslation()
  const {
    generatedContent,
    updateGeneratedContent,
    isGenerating,
    generateError,
    generateSkill,
    saveSkill,
    setWizardStep,
    tempConversationId
  } = useSkillCreationStore()

  // Subscribe to streaming content from the temp conversation
  const session = useChatStore((s) =>
    tempConversationId ? s.sessions.get(tempConversationId) : undefined
  )
  const streamingContent = session?.streamingContent || ''
  const isStreaming = session?.isStreaming || false

  // Auto-scroll ref for streaming preview
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [streamingContent, isGenerating])

  const handleSave = async () => {
    await saveSkill()
  }

  // Phase 1: Generating — streaming preview
  if (isGenerating) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header with thinking dots */}
        <div className="shrink-0 px-6 py-3 flex items-center gap-2">
          <div className="thinking-dots flex items-center gap-1">
            <span className="dot w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="dot w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
            <span className="dot w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
          <span className="text-sm text-muted-foreground">{t('Generating your skill...')}</span>
        </div>

        {/* Streaming content */}
        <div ref={scrollRef} className="flex-1 overflow-auto px-6 pb-6">
          <div className="max-w-xl mx-auto">
            {streamingContent ? (
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-4">
                <StreamdownRenderer
                  content={streamingContent}
                  isStreaming={isStreaming}
                  className="text-sm"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <span className="text-sm text-muted-foreground">{t('Waiting for response...')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (generateError) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-sm text-destructive">{generateError}</p>
          <div className="flex gap-3">
            <button
              onClick={() => setWizardStep(1)}
              className="flex items-center gap-2 px-4 py-2 text-sm
                text-muted-foreground hover:text-foreground hover:bg-secondary
                rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('Back')}
            </button>
            <button
              onClick={() => generateSkill()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                bg-primary text-primary-foreground hover:bg-primary/90
                rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('Try Again')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // No content yet
  if (!generatedContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('No content generated yet.')}</p>
      </div>
    )
  }

  // Phase 2: Complete — sectioned editor
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="max-w-xl mx-auto space-y-5">
          {/* Metadata section */}
          <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('Metadata')}
            </h3>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('Name')}</label>
              <input
                type="text"
                value={generatedContent.name}
                onChange={(e) => updateGeneratedContent({ name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('Description')}</label>
              <textarea
                value={generatedContent.description}
                onChange={(e) => updateGeneratedContent({ description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg resize-none
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">
                {t('This controls when the skill triggers. Be specific and action-oriented.')}
              </p>
            </div>
          </div>

          {/* Instructions section */}
          <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('Instructions')}
            </h3>

            <textarea
              value={generatedContent.body}
              onChange={(e) => updateGeneratedContent({ body: e.target.value })}
              rows={20}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg resize-y
                font-mono leading-relaxed
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="shrink-0 border-t border-border/40 px-6 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setWizardStep(1)}
            className="flex items-center gap-2 px-4 py-2 text-sm
              text-muted-foreground hover:text-foreground hover:bg-secondary
              rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('Back')}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => generateSkill()}
              className="flex items-center gap-2 px-4 py-2 text-sm
                text-muted-foreground hover:text-foreground hover:bg-secondary
                rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('Regenerate')}
            </button>

            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium
                bg-primary text-primary-foreground hover:bg-primary/90
                rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {t('Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
