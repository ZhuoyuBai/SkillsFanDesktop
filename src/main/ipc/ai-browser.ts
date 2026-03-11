/**
 * AI Browser IPC Handlers
 *
 * Handles IPC communication for the AI Browser functionality.
 * Provides endpoints for:
 * - Executing AI Browser tools
 * - Getting tool definitions
 * - Managing AI Browser state
 *
 * LAZY INITIALIZATION:
 * This module uses lazy initialization to improve startup performance.
 * The heavy AI Browser module (3000+ lines) is only loaded when:
 * - A tool is first executed
 * - Tool definitions are first requested
 * - Active view is first set
 *
 * This avoids blocking app startup with module loading.
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { BrowserHostRuntime } from '../../gateway/host-runtime'
import { recordToolExecutionStep } from '../../gateway/host-runtime/step-reporter/tool-reporting'

// Lazy-loaded module references
let aiBrowserModule: typeof import('../services/ai-browser') | null = null
let browserHostRuntime: BrowserHostRuntime | null = null
let mainWindowRef: BrowserWindow | null = null
let initialized = false

async function ensureBrowserHostRuntime(): Promise<BrowserHostRuntime> {
  if (!browserHostRuntime) {
    const { hostRuntime } = await import('../../gateway/host-runtime')
    browserHostRuntime = hostRuntime.browser
  }

  return browserHostRuntime
}

async function ensureBrowserRuntimeInitialized(): Promise<BrowserHostRuntime> {
  const runtime = await ensureBrowserHostRuntime()

  if (!initialized && mainWindowRef) {
    console.log('[AI Browser IPC] Initializing AI Browser through HostRuntime...')
    runtime.initialize(mainWindowRef)
    initialized = true
  }

  return runtime
}

/**
 * Ensure AI Browser module is loaded and initialized
 * Called on first use of any AI Browser functionality
 */
async function ensureInitialized(): Promise<typeof import('../services/ai-browser')> {
  if (!aiBrowserModule) {
    console.log('[AI Browser IPC] Lazy loading AI Browser module...')
    const start = performance.now()

    // Dynamic import to defer module loading
    aiBrowserModule = await import('../services/ai-browser')

    const duration = performance.now() - start
    console.log(`[AI Browser IPC] Module loaded in ${duration.toFixed(1)}ms`)
  }

  await ensureBrowserRuntimeInitialized()

  return aiBrowserModule
}

/**
 * Register all AI Browser IPC handlers
 *
 * NOTE: This function only registers IPC handlers.
 * The actual AI Browser module is loaded lazily on first use.
 */
