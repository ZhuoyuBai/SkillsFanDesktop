/**
 * Skill 注册表
 *
 * 管理所有已加载技能的内存缓存
 * 扫描 5 个来源（按优先级排序）：
 * 1. {project}/.claude/commands/   — 项目级（最高优先级）
 * 2. ~/.skillsfan/skills/          — SkillsFan 已安装
 * 3. ~/.claude/commands/           — 全局 Claude Code 命令
 * 4. ~/.claude/skills/             — Claude 安装的技能
 * 5. ~/.agents/skills/             — 第三方 Agent 技能
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { loadSkillsFromDir, loadClaudeCommands } from './skill-loader'
import type { SkillInfo } from './types'

// 技能缓存
const skillCache = new Map<string, SkillInfo>()

// 初始化状态
let initialized = false

// Current active space working directory (for project-level commands)
let currentSpaceWorkDir: string | undefined

/**
 * 获取技能目录路径
 * 跨平台支持：Mac/Linux/Windows
 */
export function getSkillsDir(): string {
  const home = homedir()

  // 1. 自定义目录（环境变量）
  if (process.env.SKILLSFAN_DATA_DIR) {
    const dataDir = process.env.SKILLSFAN_DATA_DIR
    const dir = dataDir.startsWith('~') ? join(home, dataDir.slice(1)) : dataDir
    return join(dir, 'skills')
  }

  // 2. 开发环境
  if (!app.isPackaged) {
    return join(home, '.skillsfan-dev', 'skills')
  }

  // 3. 生产环境
  return join(home, '.skillsfan', 'skills')
}

export function getClaudeSkillsDir(): string {
  return join(homedir(), '.claude', 'skills')
}

/**
 * 初始化技能注册表 — 扫描所有来源
 * 优先级：项目级 > SkillsFan > 全局 Claude > Claude Skills > Agents Skills
 */
export async function initializeRegistry(spaceWorkDir?: string): Promise<void> {
  if (initialized) return

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

  // ========== 2. SkillsFan installed skills ==========
  const skillsfanDir = getSkillsDir()
  if (existsSync(skillsfanDir)) {
    addSkills(loadSkillsFromDir(skillsfanDir, { kind: 'skillsfan' }))
  }

  // ========== 3. Global Claude Code commands ==========
  const globalCmdsDir = join(home, '.claude', 'commands')
  addSkills(loadClaudeCommands(globalCmdsDir, { kind: 'global-commands' }))

  // ========== 4. Claude installed skills ==========
  const claudeSkillsDir = join(home, '.claude', 'skills')
  if (existsSync(claudeSkillsDir)) {
    addSkills(loadSkillsFromDir(claudeSkillsDir, { kind: 'claude-skills' }))
  }

  // ========== 5. Third-party Agent skills ==========
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
 * 更新当前活跃 Space 的工作目录
 * 切换 Space 时调用，会触发技能重新加载
 */
export async function updateSpaceWorkDir(workDir: string | undefined): Promise<void> {
  currentSpaceWorkDir = workDir
  await reloadSkills()
}

/**
 * 确保已初始化（供外部模块使用）
 */
export async function ensureSkillsInitialized(): Promise<void> {
  if (!initialized) {
    await initializeRegistry()
  }
}
