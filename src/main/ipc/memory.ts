/**
 * Memory IPC Handlers
 */

import { clearMemoryForSpace, clearAllMemory } from '../services/memory/clear'
import { readMemoryMd, saveMemoryMd } from '../services/memory/memory-md'
import { getMemoryIndexManager } from '../services/memory/index'
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

  ipcHandle('memory:read-md', (_e, spaceId: string) => {
    return readMemoryMd(spaceId)
  })

  ipcHandle('memory:save-md', (_e, spaceId: string, content: string) => {
    return saveMemoryMd(spaceId, content)
  })

  ipcHandle('memory:get-stats', (_e, spaceId: string) => {
    const manager = getMemoryIndexManager()
    return manager.getSpaceStats(spaceId)
  })
}
