/**
 * Extended Services - Deferred Loading
 *
 * These services are loaded AFTER the window is visible.
 * They use lazy initialization - actual initialization happens on first use.
 *
 * GUIDELINES:
 *   - DEFAULT location for all new features
 *   - Services here do NOT block startup
 *   - Use lazy initialization pattern for heavy modules
 *
 * CURRENT SERVICES:
 *   - Onboarding: First-time user guide (only needed once)
 *   - PTY terminal runtime for Claude Code
 *   - Skills registry/watchers for the visual skills manager
 *   - GitBash: Windows Git Bash setup (Windows optional)
 */

import { BrowserWindow } from 'electron'
import { registerOnboardingHandlers } from '../ipc/onboarding'
import { registerGitBashHandlers, initializeGitBashOnStartup } from '../ipc/git-bash'
import { registerSkillHandlers } from '../ipc/skill'
import { initializeRegistry, startSkillWatcher } from '../services/skill'
import { registerExtensionHandlers } from '../ipc/extension'
import { registerUsageHandlers } from '../ipc/usage'
import { registerPtyHandlers } from '../ipc/pty'
import { destroyAllPtys } from '../services/pty-manager.service'
import { initializeExtensions as initExtensions, shutdownExtensions } from '../services/extension'

/**
 * Initialize extended services after window is visible
 *
 * @param mainWindow - The main application window
 *
 * These services are loaded asynchronously and do not block the UI.
 * Heavy modules use lazy initialization - they only fully initialize
 * when their features are first accessed.
 */
export function initializeExtendedServices(mainWindow: BrowserWindow): void {
  const start = performance.now()
  console.log('[Bootstrap] Extended services starting...')

  // === EXTENDED SERVICES ===
  // These services are loaded after the window is visible.
  // New features should be added here by default.

  // Onboarding: First-time user guide, only needed once
  registerOnboardingHandlers()

  // Remote access, search, AI browser, overlay, and the app-native agent
  // runtime are intentionally disabled in the terminal-first shell.

  // GitBash: Windows Git Bash detection and setup
  registerGitBashHandlers(mainWindow)

  // The app-native orchestration stack (Ralph / loop tasks / hosted subagents)
  // is retired in the terminal-first shell and is not registered here.

  // PTY: Embedded Claude Code CLI terminal in Canvas
  registerPtyHandlers(mainWindow)

  // Usage Statistics: Token usage and cost tracking
  registerUsageHandlers()

  // Skill: Settings and slash-command APIs
  registerSkillHandlers()

  // Extensions: Lightweight plugin system
  registerExtensionHandlers()
  initExtensions()

  // Skill: Initialize skill registry and start file watcher
  // Skills are loaded from 4 sources: project commands, managed Claude skills, global commands, Agent skills
  initializeRegistry()
    .then(() => {
      startSkillWatcher()
      console.log('[Bootstrap] Skill system initialized')
    })
    .catch((err) => {
      console.error('[Bootstrap] Skill initialization failed:', err)
    })

  // Windows-specific: Initialize Git Bash in background
  if (process.platform === 'win32') {
    initializeGitBashOnStartup()
      .then((status) => {
        console.log('[Bootstrap] Git Bash status:', status)
      })
      .catch((err) => {
        console.error('[Bootstrap] Git Bash initialization failed:', err)
      })
  }

  const duration = performance.now() - start
  console.log(`[Bootstrap] Extended services registered in ${duration.toFixed(1)}ms`)

  // Notify renderer that extended services are ready
  // This allows renderer to safely call extended service APIs
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bootstrap:extended-ready', {
      timestamp: Date.now(),
      duration: duration
    })
    console.log('[Bootstrap] Sent bootstrap:extended-ready to renderer')
  }
}

/**
 * Cleanup extended services on app shutdown
 *
 * Called during window-all-closed to properly release resources.
 */
export function cleanupExtendedServices(): void {
  // PTY: Kill all terminal processes
  destroyAllPtys()

  // Extensions: Stop watcher and unload extensions
  shutdownExtensions()


  console.log('[Bootstrap] Extended services cleaned up')
}
