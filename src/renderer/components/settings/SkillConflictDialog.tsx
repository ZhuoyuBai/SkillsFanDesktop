/**
 * Skill Conflict Resolution Dialog
 * Shown when installing a skill with a name that already exists
 */

import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface SkillConflictDialogProps {
  skillName: string
  onResolve: (resolution: 'replace' | 'rename' | 'cancel') => void
}

export function SkillConflictDialog({ skillName, onResolve }: SkillConflictDialogProps) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      {/* Backdrop - click to cancel */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onResolve('cancel')}
      />
      {/* Dialog content */}
      <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-md animate-fade-in shadow-2xl">
        {/* Icon + Title */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground/95 tracking-tight">
              {t('Skill Already Exists')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('A skill named "{{name}}" is already installed.', { name: skillName })}
            </p>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-muted-foreground mb-6">
          {t('How would you like to proceed?')}
        </p>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={() => onResolve('replace')}
            className="w-full px-4 py-2.5 text-sm text-left bg-secondary/60 hover:bg-secondary rounded-xl transition-colors"
          >
            <div className="font-medium text-foreground">{t('Replace Existing')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('Delete the old skill and install the new one')}
            </div>
          </button>

          <button
            onClick={() => onResolve('rename')}
            className="w-full px-4 py-2.5 text-sm text-left bg-secondary/60 hover:bg-secondary rounded-xl transition-colors"
          >
            <div className="font-medium text-foreground">{t('Keep Both')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('Install with a different name (e.g., {{name}}-1)', { name: skillName })}
            </div>
          </button>

          <button
            onClick={() => onResolve('cancel')}
            className="w-full px-4 py-2.5 text-sm text-center text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl transition-colors"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
