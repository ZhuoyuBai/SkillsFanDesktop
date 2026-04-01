/**
 * Skill registry.
 *
 * The managed install target is now ~/.claude/skills.
 * Legacy SkillsFan folders are migrated into the native Claude directory during
 * initialization and are no longer scanned as active skill sources.
 *
 * Sources are loaded in priority order:
 * 1. {project}/.claude/commands/   — project-level commands
 * 2. ~/.claude/skills/             — managed Claude skills
 * 3. ~/.claude/commands/           — global Claude commands
 * 4. ~/.agents/skills/             — third-party agent skills
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { loadSkillsFromDir, loadClaudeCommands } from './skill-loader'
import { getClaudeSkillsDir, migrateLegacySkillsToClaudeDir } from './native-bridge'
import type { SkillInfo } from './types'

// 技能缓存
const skillCache = new Map<string, SkillInfo>()

// 初始化状态
let initialized = false

// Current active space working directory (for project-level commands)
let currentSpaceWorkDir: string | undefined

/**
 * 获取技能目录路径（主目录，用于安装）
 * 统一使用 Claude Code 原生目录，尽量减少 SkillsFan 自己的运行时干预。
 */
export function getSkillsDir(): string {
  return getClaudeSkillsDir()
}

/**
 * 初始化技能注册表 — 扫描所有来源
 * 优先级：项目级 > 托管技能 > 全局 Claude > Agents Skills
 */
export async function initializeRegistry(spaceWorkDir?: string): Promise<void> {
  if (initialized) return

  migrateLegacySkillsToClaudeDir()

  const home = homedir()
  const seenNames = new Set<string>()

  // Store for future reloads
  if (spaceWorkDir) {
    currentSpaceWorkDir = spaceWorkDir
  }

  // Helper: add skills with dedup
  function addSkills(skills: SkillInfo[]): void {
    for (const skill of skills) {
      if (!seenNames.has(skill.name)) {
        seenNames.add(skill.name)
        skillCache.set(skill.name, skill)
      }
    }
  }

  // ========== 1. Project-level Claude Code commands (highest priority) ==========
  if (currentSpaceWorkDir) {
    const projectCmdsDir = join(currentSpaceWorkDir, '.claude', 'commands')
    addSkills(loadClaudeCommands(projectCmdsDir, {
      kind: 'project-commands',
      projectDir: currentSpaceWorkDir
    }))
  }

  // ========== 2. Managed native Claude skills ==========
  const managedSkillsDir = getSkillsDir()
  if (existsSync(managedSkillsDir)) {
    addSkills(loadSkillsFromDir(managedSkillsDir, { kind: 'skillsfan' }))
  }

  // ========== 3. Global Claude Code commands ==========
  const globalCmdsDir = join(home, '.claude', 'commands')
  addSkills(loadClaudeCommands(globalCmdsDir, { kind: 'global-commands' }))

  // ========== 4. Third-party Agent skills ==========
  const agentsSkillsDir = join(home, '.agents', 'skills')
  if (existsSync(agentsSkillsDir)) {
    addSkills(loadSkillsFromDir(agentsSkillsDir, { kind: 'agents-skills' }))
  }

  console.log(`[Skill] Initialized: ${skillCache.size} skills (${countSources()})`)
  initialized = true
}

/**
 * Count skills per source for logging
 */
function countSources(): string {
  const sources = new Map<string, number>()
  for (const skill of skillCache.values()) {
    const kind = skill.source.kind
    sources.set(kind, (sources.get(kind) || 0) + 1)
  }
  return Array.from(sources.entries())
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

/**
 * 确保已初始化（用于 IPC 调用）
 */
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initializeRegistry()
  }
}

/**
 * 获取所有技能（会自动初始化）
 */
export async function getAllSkills(): Promise<SkillInfo[]> {
  await ensureInitialized()
  return Array.from(skillCache.values())
}

/**
 * 根据名称获取技能
 */
export function getSkill(name: string): SkillInfo | undefined {
  return skillCache.get(name)
}

/**
 * 重新加载所有技能（热重载）
 * 支持传入 spaceWorkDir 以刷新项目级技能
 */
export async function reloadSkills(spaceWorkDir?: string): Promise<SkillInfo[]> {
  skillCache.clear()
  initialized = false
  if (spaceWorkDir !== undefined) {
    currentSpaceWorkDir = spaceWorkDir
  }
  await initializeRegistry()
  return Array.from(skillCache.values())
}

/**
 * Invalidate the in-memory registry cache.
 * The next read will rescan all sources from disk.
 */
export function invalidateSkillsCache(): void {
  skillCache.clear()
  initialized = false
}

export interface EnsureSkillsOptions {
  forceRefresh?: boolean
}

/**
 * 更新当前活跃 Space 的工作目录
 * 切换 Space 时调用，会触发技能重新加载
 */
export async function updateSpaceWorkDir(workDir: string | undefined): Promise<void> {
  currentSpaceWorkDir = workDir
  await reloadSkills()
}

/**
 * 检查是否有可用技能
 */
export function hasSkills(): boolean {
  return skillCache.size > 0
}

/**
 * Build a stable signature for the currently loaded skill catalog.
 * Used by V2 session rebuild logic so skill changes force a new CC session.
 */
export function getSkillsSignature(): string {
  if (skillCache.size === 0) {
    return ''
  }

  const fingerprint = Array.from(skillCache.values())
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source.kind,
      location: skill.location
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return createHash('sha1')
    .update(JSON.stringify(fingerprint))
    .digest('hex')
}

/**
 * 确保已初始化（供外部模块使用）
 */
export async function ensureSkillsInitialized(
  spaceWorkDir?: string,
  options?: EnsureSkillsOptions
): Promise<void> {
  if (!initialized) {
    await initializeRegistry(spaceWorkDir)
    return
  }

  if (options?.forceRefresh) {
    await reloadSkills(spaceWorkDir !== undefined ? spaceWorkDir : currentSpaceWorkDir)
    return
  }

  if (spaceWorkDir !== undefined && spaceWorkDir !== currentSpaceWorkDir) {
    await updateSpaceWorkDir(spaceWorkDir)
  }
}
