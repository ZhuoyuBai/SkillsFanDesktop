/**
 * Slash Command Service - Scan and return slash commands for the / popup
 *
 * Scans built-in commands and user skills from 4 paths (by priority):
 * 1. {spaceDir}/.claude/commands/ *.md - Project-level Claude Code commands
 * 2. ~/.claude/commands/ *.md - Global Claude Code commands
 * 3. ~/.claude/skills/{name}/SKILL.md - Managed Claude skills
 * 4. ~/.agents/skills/{name}/SKILL.md - Agents installed skills
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getSpace } from './space.service'
import { getSkillsDir } from './skill/skill-registry'

// ========== Types ==========

export type CommandSourceKind = 'builtin' | 'project' | 'global' | 'skillsfan' | 'agents-skills'

export interface CommandSource {
  kind: CommandSourceKind
  dir?: string // For 'project' kind
}

export interface SlashCommand {
  name: string
  description: string
  type: 'immediate' | 'prompt' | 'skill'
  source: CommandSource
  content?: string
  filePath?: string
}

// ========== Built-in Commands ==========

const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: 'clear',
    description: 'Clear conversation history',
    type: 'immediate',
    source: { kind: 'builtin' }
  },
  {
    name: 'cost',
    description: 'Show token usage statistics',
    type: 'immediate',
    source: { kind: 'builtin' }
  },
  {
    name: 'help',
    description: 'Show available commands',
    type: 'immediate',
    source: { kind: 'builtin' }
  },
  {
    name: 'compact',
    description: 'Compress conversation context',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Please compress and summarize our conversation so far, keeping key context and decisions.'
  },
  {
    name: 'doctor',
    description: 'Diagnose project health',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Analyze this project\'s health: check for outdated dependencies, security vulnerabilities, code quality issues, and configuration problems. Provide a summary report with actionable recommendations.'
  },
  {
    name: 'init',
    description: 'Initialize CLAUDE.md for project',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Create or update a CLAUDE.md file for this project. Analyze the codebase structure, tech stack, key patterns, and development commands, then generate a comprehensive CLAUDE.md.'
  },
  {
    name: 'review',
    description: 'Review code quality',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Review the recent code changes in this project. Focus on: code quality, potential bugs, performance issues, security concerns, and adherence to project conventions. Provide specific, actionable feedback.'
  },
  {
    name: 'memory',
    description: 'Edit project memory file',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Review and update the project memory file (MEMORY.md). Read the current MEMORY.md (create if it doesn\'t exist), then check if there are new patterns, decisions, conventions, or important context from our work. Also review memory/*.md files if they exist.'
  },
  {
    name: 'terminal-setup',
    description: 'Configure terminal settings',
    type: 'prompt',
    source: { kind: 'builtin' },
    content: 'Analyze my current terminal setup and suggest improvements for working with this project. Check shell configuration, useful aliases, and tool installations.'
  },
]

// ========== Claude Code Commands Scanner (.md files) ==========

function scanClaudeCommands(dir: string, source: CommandSource): SlashCommand[] {
  const commands: SlashCommand[] = []

  if (!fs.existsSync(dir)) return commands

  try {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      if (!file.endsWith('.md')) continue

      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) continue

      const name = file.replace(/\.md$/, '')
      const content = fs.readFileSync(filePath, 'utf-8')

      // Extract first line as description (if starts with #)
      const firstLine = content.split('\n')[0]
      const description = firstLine.startsWith('#')
        ? firstLine.replace(/^#+\s*/, '')
        : `Custom command: ${name}`

      commands.push({
        name,
        description,
        type: 'skill',
        source,
        content,
        filePath
      })
    }
  } catch {
    // Directory read failure, skip
  }

  return commands
}

// ========== SKILL.md Scanner (subdirectories) ==========

function scanSkillMdDirs(baseDir: string, source: CommandSource): SlashCommand[] {
  const skills: SlashCommand[] = []

  if (!fs.existsSync(baseDir)) return skills

  try {
    const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory() && !dir.isSymbolicLink()) continue

      const skillMdPath = path.join(baseDir, dir.name, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) continue

      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const frontmatter = parseFrontmatter(content)

      skills.push({
        name: frontmatter.name || dir.name,
        description: frontmatter.description || `Skill: ${dir.name}`,
        type: 'skill',
        source,
        content: content.replace(/^---[\s\S]*?---\n*/, ''), // Remove frontmatter
        filePath: skillMdPath
      })
    }
  } catch {
    // Directory read failure, skip
  }

  return skills
}

// ========== YAML Frontmatter Parser (simple) ==========

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const yaml = match[1]
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim()
    || yaml.match(/^description:\s*\|\n([\s\S]*?)(?=\n\w|\n---)/m)?.[1]?.trim()

  return { name, description }
}

// ========== Main Function ==========

export async function listSlashCommands(spaceId?: string): Promise<SlashCommand[]> {
  const homeDir = os.homedir()
  const allCommands: SlashCommand[] = [...BUILTIN_COMMANDS]
  const seenNames = new Set(BUILTIN_COMMANDS.map(c => c.name))

  // 1. Project-level Claude Code commands (highest priority)
  if (spaceId) {
    const space = getSpace(spaceId)
    if (space && !space.isTemp) {
      const projectDir = path.join(space.path, '.claude', 'commands')
      const projectCmds = scanClaudeCommands(projectDir, { kind: 'project', dir: projectDir })
      for (const cmd of projectCmds) {
        if (!seenNames.has(cmd.name)) {
          seenNames.add(cmd.name)
          allCommands.push(cmd)
        }
      }
    }
  }

  // 2. Global Claude Code commands
  const globalDir = path.join(homeDir, '.claude', 'commands')
  const globalCmds = scanClaudeCommands(globalDir, { kind: 'global' })
  for (const cmd of globalCmds) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name)
      allCommands.push(cmd)
    }
  }

  // 3. Managed Claude skills
  const skillsDir = getSkillsDir()
  const managedSkills = scanSkillMdDirs(skillsDir, { kind: 'skillsfan' })
  for (const cmd of managedSkills) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name)
      allCommands.push(cmd)
    }
  }

  // 4. Agents installed skills
  const agentsSkillsDir = path.join(homeDir, '.agents', 'skills')
  const agentsSkills = scanSkillMdDirs(agentsSkillsDir, { kind: 'agents-skills' })
  for (const cmd of agentsSkills) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name)
      allCommands.push(cmd)
    }
  }

  return allCommands
}
