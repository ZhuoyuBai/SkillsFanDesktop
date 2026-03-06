/**
 * Updater Store - Centralized update state management
 */

import { create } from 'zustand'
import { api } from '../api'

type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

interface UpdaterStore {
  status: UpdaterStatus
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  downloadProgress: DownloadProgress | null
  errorMessage: string | null
  lastChecked: string | null
  dismissed: boolean

  dismiss: () => void
  init: () => () => void
}

/**
 * Simulate update states for development testing.
 * Usage in DevTools console: window.__updaterSimulate('available')
 */
export function simulateUpdater(status: UpdaterStatus): void {
  // Reset dismissed so notification shows
  useUpdaterStore.setState({ dismissed: false })

  switch (status) {
    case 'available':
      useUpdaterStore.setState({
        status: 'available',
        latestVersion: '99.0.0',
        releaseDate: new Date().toISOString(),
        releaseNotes: '- New Toast notification style\n- Periodic update checks\n- Improved error handling',
        downloadProgress: null,
        errorMessage: null
      })
      break

    case 'downloading': {
      let percent = 0
      const total = 85 * 1024 * 1024 // 85 MB
      useUpdaterStore.setState({
        status: 'downloading',
        latestVersion: '99.0.0',
        downloadProgress: { percent: 0, bytesPerSecond: 0, transferred: 0, total }
      })
      const interval = setInterval(() => {
        percent += 2 + Math.random() * 3
        if (percent >= 100) {
          percent = 100
          clearInterval(interval)
          setTimeout(() => {
            useUpdaterStore.setState({
              status: 'downloaded',
              downloadProgress: null,
              dismissed: false
            })
          }, 500)
        }
        const transferred = Math.floor((percent / 100) * total)
        useUpdaterStore.setState({
          downloadProgress: {
            percent,
            bytesPerSecond: 2 * 1024 * 1024 + Math.random() * 1024 * 1024,
            transferred,
            total
          }
        })
      }, 200)
      break
    }

    case 'downloaded':
      useUpdaterStore.setState({
        status: 'downloaded',
        latestVersion: '99.0.0',
        downloadProgress: null,
        errorMessage: null
      })
      break

    case 'error':
      useUpdaterStore.setState({
        status: 'error',
        errorMessage: 'Simulated: Update check timed out',
        downloadProgress: null
      })
      break

    default:
      useUpdaterStore.setState({ status, downloadProgress: null, errorMessage: null })
  }
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  status: 'idle',
  currentVersion: '',
  latestVersion: null,
  releaseDate: null,
  releaseNotes: null,
  downloadProgress: null,
  errorMessage: null,
  lastChecked: null,
  dismissed: false,

  dismiss: () => set({ dismissed: true }),

  init: () => {
    // Load initial version
    api.getVersion().then((result) => {
      if (result.success && result.data) {
        set({ currentVersion: result.data as string })
      }
    })

    const unsubStatus = api.onUpdaterStatus((data) => {
      const update: Partial<UpdaterStore> = {
        status: data.status,
        errorMessage: data.errorMessage ?? null,
        lastChecked: data.lastChecked ?? null
      }

      if (data.currentVersion) update.currentVersion = data.currentVersion
      if (data.latestVersion !== undefined) update.latestVersion = data.latestVersion
      if (data.releaseDate !== undefined) update.releaseDate = data.releaseDate
      if (data.releaseNotes !== undefined) update.releaseNotes = data.releaseNotes
      if (data.downloadProgress !== undefined) update.downloadProgress = data.downloadProgress

      // Reset dismissed when update becomes available or downloaded
      if (data.status === 'available' || data.status === 'downloaded') {
        update.dismissed = false
      }

      set(update as Partial<UpdaterStore>)
    })

    const unsubProgress = api.onDownloadProgress((data) => {
      set({ downloadProgress: data as DownloadProgress, status: 'downloading' })
    })

    return () => {
      unsubStatus()
      unsubProgress()
    }
  }
}))
