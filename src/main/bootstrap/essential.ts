/**
 * Essential Services - First Screen Dependencies
 *
 * These services are REQUIRED for the initial screen render.
 * They are loaded synchronously before the window becomes interactive.
 *
 * GUIDELINES:
 *   - Each service here directly impacts startup time
 *   - Total initialization should be < 500ms
 *   - New additions require architecture review
 *
 * CURRENT SERVICES:
 *   - Config: Application configuration (API keys, settings)
 *   - Space: Workspace management
 *   - System: Window controls (basic functionality)
 *   - Updater: Auto-update checks (lightweight, needs early start)
 */

import { BrowserWindow } from 'electron'
import { registerConfigHandlers } from '../ipc/config'
import { registerSpaceHandlers } from '../ipc/space'
import { registerSystemHandlers } from '../ipc/system'
import { registerUpdaterHandlers, initAutoUpdater } from '../services/updater.service'

/**
 * Initialize essential services required for first screen render
 *
 * @param mainWindow - The main application window
 *
 * IMPORTANT: These handlers are loaded synchronously.
 * Only add services that are absolutely required for the initial UI.
 */
export function initializeEssentialServices(mainWindow: BrowserWindow): void {
  const start = performance.now()

  // === ESSENTIAL SERVICES ===
  // Each service below is required for the first screen render.
  // Do NOT add new services without architecture review.

  // Config: Must be first - other services may depend on configuration
  registerConfigHandlers()

  // Space: Workspace list is used by setup and the terminal shell.
  registerSpaceHandlers()

  // System: Window controls (maximize, minimize, tray) are basic functionality
  registerSystemHandlers(mainWindow)

  // Updater: Lightweight, starts checking for updates in background
  registerUpdaterHandlers()
  initAutoUpdater(mainWindow)

  const duration = performance.now() - start
  console.log(`[Bootstrap] Essential services initialized in ${duration.toFixed(1)}ms`)
}