export function registerAIBrowserHandlers(mainWindow: BrowserWindow | null): void {
  if (!mainWindow) {
    console.warn('[AI Browser IPC] No main window provided, skipping registration')
    return
  }

  // Store reference for lazy initialization
  mainWindowRef = mainWindow

  // NOTE: We do NOT call initializeAIBrowser() here!
  // It will be called lazily when the module is first used.

  // ============================================
  // Tool Information
  // ============================================

  /**
   * Get all AI Browser tool names
   */
  ipcMain.handle('ai-browser:get-tool-names', async () => {
    try {
      const runtime = await ensureBrowserRuntimeInitialized()
      const toolNames = runtime.getToolNames('connected')
      return { success: true, data: toolNames }
    } catch (error) {
      console.error('[AI Browser IPC] Get tool names failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Get all AI Browser tool definitions
   */
  ipcMain.handle('ai-browser:get-tool-definitions', async () => {
    try {
      const module = await ensureInitialized()
      const definitions = module.getAIBrowserToolDefinitions()
      return { success: true, data: definitions }
    } catch (error) {
      console.error('[AI Browser IPC] Get tool definitions failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Get AI Browser system prompt addition
   */
  ipcMain.handle('ai-browser:get-system-prompt', async () => {
    try {
      const module = await ensureInitialized()
      return { success: true, data: module.AI_BROWSER_SYSTEM_PROMPT }
    } catch (error) {
      console.error('[AI Browser IPC] Get system prompt failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // ============================================
  // Tool Execution
  // ============================================

  /**
   * Execute an AI Browser tool
   */
  ipcMain.handle(
    'ai-browser:execute-tool',
    async (_event, { toolName, params }: { toolName: string; params: Record<string, unknown> }) => {
      console.log(`[AI Browser IPC] >>> execute-tool: ${toolName}`)

      try {
        const runtime = await ensureBrowserRuntimeInitialized()
        const { hostRuntime } = await import('../../gateway/host-runtime')

        let result: {
          content: string
          images?: Array<{ data: string; mimeType: string }>
          isError?: boolean
        }

        if (toolName === 'browser_snapshot') {
          const snapshot = await hostRuntime.perception.captureBrowserSnapshot({
            backend: 'connected',
            verbose: params.verbose === true,
            filePath: typeof params.filePath === 'string' ? params.filePath : undefined,
            taskId: 'ai-browser-ipc'
          })

          result = {
            content: snapshot.filePath
              ? `Snapshot saved to: ${snapshot.filePath}\n\nPage: ${snapshot.title}\nURL: ${snapshot.url}\nElements: ${snapshot.elementCount}`
              : snapshot.text
          }
        } else if (toolName === 'browser_screenshot') {
          if (params.uid && params.fullPage) {
            result = {
              content: 'Providing both "uid" and "fullPage" is not allowed.',
              isError: true
            }
          } else {
            const screenshot = await hostRuntime.perception.captureBrowserScreenshot({
              backend: 'connected',
              format: (params.format as 'png' | 'jpeg' | 'webp') || 'png',
              quality: typeof params.quality === 'number' ? params.quality : undefined,
              uid: typeof params.uid === 'string' ? params.uid : undefined,
              fullPage: params.fullPage === true,
              filePath: typeof params.filePath === 'string' ? params.filePath : undefined,
              taskId: 'ai-browser-ipc'
            })

            let message: string
            if (params.uid) {
              message = `Took a screenshot of node with uid "${params.uid}".`
            } else if (params.fullPage === true) {
              message = 'Took a screenshot of the full current page.'
            } else {
              message = "Took a screenshot of the current page's viewport."
            }

            result = screenshot.filePath
              ? {
                  content: `${message}\nSaved screenshot to ${screenshot.filePath}.`,
                  images: screenshot.data
                    ? [{ data: screenshot.data, mimeType: screenshot.mimeType }]
                    : undefined
                }
              : {
                  content: message,
                  images: screenshot.data
                    ? [{ data: screenshot.data, mimeType: screenshot.mimeType }]
                    : undefined
                }
          }
        } else {
          const module = await ensureInitialized()
          result = await module.executeAIBrowserTool(toolName, params)
          recordToolExecutionStep({
            defaultTaskId: 'ai-browser-ipc',
            category: 'browser',
            action: toolName,
            toolArgs: params,
            result: {
              content: [
                { type: 'text' as const, text: result.content },
                ...(result.images || []).map((image) => ({
                  type: 'image' as const,
                  data: image.data,
                  mimeType: image.mimeType
                }))
              ],
              isError: result.isError
            },
            metadata: { backend: 'connected', source: 'ipc' }
          })
        }

        void runtime

        console.log(`[AI Browser IPC] <<< execute-tool success: ${toolName}`)
        return {
          success: true,
          data: {
            content: result.content,
            images: result.images,
            isError: result.isError
          }
        }
      } catch (error) {
        console.error('[AI Browser IPC] Execute tool failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  /**
   * Check if a tool is an AI Browser tool
   */
  ipcMain.handle('ai-browser:is-browser-tool', async (_event, { toolName }: { toolName: string }) => {
    try {
      const module = await ensureInitialized()
      return { success: true, data: module.isAIBrowserTool(toolName) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ============================================
  // State Management
  // ============================================

  /**
   * Set the active browser view for AI operations
   */
  ipcMain.handle('ai-browser:set-active-view', async (_event, { viewId }: { viewId: string }) => {
    try {
      const module = await ensureInitialized()
      module.setActiveBrowserView(viewId)
      return { success: true }
    } catch (error) {
      console.error('[AI Browser IPC] Set active view failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[AI Browser IPC] Handlers registered (lazy initialization enabled)')
}

/**
 * Cleanup AI Browser resources
 */
export function cleanupAIBrowserHandlers(): void {
  // Only cleanup if module was actually loaded
  if (browserHostRuntime && initialized) {
    browserHostRuntime.cleanup()
    console.log('[AI Browser IPC] Module cleaned up')
  }

  // Reset state
  aiBrowserModule = null
  browserHostRuntime = null
  mainWindowRef = null
  initialized = false

  console.log('[AI Browser IPC] Handlers cleaned up')
}
