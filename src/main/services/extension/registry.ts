/**
 * Extension Registry - Manages extension lifecycle
 *
 * Singleton that loads, tracks, enables/disables extensions.
 * Supports hot-reload via file watching.
 */

import { existsSync, mkdirSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { createHash } from 'crypto'
import { loadAllExtensions, loadExtension, getExtensionsDir } from './loader'
import type { LoadedExtension, ExtensionStatus } from './types'

let extensions: LoadedExtension[] = []
let watcher: FSWatcher | null = null
let reloadTimer: NodeJS.Timeout | null = null
const DEBOUNCE_MS = 500

/**
 * Initialize the extension registry: load all extensions and start watching.
 */
export function initializeExtensions(): void {
  const dir = getExtensionsDir()

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[Extension] Created extensions directory: ${dir}`)
  }

  // Load all extensions
  extensions = loadAllExtensions()

  // Start watching for changes
  startWatcher()
}

/**
 * Get all enabled extensions (for hook runner)
 */
export function getEnabledExtensions(): LoadedExtension[] {
  return extensions.filter(ext => ext.enabled)
}

/**
 * Get all extensions with status info (for IPC/UI)
 */
export function getAllExtensionStatuses(): ExtensionStatus[] {
  return extensions.map(ext => ({
    id: ext.manifest.id,
    name: ext.manifest.name,
    version: ext.manifest.version,
    description: ext.manifest.description,
    enabled: ext.enabled,
    error: ext.error,
    directory: ext.directory
  }))
}

/**
 * Enable or disable an extension by ID
 */
export function setExtensionEnabled(extensionId: string, enabled: boolean): boolean {
  const ext = extensions.find(e => e.manifest.id === extensionId)
  if (!ext) return false

  ext.enabled = enabled
  console.log(`[Extension] ${ext.manifest.name}: ${enabled ? 'enabled' : 'disabled'}`)
  return true
}

/**
 * Reload all extensions from disk
 */
export function reloadExtensions(): void {
  // Clear require cache for extension modules
  for (const ext of extensions) {
    try {
      const entryFile = ext.manifest.main || 'index.js'
      const entryPath = require.resolve(require('path').join(ext.directory, entryFile))
      delete require.cache[entryPath]
    } catch { /* ignore */ }
  }

  extensions = loadAllExtensions()
  console.log(`[Extension] Reloaded: ${extensions.length} extensions`)
}

/**
 * Get a hash of enabled extension IDs (for session rebuild detection)
 */
export function getExtensionHash(): string {
  const enabledIds = extensions
    .filter(ext => ext.enabled)
    .map(ext => ext.manifest.id)
    .sort()
    .join(',')

  return createHash('md5').update(enabledIds).digest('hex').slice(0, 8)
}

/**
 * Start watching the extensions directory for changes
 */
function startWatcher(): void {
  if (watcher) return

  const dir = getExtensionsDir()
  if (!existsSync(dir)) return

  try {
    watcher = watch(dir, { recursive: true }, () => {
      // Debounce reload
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        console.log('[Extension] File change detected, reloading extensions')
        reloadExtensions()
      }, DEBOUNCE_MS)
    })
    console.log(`[Extension] Watching ${dir} for changes`)
  } catch (error) {
    console.warn('[Extension] Failed to start watcher:', error)
  }
}

/**
 * Stop watching and clean up
 */
export function shutdownExtensions(): void {
  if (reloadTimer) {
    clearTimeout(reloadTimer)
    reloadTimer = null
  }
  if (watcher) {
    watcher.close()
    watcher = null
  }
  extensions = []
  console.log('[Extension] Registry shut down')
}
