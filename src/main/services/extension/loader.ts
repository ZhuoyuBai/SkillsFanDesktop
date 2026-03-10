/**
 * Extension Loader - Discovers and loads extensions from disk
 *
 * Extensions are loaded from ~/.skillsfan/extensions/ (or ~/.skillsfan-dev/extensions/).
 * Each extension is a directory containing:
 * - extension.json (manifest with id, name, version)
 * - index.js (entry point exporting hooks)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { getHaloDir } from '../config.service'
import type { ExtensionManifest, ExtensionHooks, LoadedExtension } from './types'

/**
 * Get the extensions directory path
 */
export function getExtensionsDir(): string {
  return join(getHaloDir(), 'extensions')
}

/**
 * Load a single extension from a directory.
 * Returns null if the directory is not a valid extension.
 */
export function loadExtension(extensionDir: string): LoadedExtension | null {
  const manifestPath = join(extensionDir, 'extension.json')

  // Check manifest exists
  if (!existsSync(manifestPath)) {
    console.warn(`[Extension] No extension.json in ${extensionDir}, skipping`)
    return null
  }

  let manifest: ExtensionManifest
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw) as ExtensionManifest
  } catch (error) {
    console.error(`[Extension] Failed to parse manifest in ${extensionDir}:`, error)
    return null
  }

  // Validate required fields
  if (!manifest.id || !manifest.name || !manifest.version) {
    console.error(`[Extension] Invalid manifest in ${extensionDir}: missing id, name, or version`)
    return null
  }

  // Load entry point
  const entryFile = manifest.main || 'index.js'
  const entryPath = join(extensionDir, entryFile)

  if (!existsSync(entryPath)) {
    console.error(`[Extension] Entry point not found: ${entryPath}`)
    return null
  }

  let hooks: ExtensionHooks
  try {
    // Use require() for CommonJS compatibility
    // Extensions are expected to be CJS modules (export hooks directly)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(entryPath)
    hooks = module.default || module

    // Validate hooks are functions
    const validHookNames: (keyof ExtensionHooks)[] = [
      'onBuildSystemPrompt',
      'onBeforeToolUse',
      'onBeforeSendMessage',
      'onAfterMessage',
      'getMcpServers'
    ]

    for (const key of Object.keys(hooks)) {
      if (!validHookNames.includes(key as keyof ExtensionHooks)) {
        console.warn(`[Extension] ${manifest.id}: unknown hook "${key}", ignoring`)
      }
    }

    for (const hookName of validHookNames) {
      if (hooks[hookName] && typeof hooks[hookName] !== 'function') {
        console.error(`[Extension] ${manifest.id}: hook "${hookName}" is not a function`)
        return null
      }
    }
  } catch (error) {
    console.error(`[Extension] Failed to load ${manifest.id}:`, error)
    return {
      manifest,
      hooks: {},
      enabled: false,
      loadedAt: Date.now(),
      directory: extensionDir,
      error: String(error)
    }
  }

  console.log(`[Extension] Loaded: ${manifest.name} v${manifest.version} (${manifest.id})`)

  return {
    manifest,
    hooks,
    enabled: true,
    loadedAt: Date.now(),
    directory: extensionDir
  }
}

/**
 * Discover and load all extensions from the extensions directory.
 */
export function loadAllExtensions(): LoadedExtension[] {
  const extensionsDir = getExtensionsDir()

  if (!existsSync(extensionsDir)) {
    console.log(`[Extension] No extensions directory at ${extensionsDir}`)
    return []
  }

  const loaded: LoadedExtension[] = []

  try {
    const entries = readdirSync(extensionsDir)
    for (const entry of entries) {
      const entryPath = join(extensionsDir, entry)
      if (!statSync(entryPath).isDirectory()) continue

      const ext = loadExtension(entryPath)
      if (ext) {
        loaded.push(ext)
      }
    }
  } catch (error) {
    console.error('[Extension] Failed to scan extensions directory:', error)
  }

  console.log(`[Extension] Loaded ${loaded.length} extensions from ${extensionsDir}`)
  return loaded
}
