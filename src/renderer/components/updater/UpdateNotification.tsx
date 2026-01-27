/**
 * Update Notification Component
 * Shows a toast-like notification for available updates
 *
 * Behavior:
 * - 'available': New version available, user can click to download from website
 *
 * The component shows a notification when a new version is detected.
 */

import { useEffect, useState } from 'react'
import { Download, X, ExternalLink } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

interface UpdateInfo {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'error'
  currentVersion?: string
  latestVersion?: string | null
  releaseDate?: string | null
  releaseNotes?: string | null
  downloadUrl?: string | null
  downloadPageUrl?: string | null
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

export function UpdateNotification() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  const [notificationVersion, setNotificationVersion] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string[]>([])

  useEffect(() => {
    // Listen for updater status events
    const unsubscribe = api.onUpdaterStatus((data: UpdateInfo) => {
      console.log('[UpdateNotification] Received update status:', data)

      // Show notification when update is available
      if (data.status === 'available' && data.latestVersion) {
        setNotificationVersion(data.latestVersion)
        setReleaseNotes(parseReleaseNotes(data.releaseNotes))
        setDismissed(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleDownload = () => {
    // Open download page in browser
    api.openDownloadPage()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Show notification when we have a version to notify and not dismissed
  if (!notificationVersion || dismissed) {
    return null
  }

  const hasNotes = releaseNotes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleDismiss} />
      <div
        className={`relative bg-card border border-border rounded-lg shadow-xl p-4 ${hasNotes ? 'max-w-md' : 'max-w-sm'}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-foreground">
              {t('New version {{version}} available', { version: notificationVersion })}
            </h4>

            {hasNotes ? (
              <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                {releaseNotes.map((note, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">{t('Click to download')}</p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-md transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('Go to download')}
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                {t('Later')}
              </button>
            </div>
          </div>

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
