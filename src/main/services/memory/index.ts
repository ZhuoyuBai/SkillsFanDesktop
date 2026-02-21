/**
 * Memory Module - Cross-conversation memory using keyword search
 *
 * Provides a singleton MemoryIndexManager that indexes conversation messages
 * and enables searching across conversations within the same space.
 */

import { MemoryIndexManager } from './index-manager'
import { getConfig, onMemoryConfigChange } from '../config.service'

let instance: MemoryIndexManager | null = null
let configListenerRegistered = false

/**
 * Get the singleton MemoryIndexManager instance.
 * Lazily initializes on first access.
 */
export function getMemoryIndexManager(): MemoryIndexManager {
  if (!instance) {
    instance = new MemoryIndexManager()
    instance.initialize()

    // Load initial config
    const config = getConfig()
    const memoryConfig = config.memory || { enabled: true, retentionDays: 0 }
    instance.updateConfig(memoryConfig.enabled, memoryConfig.retentionDays)

    // Register config change listener (once)
    if (!configListenerRegistered) {
      onMemoryConfigChange((enabled, retentionDays) => {
        if (instance) {
          instance.updateConfig(enabled, retentionDays)
        }
      })
      configListenerRegistered = true
    }
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
