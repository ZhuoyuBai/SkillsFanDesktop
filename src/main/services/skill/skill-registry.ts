/**
 * Skill 注册表
 *
 * 管理所有已加载技能的内存缓存
 * 技能目录：
 * - 开发环境：~/.skillsfan-dev/skills/
 * - 生产环境：~/.skillsfan/skills/
 * - 自定义：$SKILLSFAN_DATA_DIR/skills/
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { loadSkillsFromDir } from './skill-loader'
import type { SkillInfo } from './types'

// 技能缓存
const skillCache = new Map<string, SkillInfo>()

// 初始化状态
let initialized = false

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

/**
 * 初始化技能注册表
 */
export async function initializeRegistry(): Promise<void> {
  if (initialized) return

  const skillsDir = getSkillsDir()
  console.log(`[Skill] Initializing from: ${skillsDir}`)

  // 确保目录存在再加载
  if (existsSync(skillsDir)) {
    const skills = loadSkillsFromDir(skillsDir)

    for (const skill of skills) {
      if (skillCache.has(skill.name)) {
        console.warn(`[Skill] Duplicate name: ${skill.name}, using: ${skill.location}`)
      }
      skillCache.set(skill.name, skill)
    }
  } else {
    console.log(`[Skill] Directory not found: ${skillsDir}`)
  }

  console.log(`[Skill] Initialized: ${skillCache.size} skills`)
  initialized = true
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
 */
export async function reloadSkills(): Promise<SkillInfo[]> {
  skillCache.clear()
  initialized = false
  await initializeRegistry()
  return Array.from(skillCache.values())
}

/**
 * 检查是否有可用技能
 */
export function hasSkills(): boolean {
  return skillCache.size > 0
}

/**
 * 确保已初始化（供外部模块使用）
 */
export async function ensureSkillsInitialized(): Promise<void> {
  if (!initialized) {
    await initializeRegistry()
  }
}
