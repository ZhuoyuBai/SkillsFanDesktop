/**
 * Extension IPC Handlers
 *
 * Exposes extension management operations to the renderer process.
 */

import { ipcMain } from 'electron'
import {
  getAllExtensionStatuses,
  setExtensionEnabled,
  reloadExtensions
} from '../services/extension'

export function registerExtensionHandlers(): void {
  // List all extensions with their status
  ipcMain.handle('extension:list', () => {
    try {
      return { success: true, data: getAllExtensionStatuses() }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Enable or disable an extension
  ipcMain.handle('extension:set-enabled', (_event, extensionId: string, enabled: boolean) => {
    try {
      const result = setExtensionEnabled(extensionId, enabled)
      if (!result) {
        return { success: false, error: `Extension not found: ${extensionId}` }
      }
      return { success: true, data: { extensionId, enabled } }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Reload all extensions from disk
  ipcMain.handle('extension:reload', () => {
    try {
      reloadExtensions()
      return { success: true, data: getAllExtensionStatuses() }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  console.log('[IPC] Extension handlers registered')
}
