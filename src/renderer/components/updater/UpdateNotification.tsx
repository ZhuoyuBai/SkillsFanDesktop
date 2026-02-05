/**
 * Update Notification Component
 * Shows a toast-like notification for available updates with in-app download support
 *
 * Behavior:
 * - 'available': New version available, user can click to download
 * - 'downloading': Shows download progress bar
 * - 'downloaded': Update ready, user can restart to install
 */

import { useEffect, useState } from 'react'
import { Download, X, RefreshCw, CheckCircle, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

interface UpdateInfo {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion?: string
  latestVersion?: string | null
  releaseDate?: string | null
  releaseNotes?: string | null
  downloadProgress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  } | null
  errorMessage?: string | null
  lastChecked?: string | null
}

// Parse release notes to array of strings
function parseReleaseNotes(notes: string | null | undefined): string[] {
  if (!notes) return []

  // Split by newlines and filter out empty lines
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s*/, '')) // Remove leading - or *
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function UpdateNotification() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string[]>([])

  useEffect(() => {
    // Listen for updater status events
    const unsubscribe = api.onUpdaterStatus((data) => {
      console.log('[UpdateNotification] Received update status:', data)
      setUpdateInfo(data as UpdateInfo)

      // Parse release notes when available
      if (data.status === 'available' && data.releaseNotes) {
        setReleaseNotes(parseReleaseNotes(data.releaseNotes as string))
        setDismissed(false)
      }

      // Reset dismissed when new download completes
      if (data.status === 'downloaded') {
        setDismissed(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleDownload = async () => {
    await api.downloadUpdate()
  }

  const handleInstall = () => {
    api.installUpdate()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Don't show if dismissed or no update info
  if (dismissed || !updateInfo) {
    return null
  }

  // Only show for relevant statuses
  const showStatuses = ['available', 'downloading', 'downloaded']
  if (!showStatuses.includes(updateInfo.status)) {
    return null
  }

  const hasNotes = releaseNotes.length > 0
  const progress = updateInfo.downloadProgress

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleDismiss} />
      <div
        className={`relative bg-card border border-border rounded-lg shadow-xl p-4 ${hasNotes ? 'max-w-md' : 'max-w-sm'} w-full mx-4`}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
            {updateInfo.status === 'downloading' && (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            )}
            {updateInfo.status === 'downloaded' && (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            {updateInfo.status === 'available' && (
              <Download className="w-5 h-5 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <h4 className="text-sm font-medium text-foreground">
              {updateInfo.status === 'downloaded' && t('Update ready to install')}
              {updateInfo.status === 'downloading' && t('Downloading update...')}
              {updateInfo.status === 'available' &&
                t('New version {{version}} available', { version: updateInfo.latestVersion })}
            </h4>

            {/* Release notes (only show for available status) */}
            {updateInfo.status === 'available' && hasNotes && (
              <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                {releaseNotes.map((note, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Download progress */}
            {updateInfo.status === 'downloading' && progress && (
              <div className="mt-2 space-y-1">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(progress.percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.percent.toFixed(0)}%</span>
                  <span>
                    {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                  </span>
                  <span>{formatBytes(progress.bytesPerSecond)}/s</span>
                </div>
              </div>
            )}

            {/* Downloaded message */}
            {updateInfo.status === 'downloaded' && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('Click restart to complete the installation')}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              {updateInfo.status === 'available' && (
                <>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-md transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('Download')}
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs transition-colors"
                  >
                    {t('Later')}
                  </button>
                </>
              )}

              {updateInfo.status === 'downloading' && (
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  {t('Hide')}
                </button>
              )}

              {updateInfo.status === 'downloaded' && (
                <>
                  <button
                    onClick={handleInstall}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t('Restart')}
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs transition-colors"
                  >
                    {t('Later')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
