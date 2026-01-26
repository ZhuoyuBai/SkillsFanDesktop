/**
 * Skill 注册表
 *
 * 管理所有已加载技能的内存缓存
 */

import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { loadSkillsFromDir } from './skill-loader'
import type { SkillInfo } from './types'

// 技能缓存
const skillCache = new Map<string, SkillInfo>()

// 初始化状态
let initialized = false

/**
 * 获取技能目录路径
 */
export function getSkillsDir(): string {
  // 开发环境或自定义目录
  if (!app.isPackaged || process.env.SKILLSFAN_DATA_DIR) {
    const dataDir = process.env.SKILLSFAN_DATA_DIR
    if (dataDir) {
      const dir = dataDir.startsWith('~') ? join(homedir(), dataDir.slice(1)) : dataDir
      return join(dir, 'skills')
    }
    return join(homedir(), '.skillsfan-dev', 'skills')
  }

  // 生产环境
  return join(homedir(), '.skillsfan', 'skills')
}

/**
 * 初始化技能注册表
 */
export async function initializeRegistry(): Promise<void> {
  if (initialized) return

  const skillsDir = getSkillsDir()
  console.log(`[Skill] Initializing from: ${skillsDir}`)

  const skills = loadSkillsFromDir(skillsDir)

  for (const skill of skills) {
    // 检测重复名称
    if (skillCache.has(skill.name)) {
      console.warn(`[Skill] Duplicate name: ${skill.name}, using: ${skill.location}`)
    }
    skillCache.set(skill.name, skill)
  }

  console.log(`[Skill] Initialized: ${skillCache.size} skills`)
  initialized = true
}

/**
 * 获取所有技能
 */
export function getAllSkills(): SkillInfo[] {
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
export async function reloadSkills(): Promise<void> {
  skillCache.clear()
  initialized = false
  await initializeRegistry()
}

/**
 * 检查是否有可用技能
 */
export function hasSkills(): boolean {
  return skillCache.size > 0
}
