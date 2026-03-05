/**
 * Memory IPC Handlers
 */

import { clearMemoryForSpace, clearAllMemory } from '../services/memory/clear'
import { ipcHandle } from './utils'

export function registerMemoryHandlers(): void {
  ipcHandle('memory:clear', (_e, scope: 'space' | 'all', spaceId?: string) => {
    if (scope === 'space' && spaceId) {
      return clearMemoryForSpace(spaceId)
    } else if (scope === 'all') {
      return clearAllMemory()
    } else {
      throw new Error('Invalid scope or missing spaceId')
    }
  })
}
