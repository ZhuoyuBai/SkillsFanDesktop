/**
 * Step1DescribeSkill - Form to collect skill requirements
 */

import { useSkillCreationStore } from '../../stores/skill-creation.store'
import { useTranslation } from '../../i18n'

export function Step1DescribeSkill() {
  const { t } = useTranslation()
  const { formData, updateFormData, generateSkill, isGenerating } = useSkillCreationStore()

  const canGenerate = formData.whatItDoes.trim().length > 0 && formData.whenToTrigger.trim().length > 0

  const handleGenerate = () => {
    if (canGenerate && !isGenerating) {
      generateSkill()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canGenerate) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0" onKeyDown={handleKeyDown}>
      <div className="flex-1 overflow-auto p-4 min-h-0">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Title */}
          <div className="text-center pt-4">
            <h3 className="text-3xl font-bold text-foreground">
              {t('Create Your Skill')}
            </h3>
          </div>

          {/* Skill name */}
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">
              {t('Skill Name')}
            </label>
            <input
              type="text"
              value={formData.skillName}
              onChange={(e) => updateFormData({ skillName: e.target.value })}
              placeholder={t('Give your skill a name')}
              className="w-full px-4 py-3 border border-border bg-card/95 rounded-2xl text-foreground
                placeholder:text-muted-foreground/50
                focus:outline-none focus:ring-0 focus:border-primary/50
                transition-all"
            />
          </div>

          {/* What it does */}
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">
              {t('What does this skill do?')}
            </label>
            <textarea
              value={formData.whatItDoes}
              onChange={(e) => updateFormData({ whatItDoes: e.target.value })}
              placeholder={t('Describe what you want this skill to help you with. e.g., "Help me write professional emails, polish the tone and grammar, and suggest better ways to express my ideas."')}
              rows={4}
              className="w-full px-4 py-3 border border-border bg-card/95 rounded-2xl text-foreground
                placeholder:text-muted-foreground/50
                focus:outline-none focus:ring-0 focus:border-primary/50
                resize-none transition-all"
            />
          </div>

          {/* When to trigger */}
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">
              {t('When should it trigger?')}
            </label>
            <textarea
              value={formData.whenToTrigger}
              onChange={(e) => updateFormData({ whenToTrigger: e.target.value })}
              placeholder={t('Describe when this skill should activate. e.g., "When I say \'help me write an email\', \'polish this text\', or ask for help with writing."')}
              rows={3}
              className="w-full px-4 py-3 border border-border bg-card/95 rounded-2xl text-foreground
                placeholder:text-muted-foreground/50
                focus:outline-none focus:ring-0 focus:border-primary/50
                resize-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div />
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors flex items-center gap-2"
          >
            {isGenerating ? t('Creating...') : t('Create')}
          </button>
        </div>
      </div>
    </div>
  )
}
