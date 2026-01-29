/**
 * SpaceGuideDialog - Modal dialog explaining what spaces are
 *
 * Features:
 * - Displays educational content about spaces in a dialog
 * - Reuses content from SpaceGuide component
 * - Cross-platform & theme-aware
 */

import {
  X,
  Zap,
  Folder,
  HelpCircle,
  AlertTriangle
} from 'lucide-react'
import { useTranslation } from '../../i18n'
import { usePlatform } from '../layout/Header'

interface SpaceGuideDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SpaceGuideDialog({ isOpen, onClose }: SpaceGuideDialogProps) {
  const { t } = useTranslation()
  const platform = usePlatform()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg transition-colors z-10"
          aria-label={t('Close')}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
          {/* Title */}
          <h2 className="text-lg font-semibold mb-5 pr-8">{t('What is a Space?')}</h2>

          <div className="space-y-5">
            {/* Section 1: What can AI do */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-foreground/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="w-4 h-4 text-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium mb-1.5">{t('What can AI do?')}</h4>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-1">
                  <p>{t('Halo is not just chat, it can help you do things')}</p>
                  <p>{t('Use natural language to have it write documents, create spreadsheets, search the web, write code...')}</p>
                  <p>{t('It can create, modify, and delete files')}</p>
                </div>
              </div>
            </div>

            {/* Section 2: What is a space */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-foreground/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Folder className="w-4 h-4 text-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium mb-1.5">{t('What is a space?')}</h4>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-1">
                  <p>{t('AI-generated files (we call them "artifacts") need a place to be stored')}</p>
                  <p>{t('A space is their home, an independent folder')}</p>
                </div>
              </div>
            </div>

            {/* Section 3: Default space vs Custom space */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-foreground/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                <HelpCircle className="w-4 h-4 text-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium mb-2.5">{t('When do you need to create one?')}</h4>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                  {/* Default space */}
                  <div className="space-y-0.5">
                    <p className="text-foreground/90 font-medium">{t('Casual chat, asking questions')}</p>
                    <p>{t('Use Halo space')}</p>
                    <p>{t('Suitable for default space')}</p>
                    <p className="text-muted-foreground/70 font-mono text-[11px]">
                      {platform.isMac ? '~/.skillsfan/spaces/{项目名}' : '%USERPROFILE%\\.skillsfan\\spaces\\{项目名}'}
                    </p>
                  </div>
                  {/* Custom space */}
                  <div className="space-y-0.5">
                    <p className="text-foreground/90 font-medium">{t('Projects, long-term tasks')}</p>
                    <p>{t('Recommend creating a dedicated space')}</p>
                    <p>{t('Suitable for custom space')}</p>
                    <p className="text-muted-foreground/70 font-mono text-[11px]">
                      {t('User selected directory')}
                    </p>
                  </div>
                  <p className="pt-1 text-muted-foreground/80">{t('Keep files from different projects organized')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Warning section */}
          <div className="mt-5 px-3 py-2.5 bg-foreground/5 border border-border/40 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground/80 font-medium">{t('AI has delete permissions')}</span>
                {t(', be mindful of backing up important files')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-border/40 bg-card">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          >
            {t('Got it')}
          </button>
        </div>
      </div>
    </div>
  )
}
