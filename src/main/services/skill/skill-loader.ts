/**
 * Skill 加载器
 *
 * 扫描技能目录，解析 SKILL.md 文件
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { SkillInfo } from './types'

/**
 * 简化版 YAML frontmatter 解析（不依赖 gray-matter）
 */
function parseFrontmatter(content: string): { data: Record<string, string>; content: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const yaml = match[1]
  const data: Record<string, string> = {}

  for (const line of yaml.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) data[kv[1]] = kv[2].trim()
  }

  return { data, content: content.slice(match[0].length).trim() }
}

/**
 * 从目录加载所有技能
 */
export function loadSkillsFromDir(skillsDir: string): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!existsSync(skillsDir)) {
    console.log(`[Skill] Directory not found: ${skillsDir}`)
    return skills
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue

    try {
      const content = readFileSync(skillFile, 'utf-8')
      const parsed = parseFrontmatter(content)

      if (!parsed?.data.name || !parsed?.data.description) {
        console.warn(`[Skill] Missing name or description: ${skillFile}`)
        continue
      }

      skills.push({
        name: parsed.data.name,
        description: parsed.data.description,
        location: skillFile,
        baseDir: dirname(skillFile)
      })

      console.log(`[Skill] Loaded: ${parsed.data.name}`)
    } catch (err) {
      console.error(`[Skill] Failed to load: ${skillFile}`, err)
    }
  }

  return skills
}

/**
 * 获取技能的完整内容（不含 frontmatter）
 */
export function getSkillContent(location: string): string {
  const content = readFileSync(location, 'utf-8')
  const parsed = parseFrontmatter(content)
  return parsed?.content || ''
}
