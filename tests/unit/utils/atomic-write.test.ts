/**
 * Atomic Write Utilities Unit Tests
 *
 * Tests for crash-safe file writing using tmp+rename pattern.
 * Uses real file system operations for most tests.
 * Crash simulation uses filesystem permissions (chmod) to trigger failures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  atomicWriteFileSync,
  atomicWriteFile,
  atomicWriteJsonSync,
  atomicWriteJson,
  safeReadJsonSync,
  safeReadJson,
  cleanupTmpFiles
} from '../../../src/main/utils/atomic-write'

// Each test gets an isolated subdirectory under __HALO_TEST_DIR__
let testDir: string
let testCounter = 0

beforeEach(() => {
  testCounter++
  testDir = path.join(globalThis.__HALO_TEST_DIR__, `atomic-test-${testCounter}`)
  fs.mkdirSync(testDir, { recursive: true })
})

// Ensure all directories are writable for cleanup
afterEach(() => {
  try {
    // Restore permissions in case crash safety tests changed them
    const restorePerms = (dir: string) => {
      try {
        fs.chmodSync(dir, 0o755)
      } catch { /* ignore */ }
    }
    restorePerms(testDir)
    // Also restore any subdirectories
    if (fs.existsSync(testDir)) {
      for (const entry of fs.readdirSync(testDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          restorePerms(path.join(testDir, entry.name))
        }
      }
    }
  } catch { /* ignore */ }
})

// ============================================
// 1. atomicWriteFileSync Basic Functionality
// ============================================

describe('atomicWriteFileSync', () => {
  describe('basic functionality', () => {
    it('1.1: should write file content correctly', () => {
      const filePath = path.join(testDir, 'test.txt')

      atomicWriteFileSync(filePath, 'hello')

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello')
      // No .tmp residual
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    })

    it('1.2: should overwrite existing file', () => {
      const filePath = path.join(testDir, 'test.txt')

      fs.writeFileSync(filePath, 'old content')
      atomicWriteFileSync(filePath, 'new content')

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
    })

    it('1.3: should throw for nonexistent directory', () => {
      const filePath = path.join(testDir, 'nonexistent', 'dir', 'file.txt')

      expect(() => atomicWriteFileSync(filePath, 'data')).toThrow()
    })
  })

  // ============================================
  // 2. Backup Functionality
  // ============================================

  describe('backup functionality', () => {
    it('2.1: backup=true should create .bak file', () => {
      const filePath = path.join(testDir, 'data.json')

      fs.writeFileSync(filePath, '{"old":true}')
      atomicWriteFileSync(filePath, '{"new":true}', { backup: true })

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"new":true}')
      expect(fs.readFileSync(filePath + '.bak', 'utf-8')).toBe('{"old":true}')
    })

    it('2.2: backup=true with no existing file should not create .bak', () => {
      const filePath = path.join(testDir, 'new-file.txt')

      atomicWriteFileSync(filePath, 'data', { backup: true })

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('data')
      expect(fs.existsSync(filePath + '.bak')).toBe(false)
    })

    it('2.3: backup=false (default) should not create .bak', () => {
      const filePath = path.join(testDir, 'data.txt')

      fs.writeFileSync(filePath, 'original')
      atomicWriteFileSync(filePath, 'new')

      expect(fs.existsSync(filePath + '.bak')).toBe(false)
    })
  })

  // ============================================
  // 3. Crash Safety
  // ============================================

  describe('crash safety', () => {
    it('3.1: .tmp write failure should not affect original file', () => {
      // Use a subdirectory so we can safely chmod it
      const subDir = path.join(testDir, 'crash-test-1')
      fs.mkdirSync(subDir)
      const filePath = path.join(subDir, 'important.json')
      fs.writeFileSync(filePath, '{"original":true}')

      // Make directory read-only: can read files but can't create new ones (.tmp)
      fs.chmodSync(subDir, 0o555)

      try {
        expect(() => atomicWriteFileSync(filePath, '{"corrupted":true}')).toThrow()
        // Original file should be untouched
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"original":true}')
        // No .tmp residual
        expect(fs.existsSync(filePath + '.tmp')).toBe(false)
      } finally {
        fs.chmodSync(subDir, 0o755)
      }
    })

    it('3.2: rename failure should clean up .tmp', () => {
      // Create target as a non-empty directory so rename(file → dir) fails
      const subDir = path.join(testDir, 'crash-test-2')
      fs.mkdirSync(subDir)
      const filePath = path.join(subDir, 'target.json')

      // Make target a non-empty directory — renameSync(file, non-empty-dir) fails
      fs.mkdirSync(filePath)
      fs.writeFileSync(path.join(filePath, 'blocker.txt'), 'block')

      expect(() => atomicWriteFileSync(subDir + '/target.json', 'data')).toThrow()
      // .tmp should be cleaned up
      expect(fs.existsSync(subDir + '/target.json.tmp')).toBe(false)
    })
  })
})

// ============================================
// 4. atomicWriteJsonSync
// ============================================

