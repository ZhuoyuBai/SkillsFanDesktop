/**
 * Config IPC Handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getConfig, saveConfig, validateApiConnection } from '../services/config.service'
import { getAISourceManager } from '../services/ai-sources'
import { encryptString, decryptString } from '../services/secure-storage.service'
import { setIsQuitting } from '../services/tray.service'

export function registerConfigHandlers(): void {
  // Get configuration
  ipcMain.handle('config:get', async () => {
    try {
      const config = getConfig() as Record<string, any>

      // Decrypt custom API key before sending to renderer
      const decryptedConfig = { ...config }
      if (decryptedConfig.aiSources?.custom?.apiKey) {
        decryptedConfig.aiSources = {
          ...decryptedConfig.aiSources,
          custom: {
            ...decryptedConfig.aiSources.custom,
            apiKey: decryptString(decryptedConfig.aiSources.custom.apiKey)
          }
        }
      }
      // Also handle legacy api.apiKey
      if (decryptedConfig.api?.apiKey) {
        decryptedConfig.api = {
          ...decryptedConfig.api,
          apiKey: decryptString(decryptedConfig.api.apiKey)
        }
      }

      return { success: true, data: decryptedConfig }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Save configuration
  ipcMain.handle('config:set', async (_event, updates: Record<string, unknown>) => {
    try {
      // Encrypt custom API key if present
      const processedUpdates = { ...updates }
      const incomingAiSources = processedUpdates.aiSources as Record<string, any> | undefined
      if (incomingAiSources && typeof incomingAiSources === 'object') {
        const currentConfig = getConfig() as Record<string, any>
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

      const aiSources = processedUpdates.aiSources as Record<string, any> | undefined
      if (aiSources?.custom?.apiKey && typeof aiSources.custom.apiKey === 'string') {
        // Only encrypt if not already encrypted
        if (!aiSources.custom.apiKey.startsWith('enc:')) {
          aiSources.custom.apiKey = encryptString(aiSources.custom.apiKey)
        }
      }
      // Also handle legacy api.apiKey
      const api = processedUpdates.api as Record<string, any> | undefined
      if (api?.apiKey && typeof api.apiKey === 'string') {
        if (!api.apiKey.startsWith('enc:')) {
          api.apiKey = encryptString(api.apiKey)
        }
      }

      const config = saveConfig(processedUpdates)
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Validate API connection
  ipcMain.handle(
    'config:validate-api',
    async (_event, apiKey: string, apiUrl: string, provider: string) => {
      try {
        const result = await validateApiConnection(apiKey, apiUrl, provider)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Refresh AI sources configuration (auto-detects logged-in sources)
  ipcMain.handle('config:refresh-ai-sources', async () => {
    try {
      const manager = getAISourceManager()
      await manager.refreshAllConfigs()
      const config = getConfig()
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Config IPC] Refresh AI sources error:', err)
      return { success: false, error: err.message }
    }
  })

  // Reset to default settings
  ipcMain.handle('config:reset-to-default', async () => {
    try {
      const { app } = await import('electron')
      const fs = await import('fs-extra')
      const path = await import('path')

      // Get app data path
      const isDev = process.env.NODE_ENV === 'development'
      const appDataPath = isDev
        ? path.join(app.getPath('home'), '.skillsfan-dev')
        : path.join(app.getPath('home'), '.skillsfan')

      console.log('[Config IPC] Resetting to default, clearing:', appDataPath)

      // Clear all data
      if (await fs.pathExists(appDataPath)) {
        await fs.remove(appDataPath)
        console.log('[Config IPC] Data cleared successfully')
      }

      // Set quitting flag to bypass minimize-to-tray
      setIsQuitting(true)

      // Close all windows gracefully
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        window.destroy()
      })

      // Delay to ensure cleanup, then restart
      setTimeout(() => {
        console.log('[Config IPC] Restarting app...')
        app.relaunch()
        app.quit()  // Use quit() instead of exit() for proper cleanup
      }, 500)

      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Config IPC] Reset to default error:', err)
      return { success: false, error: err.message }
    }
  })
}
