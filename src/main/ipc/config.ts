/**
 * Config IPC Handlers
 */

import { ipcMain, BrowserWindow, app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { getConfigAsync, saveConfigAsync, validateApiConnection } from '../services/config.service'
import { getAISourceManager } from '../services/ai-sources'
import { setIsQuitting } from '../services/tray.service'
import { fetchPublicModels } from '../services/skillsfan/models.service'
import { ipcHandle } from './utils'

export function registerConfigHandlers(): void {
  ipcHandle('config:get', () => getConfigAsync())

  // Save configuration
  ipcMain.handle('config:set', async (_event, updates: Record<string, unknown>) => {
    try {
      // Merge aiSources properly to preserve existing configs
      const processedUpdates = { ...updates }
      const incomingAiSources = processedUpdates.aiSources as Record<string, any> | undefined
      if (incomingAiSources && typeof incomingAiSources === 'object') {
        const currentConfig = await getConfigAsync() as Record<string, any>
        const currentAiSources = currentConfig.aiSources || { current: 'custom' }
        const mergedAiSources: Record<string, any> = {
          ...currentAiSources,
          ...incomingAiSources
        }

        for (const key of Object.keys(incomingAiSources)) {
          if (key === 'current') continue
          const incomingValue = incomingAiSources[key]
          const currentValue = currentAiSources[key]
          if (incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue)
            && currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
            mergedAiSources[key] = {
              ...currentValue,
              ...incomingValue
            }
          }
        }

        processedUpdates.aiSources = mergedAiSources
      }

      // No encryption needed - save API keys in plaintext
      const config = await saveConfigAsync(processedUpdates as any)
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  ipcHandle('config:validate-api',
    (_e, apiKey: string, apiUrl: string, provider: string) =>
      validateApiConnection(apiKey, apiUrl, provider)
  )

  ipcHandle('config:refresh-ai-sources', async () => {
    const manager = getAISourceManager()
    await manager.refreshAllConfigs()
    return getConfigAsync()
  })

  ipcHandle('config:get-public-models', () => fetchPublicModels())

  // Reset to default settings
  ipcMain.handle('config:reset-to-default', async () => {
    try {
      // Get app data path
      const isDev = process.env.NODE_ENV === 'development'
      const appDataPath = isDev
        ? path.join(app.getPath('home'), '.skillsfan-dev')
        : path.join(app.getPath('home'), '.skillsfan')

      console.log('[Config IPC] Resetting to default, clearing:', appDataPath)

      // Clear all data with verification (Windows may have file locking issues)
      if (await fs.pathExists(appDataPath)) {
        // 1. First try to empty directory contents (helps with locked files on Windows)
        try {
          await fs.emptyDir(appDataPath)
        } catch (emptyErr) {
          console.warn('[Config IPC] emptyDir failed, trying remove:', emptyErr)
        }

        // 2. Delete the directory
        await fs.remove(appDataPath)

        // 3. Wait for filesystem to sync (Windows needs more time)
        await new Promise(resolve => setTimeout(resolve, 500))

        // 4. Verify deletion succeeded
        if (await fs.pathExists(appDataPath)) {
          console.error('[Config IPC] Failed to delete data directory, it still exists')
          return {
            success: false,
            error: 'Failed to clear data directory. Please close other applications that may be using SkillsFan files and try again.'
          }
        }

        console.log('[Config IPC] Data cleared and verified successfully')
      }

      // Set quitting flag to bypass minimize-to-tray
      setIsQuitting(true)

      // Close all windows gracefully
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        window.destroy()
      })

      // Delay to ensure cleanup, then restart (increased for Windows)
      setTimeout(() => {
        console.log('[Config IPC] Restarting app...')
        app.relaunch()
        app.quit()
      }, 1000)

      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Config IPC] Reset to default error:', err)
      return { success: false, error: err.message }
    }
  })
}
