/**
 * Skill 文件监听器
 *
 * 监控技能目录变化，自动触发热重载
 */

import { watch, existsSync, mkdirSync } from 'fs'
import { reloadSkills } from './skill-registry'

/**
 * 启动技能目录监听
 */
export function startSkillWatcher(skillsDir: string): void {
  // 确保目录存在
  if (!existsSync(skillsDir)) {
    try {
      mkdirSync(skillsDir, { recursive: true })
      console.log(`[Skill] Created skills directory: ${skillsDir}`)
    } catch (err) {
      console.error(`[Skill] Failed to create skills directory:`, err)
      return
    }
  }

  console.log(`[Skill] Watching for changes: ${skillsDir}`)

  // 防抖定时器
  let debounceTimer: NodeJS.Timeout | null = null

  try {
    watch(skillsDir, { recursive: true }, (eventType, filename) => {
      // 只关注 SKILL.md 文件变化
      if (!filename?.endsWith('SKILL.md')) return

      console.log(`[Skill] Detected change: ${eventType} ${filename}`)

      // 防抖：500ms 内的多次变化合并为一次重载
      if (debounceTimer) clearTimeout(debounceTimer)

      debounceTimer = setTimeout(async () => {
        await reloadSkills()
        console.log(`[Skill] Hot-reloaded skills`)
      }, 500)
    })
  } catch (err) {
    console.error(`[Skill] Failed to start watcher:`, err)
  }
}
