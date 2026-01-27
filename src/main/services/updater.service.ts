/**
 * Updater Service - Version Update Detection via Website API
 *
 * Checks for updates from SkillsFan website instead of GitHub Releases.
 * Users are directed to download updates from the website.
 */

// Node/Electron imports
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { is } from '@electron-toolkit/utils'

// ============================================================================
// Types
// ============================================================================

/** API response from website version endpoint */
interface VersionApiResponse {
  success: boolean
  data?: {
    version: string
    releaseDate: string
    releaseNotes: string
    downloads: {
      'mac-arm64'?: string
      'mac-x64'?: string
      'win-x64'?: string
      'linux-x64'?: string
    }
    downloadPageUrl: string
  }
  error?: {
    code: string
    message: string
  }
}

/** Update information */
interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  downloadUrl: string | null
  downloadPageUrl: string | null
}

/** Updater status */
type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'error'

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
  /** Version detection API URL */
  API_URL: 'https://www.skills.fan/api/app/version',

  /** Fallback download page URL */
  DOWNLOAD_PAGE_URL: 'https://www.skills.fan/download',

  /** Delay before first check after startup (ms) */
  STARTUP_DELAY: 5000,

  /** Request timeout (ms) */
  REQUEST_TIMEOUT: 10000
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
    releaseNotes: null,
    downloadUrl: null,
    downloadPageUrl: null
  },
  errorMessage: null,
  lastChecked: null
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compare two semantic versions
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)

  const parts1 = normalize(v1)
  const parts2 = normalize(v2)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a > b) return 1
    if (a < b) return -1
  }

  return 0
}

/**
 * Get download URL for current platform
 */
function getDownloadUrlForPlatform(
  downloads: VersionApiResponse['data']['downloads']
): string | null {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return arch === 'arm64' ? (downloads['mac-arm64'] ?? null) : (downloads['mac-x64'] ?? null)
  } else if (platform === 'win32') {
    return downloads['win-x64'] ?? null
  } else if (platform === 'linux') {
    return downloads['linux-x64'] ?? null
  }

  return null
}

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

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize updater service
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Initialize current version
  state.updateInfo.currentVersion = app.getVersion()

  if (is.dev) {
    console.log('[Updater] Skipping auto-update in development mode')
    return
  }

  // Check for updates on startup (with delay to not block app launch)
  setTimeout(() => {
    checkForUpdates()
  }, UPDATER_CONFIG.STARTUP_DELAY)
}

/**
 * Check for updates from website API
 */
export async function checkForUpdates(): Promise<UpdaterState> {
  // Update current version in case it changed
  state.updateInfo.currentVersion = app.getVersion()

  // TODO: Uncomment after testing
  // if (is.dev) {
  //   console.log('[Updater] Skipping update check in development mode')
  //   return state
  // }

  console.log('[Updater] Checking for updates...')
  updateState({ status: 'checking', errorMessage: null })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), UPDATER_CONFIG.REQUEST_TIMEOUT)

    const response = await fetch(UPDATER_CONFIG.API_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': `SkillsFan/${app.getVersion()} (${process.platform}; ${process.arch})`,
        Accept: 'application/json'
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result: VersionApiResponse = await response.json()

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Invalid API response')
    }

    const { version, releaseDate, releaseNotes, downloads, downloadPageUrl } = result.data
    const currentVersion = app.getVersion()
    const hasUpdate = compareVersions(version, currentVersion) > 0
    const downloadUrl = getDownloadUrlForPlatform(downloads)

    const updateInfo: UpdateInfo = {
      currentVersion,
      latestVersion: version,
      releaseDate,
      releaseNotes,
      downloadUrl,
      downloadPageUrl
    }

    if (hasUpdate) {
      console.log(`[Updater] Update available: ${currentVersion} -> ${version}`)
      updateState({
        status: 'available',
        updateInfo,
        lastChecked: new Date().toISOString()
      })
    } else {
      console.log(`[Updater] Current version ${currentVersion} is up to date`)
      updateState({
        status: 'not-available',
        updateInfo,
        lastChecked: new Date().toISOString()
      })
    }

    return state
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Updater] Failed to check for updates:', errorMessage)

    updateState({
      status: 'error',
      errorMessage,
      lastChecked: new Date().toISOString()
    })

    return state
  }
}

/**
 * Open download page in default browser
 */
export function openDownloadPage(): void {
  // Always open the download page, not the direct download URL
  const url = UPDATER_CONFIG.DOWNLOAD_PAGE_URL

  shell.openExternal(url)
  console.log('[Updater] Opened download page:', url)
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

  // Legacy: keep for backward compatibility (now opens download page)
  ipcMain.handle('updater:install', () => {
    openDownloadPage()
    return { success: true }
  })
}
