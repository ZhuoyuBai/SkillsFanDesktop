/**
 * SkillIndicator - Shows when a Skill is currently executing
 * Displays the skill name with gradient styling (similar to Claude Code ultrathink)
 * Features breathing animation when running
 */

import { Loader2 } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface SkillIndicatorProps {
  skillName: string
  isRunning: boolean
}

export function SkillIndicator({ skillName, isRunning }: SkillIndicatorProps) {
  const { t } = useTranslation()

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        bg-[#E07B2F] shadow-[0_0_15px_rgba(224,123,47,0.35)]
        ${isRunning ? 'skill-breathing' : ''}
        animate-fade-in
      `}
    >
      <span className="text-xs font-medium text-white">
        {t('Running skill: {{name}}', { name: skillName })}
      </span>
      {isRunning && (
        <Loader2 size={12} className="text-white/80 animate-spin" />
      )}
    </div>
  )
}
