import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { DEFAULT_CONFIG } from '../../types'
import type { HaloConfig } from '../../types'
import { Switch } from '../ui/Switch'

interface TerminalSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  onReapplyCurrentTerminal: () => Promise<void> | void
}

export function TerminalSettingsDialog({
  isOpen,
  onClose
}: TerminalSettingsDialogProps) {
  const { t } = useTranslation()
  const { config, setConfig } = useAppStore()

  const effectiveConfig = config ?? DEFAULT_CONFIG
  const [skipClaudeLogin, setSkipClaudeLogin] = useState(
    effectiveConfig.terminal?.skipClaudeLogin ?? DEFAULT_CONFIG.terminal!.skipClaudeLogin
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSkipClaudeLogin(
      effectiveConfig.terminal?.skipClaudeLogin ?? DEFAULT_CONFIG.terminal!.skipClaudeLogin
    )
    setError(null)
  }, [effectiveConfig, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleToggleSkipClaudeLogin = async (nextValue: boolean) => {
    const previousValue = skipClaudeLogin
    setSkipClaudeLogin(nextValue)
    setIsSaving(true)
    setError(null)

    try {
      const result = await api.setConfig({
        terminal: {
          skipClaudeLogin: nextValue
        }
      })

      if (result.success && result.data) {
        setConfig(result.data as HaloConfig)
        return
      }

      setSkipClaudeLogin(previousValue)
      setError(result.error || t('Failed to save terminal settings'))
    } catch (saveError) {
      setSkipClaudeLogin(previousValue)
      setError(saveError instanceof Error ? saveError.message : t('Failed to save terminal settings'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">{t('Terminal Settings')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('Close')}
            title={t('Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('Skip Claude login')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('Takes effect after creating a new terminal window.')}
            </p>
          </div>
          <Switch
            checked={skipClaudeLogin}
            onChange={handleToggleSkipClaudeLogin}
            disabled={isSaving}
          />
        </div>

        {error && (
          <div className="mt-3 text-xs text-destructive">{error}</div>
        )}
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
