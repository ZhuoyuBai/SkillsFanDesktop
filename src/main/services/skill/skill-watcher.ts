/**
 * Skill 文件监听器
 *
 * 监控所有技能目录变化，自动触发热重载
 * 监控目录包括：
 * - ~/.skillsfan/skills/         (SkillsFan 已安装)
 * - ~/.claude/commands/          (全局 Claude Code 命令)
 * - ~/.claude/skills/            (Claude 安装的技能)
 * - ~/.agents/skills/            (第三方 Agent 技能)
 */

import { watch, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getSkillsDir, reloadSkills } from './skill-registry'

let watchers: ReturnType<typeof watch>[] = []
let debounceTimer: NodeJS.Timeout | null = null

/**
 * 启动所有技能目录的文件监控
 */
export function startSkillWatcher(): void {
  // Clean up old watchers
  stopSkillWatcher()

  const home = homedir()

  const dirsToWatch = [
    getSkillsDir(),                             // ~/.skillsfan/skills/
    join(home, '.claude', 'commands'),           // ~/.claude/commands/
    join(home, '.claude', 'skills'),             // ~/.claude/skills/
    join(home, '.agents', 'skills'),             // ~/.agents/skills/
  ]

  for (const dir of dirsToWatch) {
    if (!existsSync(dir)) {
      // Only create SkillsFan's own directory
      if (dir === getSkillsDir()) {
        try {
          mkdirSync(dir, { recursive: true })
          console.log(`[Skill] Created skills directory: ${dir}`)
        } catch (err) {
          console.error(`[Skill] Failed to create skills directory:`, err)
          continue
        }
      } else {
        continue  // Skip native dirs that don't exist
      }
    }

    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        // Watch for .md file changes (SKILL.md for skills, *.md for commands)
        if (!filename?.endsWith('.md')) return

        console.log(`[Skill] Detected change in ${dir}: ${eventType} ${filename}`)

        // Debounce 500ms
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          await reloadSkills()
          console.log(`[Skill] Hot-reloaded skills from all sources`)
        }, 500)
      })

      watchers.push(watcher)
      console.log(`[Skill] Watching: ${dir}`)
    } catch (err) {
      console.warn(`[Skill] Failed to watch ${dir}:`, err)
    }
  }
}

/**
 * 停止所有文件监控
 */
export function stopSkillWatcher(): void {
  for (const watcher of watchers) {
    watcher.close()
  }
  watchers = []
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}
