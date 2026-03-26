/**
 * Native Claude Skill Bridge
 *
 * Keeps SkillsFan-managed skills as the source of truth while exposing them
 * through ~/.claude/skills for Claude Code's native skill loader.
 */

import {
  Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { app } from 'electron'
import { parseFrontmatter } from './frontmatter'

export interface NativeSkillBridgeSkip {
  skillName: string
  path: string
  reason: string
}

export interface NativeSkillBridgeSyncResult {
  created: string[]
  updated: string[]
  removed: string[]
  skipped: NativeSkillBridgeSkip[]
}

function getPrimarySkillsDir(): string {
  const home = homedir()

  if (process.env.SKILLSFAN_DATA_DIR) {
    const dataDir = process.env.SKILLSFAN_DATA_DIR
    const expandedDir = dataDir.startsWith('~')
      ? join(home, dataDir.slice(1))
      : dataDir
    return join(expandedDir, 'skills')
  }

  if (!app.isPackaged) {
    return join(home, '.skillsfan-dev', 'skills')
  }

  return join(home, '.skillsfan', 'skills')
}

function uniqueDirs(dirs: Array<string | undefined>): string[] {
  return Array.from(new Set(dirs.filter((dir): dir is string => typeof dir === 'string' && dir.length > 0)))
}

function getAlternateSkillsDir(): string | undefined {
  const home = homedir()
  return uniqueDirs([
    join(home, '.skillsfan', 'skills'),
    join(home, '.skillsfan-dev', 'skills')
  ]).find((dir) => dir !== getPrimarySkillsDir())
}

export function getClaudeSkillsDir(): string {
  return join(homedir(), '.claude', 'skills')
}

function getSkillsfanSourceDirs(): string[] {
  const home = homedir()
  return uniqueDirs([
    getPrimarySkillsDir(),
    getAlternateSkillsDir(),
    join(home, '.skillsfan', 'skills'),
    join(home, '.skillsfan-dev', 'skills')
  ])
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function normalizePath(path: string): string {
  return resolve(path)
}

function isPathInsideDir(path: string, baseDir: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedBaseDir = normalizePath(baseDir)
  return normalizedPath === normalizedBaseDir
    || normalizedPath.startsWith(`${normalizedBaseDir}${process.platform === 'win32' ? '\\' : '/'}`)
}

function isPathInsideAnyDir(path: string, baseDirs: string[]): boolean {
  return baseDirs.some((baseDir) => isPathInsideDir(path, baseDir))
}

function getDesiredSkillTargets(sourceDirs: string[]): Map<string, string> {
  const desiredTargets = new Map<string, string>()

  for (const skillsDir of sourceDirs) {
    if (!existsSync(skillsDir)) continue

    let entries: Dirent[]
    try {
      entries = readdirSync(skillsDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillDir = join(skillsDir, entry.name)
      const skillMdPath = join(skillDir, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const parsed = parseFrontmatter(readFileSync(skillMdPath, 'utf-8'))
        const skillName = parsed?.data.name?.trim()
        if (!skillName || desiredTargets.has(skillName)) continue
        desiredTargets.set(skillName, skillDir)
      } catch (error) {
        console.warn(`[SkillBridge] Failed to read ${skillMdPath}:`, error)
      }
    }
  }

  return desiredTargets
}

function resolveExistingLinkTarget(linkPath: string): string | undefined {
  try {
    return realpathSync(linkPath)
  } catch {
    try {
      const rawTarget = readlinkSync(linkPath)
      return resolve(dirname(linkPath), rawTarget)
    } catch {
      return undefined
    }
  }
}

function isBridgeOwnedEntry(entryPath: string, sourceDirs: string[]): boolean {
  try {
    const stat = lstatSync(entryPath)
    if (!stat.isSymbolicLink()) return false
  } catch {
    return false
  }

  const targetPath = resolveExistingLinkTarget(entryPath)
  return targetPath ? isPathInsideAnyDir(targetPath, sourceDirs) : false
}

function removeEntry(entryPath: string): void {
  rmSync(entryPath, { recursive: true, force: true })
}

function createBridgeLink(sourceDir: string, linkPath: string): void {
  symlinkSync(sourceDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Sync SkillsFan-managed skills into ~/.claude/skills so Claude Code can load
 * them natively without a custom MCP skill server.
 */
export function syncNativeClaudeSkillBridges(): NativeSkillBridgeSyncResult {
  const sourceDirs = getSkillsfanSourceDirs()
  const desiredTargets = getDesiredSkillTargets(sourceDirs)
  const claudeSkillsDir = getClaudeSkillsDir()

  const result: NativeSkillBridgeSyncResult = {
    created: [],
    updated: [],
    removed: [],
    skipped: []
  }

  mkdirSync(claudeSkillsDir, { recursive: true })

  for (const [skillName, sourceDir] of desiredTargets.entries()) {
    const linkPath = join(claudeSkillsDir, skillName)

    if (!pathExists(linkPath)) {
      createBridgeLink(sourceDir, linkPath)
      result.created.push(skillName)
      continue
    }

    if (!isBridgeOwnedEntry(linkPath, sourceDirs)) {
      result.skipped.push({
        skillName,
        path: linkPath,
        reason: 'Existing native Claude skill is not managed by SkillsFan'
      })
      continue
    }

    const existingTarget = resolveExistingLinkTarget(linkPath)
    if (existingTarget && normalizePath(existingTarget) === normalizePath(sourceDir)) {
      continue
    }

    removeEntry(linkPath)
    createBridgeLink(sourceDir, linkPath)
    result.updated.push(skillName)
  }

  let claudeEntries: Dirent[]
  try {
    claudeEntries = readdirSync(claudeSkillsDir, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of claudeEntries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

    const entryPath = join(claudeSkillsDir, entry.name)
    if (desiredTargets.has(entry.name)) continue
    if (!isBridgeOwnedEntry(entryPath, sourceDirs)) continue

    removeEntry(entryPath)
    result.removed.push(entry.name)
  }

  if (
    result.created.length > 0
    || result.updated.length > 0
    || result.removed.length > 0
    || result.skipped.length > 0
  ) {
    console.log(
      `[SkillBridge] Synced native bridges: created=${result.created.length}, updated=${result.updated.length}, removed=${result.removed.length}, skipped=${result.skipped.length}`
    )
  }

  return result
}
