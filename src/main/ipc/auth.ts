/**
 * Auth IPC Handlers
 *
 * Generic authentication handlers that work with any OAuth provider.
 * Provider types are configured in product.json and loaded dynamically.
 *
 * Channels:
 * - auth:start-login (providerType) - Start OAuth login for a provider
 * - auth:complete-login (providerType, state) - Complete OAuth login
 * - auth:refresh-token (providerType) - Refresh token for a provider
 * - auth:check-token (providerType) - Check token status
 * - auth:logout (providerType) - Logout from a provider
 * - auth:get-providers - Get list of available auth providers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getAISourceManager, getEnabledAuthProviderConfigs } from '../services/ai-sources'
import type { AISourceType } from '../../shared/types'
import { ipcHandle } from './utils'

/**
 * Register all authentication IPC handlers
 */
export function registerAuthHandlers(): void {
  const manager = getAISourceManager()

  ipcHandle('auth:get-providers', () => getEnabledAuthProviderConfigs())

  /**
   * Start OAuth login flow for a provider
   */
  ipcMain.handle('auth:start-login', async (_event, providerType: AISourceType) => {
    try {
      console.log(`[Auth IPC] Starting login for provider: ${providerType}`)
      const result = await manager.startOAuthLogin(providerType)
      return result
    } catch (error: unknown) {
      const err = error as Error
      console.error(`[Auth IPC] Start login error for ${providerType}:`, err)
      return { success: false, error: err.message }
    }
  })

  /**
   * Complete OAuth login flow for a provider
   */
  ipcMain.handle('auth:complete-login', async (_event, providerType: AISourceType, state: string) => {
    try {
      console.log(`[Auth IPC] Completing login for provider: ${providerType}`)
      const mainWindow = BrowserWindow.getAllWindows()[0]

      // The manager's completeOAuthLogin handles everything including config save
      const result = await manager.completeOAuthLogin(providerType, state)

      // Send progress update on completion
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (result.success) {
          mainWindow.webContents.send('auth:login-progress', {
            provider: providerType,
            status: 'completed'
          })
        }
      }

      return result
    } catch (error: unknown) {
      const err = error as Error
      console.error(`[Auth IPC] Complete login error for ${providerType}:`, err)
      return { success: false, error: err.message }
    }
  })

  /**
   * Refresh token for a provider
   */
  ipcMain.handle('auth:refresh-token', async (_event, providerType: AISourceType) => {
    try {
      const result = await manager.ensureValidToken(providerType)
      return result
    } catch (error: unknown) {
      const err = error as Error
      console.error(`[Auth IPC] Refresh token error for ${providerType}:`, err)
      return { success: false, error: err.message }
    }
  })

  /**
   * Check token status for a provider
   */
  ipcMain.handle('auth:check-token', async (_event, providerType: AISourceType) => {
    try {
      const result = await manager.ensureValidToken(providerType)
      if (result.success) {
        return { success: true, data: { valid: true, needsRefresh: false } }
      } else {
        return { success: true, data: { valid: false, reason: result.error } }
      }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  /**
   * Logout from a provider
   */
  ipcMain.handle('auth:logout', async (_event, providerType: AISourceType) => {
    try {
      const result = await manager.logout(providerType)
      return result
    } catch (error: unknown) {
      const err = error as Error
      console.error(`[Auth IPC] Logout error for ${providerType}:`, err)
      return { success: false, error: err.message }
    }
  })

  console.log('[Auth IPC] Registered auth handlers')
}
