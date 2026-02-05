/**
 * Updater Service - In-app Auto Update via electron-updater
 *
 * Uses electron-updater to check, download, and install updates from Cloudflare R2.
 * Supports differential/delta updates via blockmap files.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import electronUpdater, { type UpdateInfo as ElectronUpdateInfo, type ProgressInfo } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

const { autoUpdater } = electronUpdater

// ============================================================================
// Types
// ============================================================================

/** Update information */
interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
}

/** Download progress */
interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

/** Updater status */
type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** Full updater state */
interface UpdaterState {
  status: UpdaterStatus
  updateInfo: UpdateInfo
  downloadProgress: DownloadProgress | null
  errorMessage: string | null
  lastChecked: string | null
}

// ============================================================================
// Configuration
// ============================================================================

const UPDATER_CONFIG = {
  /** Delay before first check after startup (ms) */
  STARTUP_DELAY: 5000,

  /** Timeout for update check (ms) */
  CHECK_TIMEOUT: 15000,

  /** Fallback download page URL */
  DOWNLOAD_PAGE_URL: 'https://www.skills.fan/download'
}

// ============================================================================
// State
// ============================================================================

let mainWindow: BrowserWindow | null = null

let state: UpdaterState = {
  status: 'idle',
  updateInfo: {
    currentVersion: '',
    latestVersion: null,
    releaseDate: null,
    releaseNotes: null
  },
  downloadProgress: null,
  errorMessage: null,
  lastChecked: null
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send update status to renderer process
 */
function sendUpdateStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', {
      status: state.status,
      ...state.updateInfo,
      downloadProgress: state.downloadProgress,
      errorMessage: state.errorMessage,
      lastChecked: state.lastChecked
    })
  }
}

/**
 * Send download progress to renderer process
 */
function sendDownloadProgress(progress: DownloadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:download-progress', progress)
  }
}

/**
 * Update state and notify renderer
 */
function updateState(updates: Partial<UpdaterState>): void {
  state = { ...state, ...updates }
  sendUpdateStatus()
}

/**
 * Extract release notes from update info
 */
function extractReleaseNotes(info: ElectronUpdateInfo): string | null {
  if (!info.releaseNotes) return null

  if (typeof info.releaseNotes === 'string') {
    return info.releaseNotes
  }

  // Handle array of release notes
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes.map((note) => note.note || '').join('\n\n')
  }

  return null
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize updater service with electron-updater
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Initialize current version
  state.updateInfo.currentVersion = app.getVersion()

  if (is.dev) {
    console.log('[Updater] Skipping auto-update in development mode')
    return
  }

  // Configure autoUpdater
  autoUpdater.autoDownload = false // Don't auto-download, let user confirm
  autoUpdater.autoInstallOnAppQuit = true // Install on quit if downloaded
  autoUpdater.autoRunAppAfterInstall = true // Restart app after install

  // Set up event listeners
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...')
    updateState({ status: 'checking', errorMessage: null })
  })

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] Update available: ${info.version}`)
    updateState({
      status: 'available',
      updateInfo: {
        currentVersion: app.getVersion(),
        latestVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseNotes: extractReleaseNotes(info)
      },
      lastChecked: new Date().toISOString()
    })
  })

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] Current version ${app.getVersion()} is up to date`)
    updateState({
      status: 'not-available',
      updateInfo: {
        currentVersion: app.getVersion(),
        latestVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseNotes: extractReleaseNotes(info)
      },
      lastChecked: new Date().toISOString()
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const downloadProgress: DownloadProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }

    state.downloadProgress = downloadProgress
    state.status = 'downloading'
    sendUpdateStatus()
    sendDownloadProgress(downloadProgress)
  })

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] Update downloaded: ${info.version}`)
    updateState({
      status: 'downloaded',
      updateInfo: {
        currentVersion: app.getVersion(),
        latestVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseNotes: extractReleaseNotes(info)
      },
      downloadProgress: null
    })
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('[Updater] Error:', error.message)
    updateState({
      status: 'error',
      errorMessage: error.message,
      downloadProgress: null,
      lastChecked: new Date().toISOString()
    })
  })

  // Check for updates on startup (with delay to not block app launch)
  setTimeout(() => {
    checkForUpdates()
  }, UPDATER_CONFIG.STARTUP_DELAY)
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<UpdaterState> {
  // Update current version in case it changed
  state.updateInfo.currentVersion = app.getVersion()

  if (is.dev) {
    console.log('[Updater] Skipping update check in development mode')
    return state
  }

  try {
    // Create timeout promise to avoid hanging indefinitely
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Update check timed out')), UPDATER_CONFIG.CHECK_TIMEOUT)
    )

    // Race between actual check and timeout
    await Promise.race([autoUpdater.checkForUpdates(), timeoutPromise])
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Updater] Failed to check for updates:', errorMessage)
    updateState({
      status: 'error',
      errorMessage,
      lastChecked: new Date().toISOString()
    })
  }

  return state
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<void> {
  if (is.dev) {
    console.log('[Updater] Skipping download in development mode')
    return
  }

  if (state.status !== 'available') {
    console.log('[Updater] No update available to download')
    return
  }

  console.log('[Updater] Starting download...')
  updateState({ status: 'downloading', downloadProgress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 } })

  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Download failed'
    console.error('[Updater] Download failed:', errorMessage)
    updateState({
      status: 'error',
      errorMessage,
      downloadProgress: null
    })
  }
}

/**
 * Install the downloaded update and restart the app
 */
export function installUpdate(): void {
  if (is.dev) {
    console.log('[Updater] Skipping install in development mode')
    return
  }

  if (state.status !== 'downloaded') {
    console.log('[Updater] No update downloaded to install')
    return
  }

  console.log('[Updater] Installing update and restarting...')
  autoUpdater.quitAndInstall(false, true) // isSilent=false, isForceRunAfter=true
}

/**
 * Open download page in default browser (fallback)
 */
export function openDownloadPage(): void {
  shell.openExternal(UPDATER_CONFIG.DOWNLOAD_PAGE_URL)
  console.log('[Updater] Opened download page:', UPDATER_CONFIG.DOWNLOAD_PAGE_URL)
}

/**
 * Get current updater state
 */
export function getUpdateInfo(): UpdaterState {
  // Ensure current version is up to date
  state.updateInfo.currentVersion = app.getVersion()
  return { ...state }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register IPC handlers for updater
 */
export function registerUpdaterHandlers(): void {
  // Check for updates
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await checkForUpdates()
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Download update
  ipcMain.handle('updater:download', async () => {
    try {
      await downloadUpdate()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Download failed' }
    }
  })

  // Install update (quit and install)
  ipcMain.handle('updater:install', () => {
    try {
      installUpdate()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Install failed' }
    }
  })

  // Get current app version
  ipcMain.handle('updater:get-version', () => {
    return { success: true, data: app.getVersion() }
  })

  // Get full update state
  ipcMain.handle('updater:get-info', () => {
    return { success: true, data: getUpdateInfo() }
  })

  // Open download page (fallback)
  ipcMain.handle('updater:open-download', () => {
    openDownloadPage()
    return { success: true }
  })
}
