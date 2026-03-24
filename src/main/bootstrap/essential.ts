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
 *   - Space: Workspace management (list displayed on first screen)
 *   - Conversation: Chat history (core feature)
 *   - Agent: Message handling (core feature)
 *   - Artifact: File management (sidebar display)
 *   - System: Window controls (basic functionality)
 *   - Updater: Auto-update checks (lightweight, needs early start)
 */

import { BrowserWindow } from 'electron'
import { registerConfigHandlers } from '../ipc/config'
import { registerSpaceHandlers } from '../ipc/space'
import { registerConversationHandlers } from '../ipc/conversation'
import { registerAgentHandlers } from '../ipc/agent'
import { registerArtifactHandlers } from '../ipc/artifact'
import { registerSystemHandlers } from '../ipc/system'
import { registerUpdaterHandlers, initAutoUpdater } from '../services/updater.service'
import { registerAuthHandlers } from '../ipc/auth'
import { registerSkillsFanAuthHandlers } from '../ipc/skillsfan-auth'
import { setMainWindow as setAgentMainWindow } from '../services/agent/helpers'
import { getChannelManager, ElectronChannel, RemoteWebChannel } from '../services/channel'

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

  // ChannelManager: Register communication channels before agent service.
  // Must be ready before any sendToRenderer() calls.
  const channelManager = getChannelManager()
  const electronChannel = new ElectronChannel()
  electronChannel.setMainWindow(mainWindow)
  setAgentMainWindow(mainWindow)
  channelManager.registerChannel(electronChannel)
  channelManager.registerChannel(new RemoteWebChannel())

  // Config: Must be first - other services may depend on configuration
  registerConfigHandlers()

  // Auth: OAuth login handlers for multi-platform login (generic + backward compat)
  registerAuthHandlers()

  // SkillsFan Auth: OAuth login handlers for SkillsFan account
  registerSkillsFanAuthHandlers()

  // Space: Workspace list is displayed immediately on the left sidebar
  registerSpaceHandlers()

  // Conversation: Chat history is displayed in the main content area
  registerConversationHandlers()

  // Agent: Message sending is the core feature, must be ready immediately
  registerAgentHandlers(mainWindow)

  // Artifact: File list is displayed in the right sidebar
  registerArtifactHandlers(mainWindow)

  // System: Window controls (maximize, minimize, tray) are basic functionality
  registerSystemHandlers(mainWindow)

  // Updater: Lightweight, starts checking for updates in background
  registerUpdaterHandlers()
  initAutoUpdater(mainWindow)

  const duration = performance.now() - start
  console.log(`[Bootstrap] Essential services initialized in ${duration.toFixed(1)}ms`)
}