describe('atomicWriteJsonSync', () => {
  it('4.1: should write JSON object with 2-space indent', () => {
    const filePath = path.join(testDir, 'config.json')

    atomicWriteJsonSync(filePath, { key: 'value' })

    const content = fs.readFileSync(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual({ key: 'value' })
    expect(content).toBe(JSON.stringify({ key: 'value' }, null, 2))
  })

  it('4.2: should support custom indent', () => {
    const filePath = path.join(testDir, 'config.json')

    atomicWriteJsonSync(filePath, { a: 1 }, { indent: 4 })

    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).toBe(JSON.stringify({ a: 1 }, null, 4))
  })

  it('4.3: should pass backup option through', () => {
    const filePath = path.join(testDir, 'config.json')

    fs.writeFileSync(filePath, '{"old":true}')
    atomicWriteJsonSync(filePath, { new: true }, { backup: true })

    expect(fs.existsSync(filePath + '.bak')).toBe(true)
  })
})

// ============================================
// 5. safeReadJsonSync Normal Reading
// ============================================

describe('safeReadJsonSync', () => {
  describe('normal reading', () => {
    it('5.1: should read valid JSON file', () => {
      const filePath = path.join(testDir, 'data.json')
      fs.writeFileSync(filePath, '{"data":123}')

      const result = safeReadJsonSync(filePath, {})

      expect(result).toEqual({ data: 123 })
    })

    it('5.2: should return default value when file does not exist', () => {
      const filePath = path.join(testDir, 'nonexistent.json')

      const result = safeReadJsonSync(filePath, { default: true })

      expect(result).toEqual({ default: true })
    })
  })

  // ============================================
  // 6. Corruption Recovery
  // ============================================

  describe('corruption recovery', () => {
    it('6.1: should recover from .bak when main file is corrupted', () => {
      const filePath = path.join(testDir, 'data.json')

      fs.writeFileSync(filePath, 'corrupted{{{')
      fs.writeFileSync(filePath + '.bak', '{"recovered":true}')

      const result = safeReadJsonSync(filePath, {})

      expect(result).toEqual({ recovered: true })
      // Main file should be restored
      expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ recovered: true })
    })

    it('6.2: should recover from .tmp when main and .bak are corrupted', () => {
      const filePath = path.join(testDir, 'data.json')

      fs.writeFileSync(filePath, 'bad')
      fs.writeFileSync(filePath + '.bak', 'also bad')
      fs.writeFileSync(filePath + '.tmp', '{"from_tmp":true}')

      const result = safeReadJsonSync(filePath, {})

      expect(result).toEqual({ from_tmp: true })
      // .tmp should be renamed to main file
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    })

    it('6.3: should return default value when all sources are corrupted', () => {
      const filePath = path.join(testDir, 'data.json')

      fs.writeFileSync(filePath, 'bad')
      fs.writeFileSync(filePath + '.bak', 'bad')
      fs.writeFileSync(filePath + '.tmp', 'bad')

      const result = safeReadJsonSync(filePath, { fallback: true })

      expect(result).toEqual({ fallback: true })
    })

    it('6.4: should recover from .bak when main file does not exist', () => {
      const filePath = path.join(testDir, 'data.json')

      // Only create .bak, no main file
      fs.writeFileSync(filePath + '.bak', '{"backup_only":true}')

      const result = safeReadJsonSync(filePath, {})

      expect(result).toEqual({ backup_only: true })
    })
  })
})

// ============================================
// 7. Async APIs
// ============================================

