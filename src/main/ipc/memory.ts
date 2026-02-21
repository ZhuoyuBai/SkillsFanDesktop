/**
 * Memory IPC Handlers
 */

import { ipcMain } from 'electron'
import { clearMemoryForSpace, clearAllMemory } from '../services/memory/clear'

export function registerMemoryHandlers(): void {
  // Clear memory for a specific space or all spaces
  ipcMain.handle('memory:clear', async (_event, scope: 'space' | 'all', spaceId?: string) => {
    try {
      if (scope === 'space' && spaceId) {
        const result = clearMemoryForSpace(spaceId)
        return { success: true, data: result }
      } else if (scope === 'all') {
        const result = clearAllMemory()
        return { success: true, data: result }
      } else {
        return { success: false, error: 'Invalid scope or missing spaceId' }
      }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Memory IPC] Clear error:', err)
      return { success: false, error: err.message }
    }
  })
}
