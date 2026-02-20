/**
 * Atomic File Write Utilities
 *
 * Provides crash-safe file writing using the tmp+rename pattern:
 * 1. Write data to .tmp file
 * 2. Optionally create .bak backup of existing file
 * 3. Atomic rename .tmp → target
 *
 * If the process crashes during step 1, the original file is untouched.
 * If it crashes during step 3, .tmp is complete and can be recovered on startup.
 *
 * Inspired by OpenClaw's cron/service/store.ts atomic write pattern.
 */

import {
  writeFileSync,
  renameSync,
  existsSync,
  unlinkSync,
  copyFileSync,
  readFileSync,
  readdirSync
} from 'fs'
import { join } from 'path'

/**
 * Atomically write a file (string or Buffer).
 *
 * Algorithm: write .tmp → optional .bak → atomic rename
 */
export function atomicWriteFileSync(
  filePath: string,
  data: string | Buffer,
  options?: { backup?: boolean; encoding?: BufferEncoding }
): void {
  const tmpPath = filePath + '.tmp'
  const bakPath = filePath + '.bak'

  try {
    // Step 1: Write to temporary file
    writeFileSync(tmpPath, data, options?.encoding || 'utf-8')

    // Step 2: Create backup (optional)
    if (options?.backup && existsSync(filePath)) {
      try { copyFileSync(filePath, bakPath) } catch { /* best effort */ }
    }

    // Step 3: Atomic rename
    renameSync(tmpPath, filePath)
  } catch (error) {
    // Clean up temp file on error
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* ignore */ }
    throw error
  }
}

/**
 * Atomically write JSON data to a file.
 */
export function atomicWriteJsonSync(
  filePath: string,
  data: any,
  options?: { backup?: boolean; indent?: number }
): void {
  const json = JSON.stringify(data, null, options?.indent ?? 2)
  atomicWriteFileSync(filePath, json, { backup: options?.backup })
}

/**
 * Safely read a JSON file with fallback recovery.
 *
 * Recovery order: main file → .bak → .tmp → defaultValue
 */
export function safeReadJsonSync<T>(filePath: string, defaultValue: T): T {
  // 1. Try main file
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch { /* corrupted, try backup */ }

  // 2. Try .bak recovery
  try {
    const bakPath = filePath + '.bak'
    if (existsSync(bakPath)) {
      const content = readFileSync(bakPath, 'utf-8')
      const data = JSON.parse(content)
      // Restore main file from backup
      atomicWriteFileSync(filePath, content)
      console.log(`[AtomicWrite] Recovered ${filePath} from .bak`)
      return data
    }
  } catch { /* corrupted backup, try tmp */ }

  // 3. Try .tmp recovery
  try {
    const tmpPath = filePath + '.tmp'
    if (existsSync(tmpPath)) {
      const content = readFileSync(tmpPath, 'utf-8')
      const data = JSON.parse(content)
      renameSync(tmpPath, filePath)
      console.log(`[AtomicWrite] Recovered ${filePath} from .tmp`)
      return data
    }
  } catch { /* all recovery failed */ }

  return defaultValue
}

/**
 * Clean up residual .tmp files in a directory.
 * Called once during app initialization.
 *
 * - If main file exists: delete orphan .tmp
 * - If main file missing: recover from .tmp
 */
export function cleanupTmpFiles(dir: string): number {
  if (!existsSync(dir)) return 0

  let cleaned = 0
  const files = readdirSync(dir).filter(f => f.endsWith('.tmp'))

  for (const file of files) {
    const tmpPath = join(dir, file)
    const targetPath = tmpPath.slice(0, -4) // Remove .tmp suffix

    try {
      if (existsSync(targetPath)) {
        unlinkSync(tmpPath) // Main file OK, delete orphan .tmp
      } else {
        try {
          renameSync(tmpPath, targetPath) // Main file missing, recover from .tmp
          console.log(`[AtomicWrite] Recovered ${targetPath} from orphan .tmp`)
        } catch {
          unlinkSync(tmpPath)
        }
      }
      cleaned++
    } catch { /* ignore individual cleanup failures */ }
  }

  return cleaned
}
