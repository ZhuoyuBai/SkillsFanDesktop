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
    <div className="flex-1 overflow-auto px-6 py-6" onKeyDown={handleKeyDown}>
      <div className="max-w-xl mx-auto space-y-5">
        {/* Skill name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {t('Skill Name')}
          </label>
          <input
            type="text"
            value={formData.skillName}
            onChange={(e) => updateFormData({ skillName: e.target.value })}
            placeholder={t('Give your skill a name')}
            className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
              placeholder:text-muted-foreground/50"
          />
        </div>

        {/* What it does */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {t('What does this skill do?')}
          </label>
          <textarea
            value={formData.whatItDoes}
            onChange={(e) => updateFormData({ whatItDoes: e.target.value })}
            placeholder={t('Describe the skill\'s purpose. e.g., "Help me review code quality, check for security vulnerabilities, bugs, and best practices, and give structured feedback."')}
            rows={4}
            className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg resize-none
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
              placeholder:text-muted-foreground/50"
          />
        </div>

        {/* When to trigger */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {t('When should it trigger?')}
          </label>
          <textarea
            value={formData.whenToTrigger}
            onChange={(e) => updateFormData({ whenToTrigger: e.target.value })}
            placeholder={t('Describe trigger scenarios. e.g., "When user says \'review my code\', \'code review\', \'check this PR\', or mentions reviewing changes."')}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg resize-none
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
              placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Create button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="px-8 py-2.5 text-sm font-medium
              bg-primary text-primary-foreground hover:bg-primary/90
              rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? t('Creating...') : t('Create')}
          </button>
        </div>
      </div>
    </div>
  )
}