describe('async APIs', () => {
  describe('atomicWriteFile', () => {
    it('7.1: should write file content correctly', async () => {
      const filePath = path.join(testDir, 'async.txt')

      await atomicWriteFile(filePath, 'hello async')

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello async')
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    })

    it('7.2: backup=true should create .bak file', async () => {
      const filePath = path.join(testDir, 'async-data.json')

      fs.writeFileSync(filePath, '{"old":true}')
      await atomicWriteFile(filePath, '{"new":true}', { backup: true })

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"new":true}')
      expect(fs.readFileSync(filePath + '.bak', 'utf-8')).toBe('{"old":true}')
    })

    it('7.3: should throw for nonexistent directory', async () => {
      const filePath = path.join(testDir, 'nonexistent', 'dir', 'file.txt')

      await expect(atomicWriteFile(filePath, 'data')).rejects.toThrow()
    })

    it('7.4: rename failure should clean up .tmp', async () => {
      const subDir = path.join(testDir, 'async-crash-test')
      fs.mkdirSync(subDir)
      const filePath = path.join(subDir, 'target.json')

      fs.mkdirSync(filePath)
      fs.writeFileSync(path.join(filePath, 'blocker.txt'), 'block')

      await expect(atomicWriteFile(filePath, 'data')).rejects.toThrow()
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    })
  })

  describe('atomicWriteJson', () => {
    it('7.5: should write JSON object with default indent', async () => {
      const filePath = path.join(testDir, 'async-config.json')

      await atomicWriteJson(filePath, { key: 'value' })

      const content = fs.readFileSync(filePath, 'utf-8')
      expect(JSON.parse(content)).toEqual({ key: 'value' })
      expect(content).toBe(JSON.stringify({ key: 'value' }, null, 2))
    })

    it('7.6: should support custom indent', async () => {
      const filePath = path.join(testDir, 'async-custom-config.json')

      await atomicWriteJson(filePath, { a: 1 }, { indent: 4 })

      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content).toBe(JSON.stringify({ a: 1 }, null, 4))
    })
  })

  describe('safeReadJson', () => {
    it('7.7: should read valid JSON file', async () => {
      const filePath = path.join(testDir, 'async-read.json')
      fs.writeFileSync(filePath, '{"data":123}')

      const result = await safeReadJson(filePath, {})

      expect(result).toEqual({ data: 123 })
    })

    it('7.8: should recover from .bak when main file is corrupted', async () => {
      const filePath = path.join(testDir, 'async-recover-bak.json')

      fs.writeFileSync(filePath, 'corrupted{{{')
      fs.writeFileSync(filePath + '.bak', '{"recovered":true}')

      const result = await safeReadJson(filePath, {})

      expect(result).toEqual({ recovered: true })
      expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ recovered: true })
    })

    it('7.9: should recover from .tmp when main and .bak are corrupted', async () => {
      const filePath = path.join(testDir, 'async-recover-tmp.json')

      fs.writeFileSync(filePath, 'bad')
      fs.writeFileSync(filePath + '.bak', 'also bad')
      fs.writeFileSync(filePath + '.tmp', '{"from_tmp":true}')

      const result = await safeReadJson(filePath, {})

      expect(result).toEqual({ from_tmp: true })
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    })

    it('7.10: should return default value when all sources are corrupted', async () => {
      const filePath = path.join(testDir, 'async-all-bad.json')

      fs.writeFileSync(filePath, 'bad')
      fs.writeFileSync(filePath + '.bak', 'bad')
      fs.writeFileSync(filePath + '.tmp', 'bad')

      const result = await safeReadJson(filePath, { fallback: true })

      expect(result).toEqual({ fallback: true })
    })
  })
})

// ============================================
// 8. cleanupTmpFiles
// ============================================

describe('cleanupTmpFiles', () => {
  it('8.1: should delete orphan .tmp when main file exists', () => {
    const filePath = path.join(testDir, 'data.json')
    fs.writeFileSync(filePath, '{"original":true}')
    fs.writeFileSync(filePath + '.tmp', '{"orphan":true}')

    const result = cleanupTmpFiles(testDir)

    expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"original":true}')
    expect(result).toBe(1)
  })

  it('8.2: should recover from .tmp when main file is missing', () => {
    const tmpPath = path.join(testDir, 'data.json.tmp')
    fs.writeFileSync(tmpPath, '{"recovered":true}')

    const result = cleanupTmpFiles(testDir)

    const mainPath = path.join(testDir, 'data.json')
    expect(fs.existsSync(mainPath)).toBe(true)
    expect(fs.readFileSync(mainPath, 'utf-8')).toBe('{"recovered":true}')
    expect(fs.existsSync(tmpPath)).toBe(false)
    expect(result).toBe(1)
  })

  it('8.3: should handle mixed .tmp files', () => {
    // a.json exists + a.json.tmp (should delete tmp)
    fs.writeFileSync(path.join(testDir, 'a.json'), '{"a":true}')
    fs.writeFileSync(path.join(testDir, 'a.json.tmp'), '{"a_tmp":true}')

    // b.json.tmp only (should recover)
    fs.writeFileSync(path.join(testDir, 'b.json.tmp'), '{"b":true}')

    const result = cleanupTmpFiles(testDir)

    expect(fs.existsSync(path.join(testDir, 'a.json.tmp'))).toBe(false)
    expect(fs.readFileSync(path.join(testDir, 'a.json'), 'utf-8')).toBe('{"a":true}')
    expect(fs.existsSync(path.join(testDir, 'b.json'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'b.json.tmp'))).toBe(false)
    expect(result).toBe(2)
  })

  it('8.4: should return 0 for empty directory', () => {
    const emptyDir = path.join(testDir, 'empty')
    fs.mkdirSync(emptyDir, { recursive: true })

    const result = cleanupTmpFiles(emptyDir)

    expect(result).toBe(0)
  })

  it('8.5: should not affect non-.tmp files', () => {
    fs.writeFileSync(path.join(testDir, 'data.json'), '{"data":true}')
    fs.writeFileSync(path.join(testDir, 'other.bak'), 'backup')
    fs.writeFileSync(path.join(testDir, 'readme.txt'), 'info')

    const result = cleanupTmpFiles(testDir)

    expect(fs.existsSync(path.join(testDir, 'data.json'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'other.bak'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'readme.txt'))).toBe(true)
    expect(result).toBe(0)
  })
})
