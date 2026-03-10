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
 *   - Remote: Remote access feature (optional)
 *   - Browser: Embedded browser for Content Canvas (V2 feature)
 *   - AIBrowser: AI browser automation tools (V2 feature)
 *   - Overlay: Floating UI elements (optional)
 *   - Search: Global search (optional)
 *   - Performance: Developer monitoring tools (dev only)
 *   - GitBash: Windows Git Bash setup (Windows optional)
 */

import { BrowserWindow } from 'electron'
import { registerOnboardingHandlers } from '../ipc/onboarding'
import { registerRemoteHandlers } from '../ipc/remote'
import { registerBrowserHandlers } from '../ipc/browser'
import { registerAIBrowserHandlers, cleanupAIBrowserHandlers } from '../ipc/ai-browser'
import { registerOverlayHandlers, cleanupOverlayHandlers } from '../ipc/overlay'
import { initializeSearchHandlers, cleanupSearchHandlers } from '../ipc/search'
import { registerPerfHandlers } from '../ipc/perf'
import { registerGitBashHandlers, initializeGitBashOnStartup } from '../ipc/git-bash'
import { registerSkillHandlers } from '../ipc/skill'
import { initializeRegistry, startSkillWatcher } from '../services/skill'
import { registerRalphHandlers } from '../ipc/ralph'
import { registerLoopTaskHandlers } from '../ipc/loop-task'
import { registerMemoryHandlers } from '../ipc/memory'
import { shutdownMemory } from '../services/memory'
import { registerFeishuHandlers } from '../ipc/feishu'
import { registerExtensionHandlers } from '../ipc/extension'
import { initializeExtensions as initExtensions, shutdownExtensions } from '../services/extension'
import { FeishuChannel } from '../services/channel/adapters/feishu.channel'
import { getChannelManager } from '../services/channel'
import { shutdownScheduler } from '../services/scheduler.service'
import { recoverInterruptedTasks } from '../services/loop-task.service'
import { cancelAllRetries } from '../services/retry-handler'

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

  // Remote: Remote access feature, optional functionality
  registerRemoteHandlers(mainWindow)

  // Browser: Embedded BrowserView for Content Canvas
  // Note: BrowserView is created lazily when Canvas is opened
  registerBrowserHandlers(mainWindow)

  // AI Browser: AI automation tools (V2 feature)
  // Uses lazy initialization - heavy modules loaded on first tool call
  registerAIBrowserHandlers(mainWindow)

  // Overlay: Floating UI elements (chat capsule, etc.)
  // Already implements lazy initialization internally
  registerOverlayHandlers(mainWindow)

  // Search: Global search functionality
  initializeSearchHandlers(mainWindow)

  // Performance: Developer monitoring tools
  registerPerfHandlers(mainWindow)

  // GitBash: Windows Git Bash detection and setup
  registerGitBashHandlers(mainWindow)

  // Ralph: Loop task management (autonomous AI agent)
  registerRalphHandlers(mainWindow)

  // Loop Task: Persistent loop task storage
  registerLoopTaskHandlers(mainWindow)

  // Skill: Settings and slash-command APIs
  registerSkillHandlers()

  // Recover stale running loop tasks after crash/restart
  try {
    const recovery = recoverInterruptedTasks()
    if (recovery.recoveredCount > 0) {
      console.log(
        `[Bootstrap] Recovered ${recovery.recoveredCount} interrupted loop task(s): ${recovery.recoveredTaskIds.join(', ')}`
      )
    }
  } catch (err) {
    console.error('[Bootstrap] Failed to recover interrupted loop tasks:', err)
  }

  // Memory: Memory management (clear memory)
  registerMemoryHandlers()

  // Extensions: Lightweight plugin system
  registerExtensionHandlers()
  initExtensions()

  // Feishu: Chat bot remote control (optional)
  registerFeishuHandlers()
  const feishuChannel = new FeishuChannel()
  getChannelManager().registerChannel(feishuChannel)
  feishuChannel.initialize().catch((err) => {
    console.error('[Bootstrap] Feishu initialization failed:', err)
  })

  // Skill: Initialize skill registry and start file watcher
  // Skills are loaded from 5 sources: project commands, SkillsFan, global commands, Claude skills, Agent skills
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
  // AI Browser: Cleanup MCP server and browser context
  cleanupAIBrowserHandlers()

  // Overlay: Cleanup overlay BrowserView
  cleanupOverlayHandlers()

  // Search: Cancel any ongoing searches
  cleanupSearchHandlers()

  // Memory: Close SQLite database and embedding service
  shutdownMemory().catch(() => {})

  // Extensions: Stop watcher and unload extensions
  shutdownExtensions()

  // Scheduler: Stop all cron jobs and interval timers
  shutdownScheduler()

  // Retry handler: Cancel all pending retry timers
  cancelAllRetries()

  // Feishu: Disconnect bot
  const feishuChannel = getChannelManager().getChannel<FeishuChannel>('feishu')
  if (feishuChannel) {
    feishuChannel.shutdown().catch((err) => {
      console.error('[Bootstrap] Feishu shutdown error:', err)
    })
  }

  console.log('[Bootstrap] Extended services cleaned up')
}
