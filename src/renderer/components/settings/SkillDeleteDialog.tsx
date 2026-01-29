/**
 * Skill Delete Confirmation Dialog
 */

import { AlertTriangle, FolderOpen } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface SkillDeleteDialogProps {
  skillName: string
  skillDisplayName: string
  skillPath: string
  onConfirm: () => void
  onCancel: () => void
}

export function SkillDeleteDialog({
  skillName,
  skillDisplayName,
  skillPath,
  onConfirm,
  onCancel
}: SkillDeleteDialogProps) {
  const { t } = useTranslation()

  // Shorten path for display
  const shortPath = skillPath.replace(/^.*[/\\]\.skillsfan(-dev)?[/\\]skills[/\\]/, '~/.../skills/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      {/* Backdrop - click to cancel */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Dialog content */}
      <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-md animate-fade-in shadow-2xl">
        {/* Icon + Title */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground/95 tracking-tight">
              {t('Delete Skill?')}
            </h2>
            <p className="text-sm font-medium text-foreground mt-1">{skillDisplayName}</p>
          </div>
        </div>

        {/* Warning message */}
        <p className="text-sm text-muted-foreground mb-3">
          {t(
            'This will permanently delete the skill folder and all its contents. This action cannot be undone.'
          )}
        </p>

        {/* Path display */}
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 rounded-lg mb-6">
          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground/80 font-mono truncate">{shortPath}</span>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-xl shadow-sm hover:shadow-md transition-all"
          >
            {t('Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
