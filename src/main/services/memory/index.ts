/**
 * Memory Module - Cross-conversation memory with hybrid search
 *
 * Provides a singleton MemoryIndexManager that indexes conversation messages
 * and enables searching across conversations within the same space.
 * Supports both keyword (LIKE) and semantic (vector) search.
 */

import { MemoryIndexManager } from './index-manager'
import { getConfig, onMemoryConfigChange } from '../config.service'
import { shutdownEmbedding } from './embedding'

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
    const semanticSearch = memoryConfig.semanticSearch !== false // default true
    instance.updateConfig(memoryConfig.enabled, memoryConfig.retentionDays, semanticSearch)

    // Register config change listener (once)
    if (!configListenerRegistered) {
      onMemoryConfigChange((enabled, retentionDays) => {
        if (instance) {
          const cfg = getConfig()
          const semantic = cfg.memory?.semanticSearch !== false
          instance.updateConfig(enabled, retentionDays, semantic)
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
export async function shutdownMemory(): Promise<void> {
  if (instance) {
    instance.close()
    instance = null
  }
  await shutdownEmbedding()
}

export type { MemoryFragment } from './index-manager'
