/**
 * Skill 加载器
 *
 * 扫描技能目录，解析 SKILL.md 文件
 * 同时支持 Claude Code commands 格式（纯 .md 文件）
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import type { SkillInfo, SkillSource } from './types'
import { parseFrontmatter } from './frontmatter'

/**
 * 从 Markdown 内容中提取 H1 标题
 */
function extractH1Title(content: string): string | null {
  // Skip frontmatter before looking for H1
  const body = content.replace(/^\s*---[\s\S]*?---\s*(?:\r?\n|$)/, '')
  const match = body.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * 从 Markdown 内容中提取描述
 * 优先级: frontmatter description > H1 标题 > 第一行非空文本
 */
function extractDescription(content: string, fallbackName: string): string {
  // 1. Try frontmatter
  const fmMatch = content.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m)
    if (descMatch) return descMatch[1].trim()
  }

  // 2. Get body (skip frontmatter)
  const body = fmMatch
    ? content.slice(fmMatch[0].length).trim()
    : content.trim()

  // 3. First line is H1 title
  const firstLine = body.split('\n')[0]
  if (firstLine?.startsWith('#')) {
    return firstLine.replace(/^#+\s*/, '').trim()
  }

  // 4. First non-empty line
  const lines = body.split('\n').filter(l => l.trim())
  if (lines.length > 0) {
    const desc = lines[0].trim()
    return desc.length > 100 ? desc.slice(0, 100) + '...' : desc
  }

  return `Custom command: ${fallbackName}`
}

/**
 * 从目录加载所有 SKILL.md 格式的技能
 */
export function loadSkillsFromDir(skillsDir: string, source: SkillSource): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!existsSync(skillsDir)) {
    return skills
  }

  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    return skills
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue

    try {
      const content = readFileSync(skillFile, 'utf-8')
      const parsed = parseFrontmatter(content)

      if (!parsed?.data.name || !parsed?.data.description) {
        console.warn(`[Skill] Missing name or description: ${skillFile}`)
        continue
      }

      // 从正文提取 H1 标题作为显示名称，如果没有则使用 name
      const displayName = extractH1Title(parsed.body) || parsed.data.name

      const skillDir = dirname(skillFile)
      const files = listFilesRecursive(skillDir, '')
      const fileContents: Record<string, string> = {}
      for (const f of files) {
        try {
          fileContents[f] = readFileSync(join(skillDir, f), 'utf-8')
        } catch { /* skip unreadable files */ }
      }

      skills.push({
        name: parsed.data.name,
        displayName,
        description: parsed.data.description,
        icon: parsed.data.icon || undefined,
        location: skillFile,
        baseDir: skillDir,
        source,
        readonly: source.kind !== 'skillsfan',
        files,
        fileContents
      })

      console.log(`[Skill] Loaded: ${parsed.data.name} (${source.kind})`)
    } catch (err) {
      console.error(`[Skill] Failed to load: ${skillFile}`, err)
    }
  }

  return skills
}

/**
 * 加载 Claude Code commands 格式的技能
 * 格式：目录下的 .md 文件，文件名即命令名，无需 frontmatter
 */
export function loadClaudeCommands(commandsDir: string, source: SkillSource): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!existsSync(commandsDir)) return skills

  let entries: string[]
  try {
    entries = readdirSync(commandsDir)
  } catch {
    return skills
  }

  for (const file of entries) {
    if (!file.endsWith('.md')) continue

    const filePath = join(commandsDir, file)
    try {
      const stat = statSync(filePath)
      if (!stat.isFile()) continue

      const content = readFileSync(filePath, 'utf-8')

      // Command name = filename without .md extension
      const name = basename(file, '.md')

      const description = extractDescription(content, name)
      const displayName = extractH1Title(content) || name

      skills.push({
        name,
        displayName,
        description,
        location: filePath,
        baseDir: commandsDir,
        source,
        readonly: true,  // Claude Code native commands are read-only
        files: [file],
        fileContents: { [file]: content }
      })

      console.log(`[Skill] Loaded command: ${name} (${source.kind})`)
    } catch (err) {
      console.error(`[Skill] Failed to load command: ${filePath}`, err)
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
  // If no frontmatter (e.g., Claude commands), return full content
  return parsed?.body || content
}

/**
 * List all files in a skill's directory (relative paths).
 * For command-style skills (single .md file), returns just that file.
 */
export function listSkillFiles(skill: SkillInfo): string[] {
  const { source, baseDir, location } = skill

  // Commands are single files — return just the filename
  if (source.kind === 'project-commands' || source.kind === 'global-commands') {
    return [basename(location)]
  }

  // Skill folders — recursively list all files
  return listFilesRecursive(baseDir, '')
}

function listFilesRecursive(dir: string, prefix: string): string[] {
  const results: string[] = []
  let entries: ReturnType<typeof readdirSync<import('fs').Dirent>>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name), rel))
    } else {
      results.push(rel)
    }
  }
  return results.sort()
}
