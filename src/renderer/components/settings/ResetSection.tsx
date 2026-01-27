/**
 * Reset Section - Danger zone for resetting all settings
 */

import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '../../api'

export function ResetSection() {
  const { t } = useTranslation()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResetClick = () => {
    setShowConfirmDialog(true)
    setError(null)
  }

  const handleConfirmReset = async () => {
    try {
      setIsResetting(true)
      setError(null)

      const result = await api.resetToDefault()

      if (result.success) {
        // Success - app will restart automatically
        // Show brief success message before restart
        console.log('[ResetSection] Reset successful, app will restart')
      } else {
        setError(result.error || t('Reset failed'))
        setIsResetting(false)
      }
    } catch (err) {
      console.error('[ResetSection] Reset error:', err)
      setError(t('Reset failed'))
      setIsResetting(false)
    }
  }

  const handleCancelReset = () => {
    setShowConfirmDialog(false)
    setError(null)
  }

  return (
    <>
      {/* Danger Zone Section */}
      <section className="bg-card rounded-xl border border-red-500/30 p-4 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            {t('This will clear all local data including configurations, history, and account information. The app will restart and return to the initial setup.')}
          </p>
        </div>
        <button
          onClick={handleResetClick}
          disabled={isResetting}
          className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 border border-red-500/30"
        >
          {t('Reset to Default Settings')}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
      </section>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={!isResetting ? handleCancelReset : undefined}
          />

          {/* Dialog */}
          <div className="relative bg-background rounded-xl shadow-2xl border border-border max-w-md w-full mx-4 p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-lg font-medium text-center mb-2">
              {t('Confirm Reset to Default')}
            </h3>

            {/* Warning Message */}
            <p className="text-sm text-muted-foreground text-center mb-4">
              {t('Are you sure you want to reset all settings?')}
            </p>

            {/* What will be cleared */}
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-red-500 mb-2">
                {t('This action will:')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{t('Delete all configurations')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{t('Delete all Spaces and conversations')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{t('Log out from your account')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{t('Clear API keys and model settings')}</span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancelReset}
                disabled={isResetting}
                className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('Resetting...')}
                  </>
                ) : (
                  t('Confirm Reset')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
