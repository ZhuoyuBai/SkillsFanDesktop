/**
 * Update Notification Component
 * Shows a toast card in the top-right corner for available updates
 */

import { X } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useUpdaterStore } from '../../stores/updater.store'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function UpdateNotification() {
  const { t } = useTranslation()
  const { status, downloadProgress, dismissed, dismiss } = useUpdaterStore()

  const handleDownload = async () => {
    await api.downloadUpdate()
  }

  const handleInstall = () => {
    api.installUpdate()
  }

  const handleRetry = async () => {
    await api.checkForUpdates()
  }

  const handleOpenDownloadPage = () => {
    api.openDownloadPage()
  }

  if (dismissed) return null

  const showStatuses = ['available', 'downloading', 'downloaded', 'error']
  if (!showStatuses.includes(status)) return null

  return (
    <div className="fixed top-4 right-4 z-50 w-72 animate-in slide-in-from-right duration-300">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {status === 'available' && t('Version update available')}
              {status === 'downloading' && t('Downloading update...')}
              {status === 'downloaded' && t('Update ready to install')}
              {status === 'error' && t('Update check failed')}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {status === 'available' && t('Update now to experience new features')}
              {status === 'downloading' && downloadProgress &&
                `${downloadProgress.percent.toFixed(0)}% · ${formatBytes(downloadProgress.bytesPerSecond)}/s`}
              {status === 'downloaded' && t('Click restart to complete the installation')}
              {status === 'error' && t('Please check your network and try again')}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Download progress bar */}
        {status === 'downloading' && downloadProgress && (
          <div className="px-4 pb-2">
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Action button - full width */}
        <div className="px-4 pb-4 pt-2">
          {status === 'available' && (
            <button
              onClick={handleDownload}
              className="w-full py-2 bg-foreground hover:bg-foreground/90 text-background text-xs font-medium rounded-lg transition-colors"
            >
              {t('Update now')}
            </button>
          )}

          {status === 'downloading' && (
            <button
              onClick={dismiss}
              className="w-full py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-lg transition-colors"
            >
              {t('Hide')}
            </button>
          )}

          {status === 'downloaded' && (
            <button
              onClick={handleInstall}
              className="w-full py-2 bg-foreground hover:bg-foreground/90 text-background text-xs font-medium rounded-lg transition-colors"
            >
              {t('Restart to Install')}
            </button>
          )}

          {status === 'error' && (
            <div className="flex gap-2">
              <button
                onClick={handleOpenDownloadPage}
                className="flex-1 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-lg transition-colors"
              >
                {t('Download from website')}
              </button>
              <button
                onClick={handleRetry}
                className="flex-1 py-2 bg-foreground hover:bg-foreground/90 text-background text-xs font-medium rounded-lg transition-colors"
              >
                {t('Retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
