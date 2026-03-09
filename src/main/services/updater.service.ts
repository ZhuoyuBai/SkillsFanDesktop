/**
 * Updater Service - Update check and download page redirect
 *
 * Uses electron-updater to check for updates from Cloudflare R2.
 * Since the app is not code-signed, auto-install is not supported on macOS.
 * Instead, users are directed to the website to download the latest version.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import electronUpdater, { type UpdateInfo as ElectronUpdateInfo } from 'electron-updater'
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

/** Updater status */
type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'error'

/** Full updater state */
interface UpdaterState {
  status: UpdaterStatus
  updateInfo: UpdateInfo
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

  /** Interval for periodic update checks (ms) - 4 hours */
  PERIODIC_CHECK_INTERVAL: 4 * 60 * 60 * 1000,

  /** Download page URL (uses SKILLSFAN_BASE_URL for region awareness) */
  get DOWNLOAD_PAGE_URL() {
    try {
      const { SKILLSFAN_BASE_URL } = require('./skillsfan/constants')
      return `${SKILLSFAN_BASE_URL}/download`
    } catch {
      return 'https://www.skills.fan/download'
    }
  }
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
      errorMessage: state.errorMessage,
      lastChecked: state.lastChecked
    })
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

  // Disable auto-download since we redirect to website
  autoUpdater.autoDownload = false

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

  autoUpdater.on('error', (error: Error) => {
    console.error('[Updater] Error:', error.message)
    updateState({
      status: 'error',
      errorMessage: error.message,
      lastChecked: new Date().toISOString()
    })
  })

  // Check for updates on startup (with delay to not block app launch)
  setTimeout(() => {
    checkForUpdates()
  }, UPDATER_CONFIG.STARTUP_DELAY)

  // Periodic update checks (only when idle/not-available/error)
  setInterval(() => {
    if (['idle', 'not-available', 'error'].includes(state.status)) {
      console.log('[Updater] Periodic update check...')
      checkForUpdates()
    }
  }, UPDATER_CONFIG.PERIODIC_CHECK_INTERVAL)
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
 * Open download page in default browser
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

  // Get current app version
  ipcMain.handle('updater:get-version', () => {
    return { success: true, data: app.getVersion() }
  })

  // Get full update state
  ipcMain.handle('updater:get-info', () => {
    return { success: true, data: getUpdateInfo() }
  })

  // Open download page
  ipcMain.handle('updater:open-download', () => {
    openDownloadPage()
    return { success: true }
  })
}
