/**
 * Native Claude skill storage helpers.
 *
 * Skills are now managed directly inside ~/.claude/skills.
 * Legacy SkillsFan folders are only used as one-time import sources during
 * startup, after which the old copies can be removed.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'fs'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { join, resolve } from 'path'

export interface LegacySkillMigrationSkip {
  skillName: string
  path: string
  reason: string
}

export interface LegacySkillMigrationResult {
  migrated: string[]
  materialized: string[]
  removedLegacySkills: string[]
  removedLegacyDirs: string[]
  skipped: LegacySkillMigrationSkip[]
}

interface LegacySkillCandidate {
  path: string
  fingerprint: string
  mtimeMs: number
}

export function getClaudeSkillsDir(): string {
  return join(homedir(), '.claude', 'skills')
}

export function getLegacySkillsfanDirs(): string[] {
  const home = homedir()
  return Array.from(new Set([
    join(home, '.skillsfan', 'skills'),
    join(home, '.skillsfan-dev', 'skills')
  ]))
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function isDirectoryLike(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function listSkillDirs(baseDir: string): string[] {
  if (!existsSync(baseDir)) return []

  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => {
        const entryPath = join(baseDir, entry.name)
        if (!entry.isDirectory() && !entry.isSymbolicLink()) return false
        if (!isDirectoryLike(entryPath)) return false
        return existsSync(join(entryPath, 'SKILL.md'))
      })
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function listFilesRecursive(dir: string, prefix = ''): string[] {
  let entries: ReturnType<typeof readdirSync<import('fs').Dirent>>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []

  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue

    const absPath = join(dir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name

    if ((entry.isDirectory() || entry.isSymbolicLink()) && isDirectoryLike(absPath)) {
      files.push(...listFilesRecursive(absPath, relPath))
      continue
    }

    files.push(relPath)
  }

  return files.sort()
}

function fingerprintSkillDir(skillDir: string): string {
  const hash = createHash('sha1')
  for (const relPath of listFilesRecursive(skillDir)) {
    hash.update(relPath)
    hash.update(readFileSync(join(skillDir, relPath)))
  }
  return hash.digest('hex')
}

function getSkillMtimeMs(skillDir: string): number {
  try {
    return statSync(join(skillDir, 'SKILL.md')).mtimeMs
  } catch {
    try {
      return statSync(skillDir).mtimeMs
    } catch {
      return 0
    }
  }
}

function normalizePath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function isPathInsideDir(path: string, baseDir: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedBaseDir = normalizePath(baseDir)
  return normalizedPath === normalizedBaseDir
    || normalizedPath.startsWith(`${normalizedBaseDir}${process.platform === 'win32' ? '\\' : '/'}`)
}

function isLegacyOwnedSymlink(path: string, legacyDirs: string[]): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false
    const target = realpathSync(path)
    return legacyDirs.some((legacyDir) => isPathInsideDir(target, legacyDir))
  } catch {
    return false
  }
}

function removeEmptyLegacyDirs(legacyDirs: string[], result: LegacySkillMigrationResult): void {
  for (const legacyDir of legacyDirs) {
    if (!existsSync(legacyDir)) continue

    let entries: string[]
    try {
      entries = readdirSync(legacyDir).filter((name) => name !== '.DS_Store' && !name.startsWith('.'))
    } catch {
      continue
    }

    if (entries.length > 0) continue

    try {
      rmSync(legacyDir, { recursive: true, force: true })
      result.removedLegacyDirs.push(legacyDir)
    } catch {
      // Ignore cleanup failures for legacy directories.
    }
  }
}

function removeLegacySkill(skillName: string, skillPath: string, result: LegacySkillMigrationResult): void {
  try {
    rmSync(skillPath, { recursive: true, force: true })
    result.removedLegacySkills.push(skillName)
  } catch (error) {
    result.skipped.push({
      skillName,
      path: skillPath,
      reason: `Failed to remove legacy copy: ${(error as Error).message}`
    })
  }
}

function materializeLegacySymlink(skillName: string, nativePath: string, result: LegacySkillMigrationResult): void {
  const tempPath = `${nativePath}.migrating-${Date.now()}`
  const targetPath = realpathSync(nativePath)
  cpSync(targetPath, tempPath, { recursive: true, dereference: true, force: true })
  rmSync(nativePath, { recursive: true, force: true })
  renameSync(tempPath, nativePath)
  result.materialized.push(skillName)
}

/**
 * Migrate legacy SkillsFan skills into ~/.claude/skills.
 *
 * Rules:
 * - ~/.claude/skills is authoritative after migration.
 * - Existing real directories in ~/.claude/skills are never overwritten.
 * - If ~/.claude/skills contains a legacy-owned symlink, it is materialized to
 *   a real directory first.
 * - Identical legacy duplicates are removed after the native copy exists.
 * - Diverging legacy copies are left in place and reported as skipped.
 */
