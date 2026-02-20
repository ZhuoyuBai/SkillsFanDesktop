/**
 * Memory Module - Cross-conversation memory using FTS5 full-text search
 *
 * Provides a singleton MemoryIndexManager that indexes conversation messages
 * and enables searching across conversations within the same space.
 */

import { MemoryIndexManager } from './index-manager'

let instance: MemoryIndexManager | null = null

/**
 * Get the singleton MemoryIndexManager instance.
 * Lazily initializes on first access.
 */
export function getMemoryIndexManager(): MemoryIndexManager {
  if (!instance) {
    instance = new MemoryIndexManager()
    instance.initialize()
  }
  return instance
}

/**
 * Shutdown the memory index manager (call on app exit)
 */
export function shutdownMemory(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}

export type { MemoryFragment } from './index-manager'
