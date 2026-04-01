import { AlertTriangle, RotateCw, Settings } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { describeTerminalLaunchError } from './terminal-error'

interface TerminalStatusOverlayProps {
  isExited: boolean
  startupError: string | null
  onRestart: () => void
  onOpenSettings: () => void
}

export function TerminalStatusOverlay({
  isExited,
  startupError,
  onRestart,
  onOpenSettings
}: TerminalStatusOverlayProps) {
  const { t } = useTranslation()

  if (startupError) {
    const issue = describeTerminalLaunchError(startupError, t)

    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm p-6">
        <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-start gap-3 p-5 border-b border-border">
            <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">{issue.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{issue.message}</p>
            </div>
          </div>

          {issue.suggestions.length > 0 && (
            <div className="px-5 pt-4 space-y-2">
              {issue.suggestions.map((suggestion) => (
                <p key={suggestion} className="text-sm text-muted-foreground">
                  {suggestion}
                </p>
              ))}
            </div>
          )}

          <div className="px-5 pt-4">
            <details className="rounded-xl border border-border bg-background/70">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground">
                {t('Technical Details')}
              </summary>
              <pre className="overflow-x-auto border-t border-border px-3 py-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {issue.technicalDetails}
              </pre>
            </details>
          </div>

          <div className="flex items-center justify-end gap-2 p-5">
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <Settings className="w-4 h-4" />
              {t('Settings')}
            </button>
            <button
              onClick={onRestart}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              {t('Restart Claude Code')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isExited) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <RotateCw className="w-4 h-4" />
          {t('Restart Claude Code')}
        </button>
      </div>
    )
  }

  return null
}
