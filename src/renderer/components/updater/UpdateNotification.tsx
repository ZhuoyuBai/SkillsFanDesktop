/**
 * Update Notification Component
 * Shows a toast card in the top-right corner for available updates.
 */

import { X } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useUpdaterStore } from '../../stores/updater.store'

export function UpdateNotification() {
  const { t } = useTranslation()
  const { status, dismissed, dismiss } = useUpdaterStore()

  const handleOpenDownloadPage = () => {
    api.openDownloadPage()
  }

  if (dismissed) return null

  if (status !== 'available') return null

  return (
    <div className="fixed top-4 right-4 z-50 w-72 animate-in slide-in-from-right duration-300 no-drag">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {t('Version update available')}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {t('Update now to experience new features')}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-2">
          <button
            onClick={handleOpenDownloadPage}
            className="w-full py-2 bg-foreground hover:bg-foreground/90 text-background text-xs font-medium rounded-lg transition-colors"
          >
            {t('Download from website')}
          </button>
        </div>
      </div>
    </div>
  )
}
