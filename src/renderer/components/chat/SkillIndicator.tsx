/**
 * SkillIndicator - Shows when a Skill is currently executing
 * Displays the skill name with gradient styling (similar to Claude Code ultrathink)
 * Features breathing animation when running
 */

import { Sparkles, Loader2 } from 'lucide-react'
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
        ${isRunning ? 'skill-gradient-animated skill-breathing' : 'skill-gradient'}
        shadow-[0_0_20px_rgba(139,92,246,0.4)]
        animate-fade-in
      `}
    >
      <div className="relative">
        <Sparkles size={14} className="text-white" />
        {isRunning && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        )}
      </div>
      <span className="text-xs font-medium text-white">
        {t('Running skill: {{name}}', { name: skillName })}
      </span>
      {isRunning && (
        <Loader2 size={12} className="text-white/80 animate-spin" />
      )}
    </div>
  )
}
