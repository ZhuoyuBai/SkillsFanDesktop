/**
 * Config IPC Handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getConfig, saveConfig, validateApiConnection } from '../services/config.service'
import { getAISourceManager } from '../services/ai-sources'
import { decryptString } from '../services/secure-storage.service'
import { setIsQuitting } from '../services/tray.service'

/**
 * Migrate encrypted config to plaintext (one-time migration)
 * This will trigger keychain prompt once on first run after update
 */
function migrateEncryptedConfig(): void {
  try {
    const config = getConfig() as any
    let needsSave = false

    // Check if any field is encrypted (starts with 'enc:')
    const decryptIfNeeded = (value: string): string => {
      if (value && typeof value === 'string' && value.startsWith('enc:')) {
        try {
          needsSave = true
          return decryptString(value) // One-time decryption
        } catch (err) {
          console.error('[Config Migration] Failed to decrypt:', err)
          return ''
        }
      }
      return value
    }

    // Migrate AI source API keys
    if (config.aiSources) {
      if (config.aiSources.custom?.apiKey) {
        config.aiSources.custom.apiKey = decryptIfNeeded(config.aiSources.custom.apiKey)
      }
      if (config.aiSources.anthropic?.apiKey) {
        config.aiSources.anthropic.apiKey = decryptIfNeeded(config.aiSources.anthropic.apiKey)
      }
      if (config.aiSources.openai?.apiKey) {
        config.aiSources.openai.apiKey = decryptIfNeeded(config.aiSources.openai.apiKey)
      }
    }

    // Migrate legacy api.apiKey
    if (config.api?.apiKey) {
      config.api.apiKey = decryptIfNeeded(config.api.apiKey)
    }

    // Save the migrated config if any field was decrypted
    if (needsSave) {
      console.log('[Config Migration] Migrated encrypted config to plaintext')
      saveConfig(config)
    }
  } catch (err) {
    console.error('[Config Migration] Migration failed:', err)
  }
}

export function registerConfigHandlers(): void {
  // Run migration once when handlers are registered
  migrateEncryptedConfig()
  // Get configuration
  ipcMain.handle('config:get', async () => {
    try {
      const config = getConfig()
      // No decryption needed - config is already in plaintext after migration
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Save configuration
  ipcMain.handle('config:set', async (_event, updates: Record<string, unknown>) => {
    try {
      // Merge aiSources properly to preserve existing configs
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

      // No encryption needed - save API keys in plaintext
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