export function migrateLegacySkillsToClaudeDir(): LegacySkillMigrationResult {
  const claudeSkillsDir = getClaudeSkillsDir()
  const legacyDirs = getLegacySkillsfanDirs()

  const result: LegacySkillMigrationResult = {
    migrated: [],
    materialized: [],
    removedLegacySkills: [],
    removedLegacyDirs: [],
    skipped: []
  }

  mkdirSync(claudeSkillsDir, { recursive: true })

  for (const skillName of listSkillDirs(claudeSkillsDir)) {
    const nativePath = join(claudeSkillsDir, skillName)
    if (!isLegacyOwnedSymlink(nativePath, legacyDirs)) continue

    try {
      materializeLegacySymlink(skillName, nativePath, result)
    } catch (error) {
      result.skipped.push({
        skillName,
        path: nativePath,
        reason: `Failed to materialize legacy symlink: ${(error as Error).message}`
      })
    }
  }

  const legacyCandidates = new Map<string, LegacySkillCandidate[]>()

  for (const legacyDir of legacyDirs) {
    for (const skillName of listSkillDirs(legacyDir)) {
      const skillPath = join(legacyDir, skillName)

      try {
        const fingerprint = fingerprintSkillDir(skillPath)
        const candidate: LegacySkillCandidate = {
          path: skillPath,
          fingerprint,
          mtimeMs: getSkillMtimeMs(skillPath)
        }

        const existing = legacyCandidates.get(skillName) || []
        existing.push(candidate)
        legacyCandidates.set(skillName, existing)
      } catch (error) {
        result.skipped.push({
          skillName,
          path: skillPath,
          reason: `Failed to inspect legacy skill: ${(error as Error).message}`
        })
      }
    }
  }

  for (const [skillName, candidates] of Array.from(legacyCandidates.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const nativePath = join(claudeSkillsDir, skillName)
    let nativeFingerprint: string | undefined

    if (pathExists(nativePath)) {
      try {
        nativeFingerprint = fingerprintSkillDir(nativePath)
      } catch (error) {
        result.skipped.push({
          skillName,
          path: nativePath,
          reason: `Failed to inspect native skill: ${(error as Error).message}`
        })
        continue
      }
    } else {
      const chosen = [...candidates].sort((left, right) => {
        if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs
        return left.path.localeCompare(right.path)
      })[0]

      try {
        cpSync(chosen.path, nativePath, { recursive: true, dereference: true, force: true })
        nativeFingerprint = chosen.fingerprint
        result.migrated.push(skillName)
      } catch (error) {
        result.skipped.push({
          skillName,
          path: chosen.path,
          reason: `Failed to migrate legacy skill: ${(error as Error).message}`
        })
        continue
      }
    }

    for (const candidate of candidates) {
      if (candidate.fingerprint !== nativeFingerprint) {
        result.skipped.push({
          skillName,
          path: candidate.path,
          reason: 'Legacy copy differs from the native Claude skill and was kept untouched'
        })
        continue
      }

      removeLegacySkill(skillName, candidate.path, result)
    }
  }

  removeEmptyLegacyDirs(legacyDirs, result)

  if (
    result.migrated.length > 0
    || result.materialized.length > 0
    || result.removedLegacySkills.length > 0
    || result.removedLegacyDirs.length > 0
    || result.skipped.length > 0
  ) {
    console.log('[Skill] Legacy migration result:', result)
  }

  return result
}
