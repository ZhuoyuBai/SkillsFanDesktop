/**
 * Skill file watcher.
 *
 * Watches the native managed skill directory and the additional read-only
 * command/skill sources that still appear in the GUI.
 */

import { watch, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getSkillsDir, reloadSkills } from './skill-registry'

let watchers: ReturnType<typeof watch>[] = []
let debounceTimer: NodeJS.Timeout | null = null

function shouldReloadForEvent(eventType: string, filename?: string | Buffer | null): boolean {
  if (eventType === 'rename') {
    return true
  }

  if (!filename) {
    return true
  }

  const normalized = String(filename).replace(/\\/g, '/')
  return normalized.endsWith('.md') || normalized.includes('SKILL.md')
}

/**
 * 启动所有技能目录的文件监控
 */
export function startSkillWatcher(): void {
  // Clean up old watchers
  stopSkillWatcher()

  const home = homedir()
  const managedSkillsDir = getSkillsDir()

  const dirsToWatch = [
    managedSkillsDir,                  // ~/.claude/skills/
    join(home, '.claude', 'commands'), // ~/.claude/commands/
    join(home, '.agents', 'skills'),   // ~/.agents/skills/
  ]

  const dirsToEnsure = new Set<string>([managedSkillsDir])

  for (const dir of dirsToWatch) {
    if (!existsSync(dir)) {
      if (dirsToEnsure.has(dir)) {
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
        if (!shouldReloadForEvent(eventType, filename)) return

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
