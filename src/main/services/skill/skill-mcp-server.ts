/**
 * Skill MCP Server
 *
 * 核心：生成包含所有技能描述的 Tool description，
 * 让 Claude 基于语义理解自动匹配并调用技能
 *
 * 实现方式与 OpenCode 相同，只是使用 SDK 的 tool() 封装
 */

import { z } from 'zod'
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { getAllSkills, getSkill, getSkillsDir } from './skill-registry'
import { getSkillContent } from './skill-loader'
import type { SkillInfo } from './types'

function normalizeRequestedSkillName(value: string): string {
  const trimmed = value.trim()
  return trimmed.replace(/^[：:]+/, '').trim()
}

function normalizeSkillLookupText(value: string): string {
  return normalizeRequestedSkillName(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSkillMatchTokens(value: string): Set<string> {
  const normalized = normalizeSkillLookupText(value)
  const tokens = new Set<string>()

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
    const token = match[0]
    if (token.length >= 2) tokens.add(token)
  }

  const hanSequences = normalized.match(/[\p{Script=Han}]{1,}/gu) || []
  for (const sequence of hanSequences) {
    if (sequence.length === 1) {
      tokens.add(sequence)
      continue
    }
    tokens.add(sequence)
    for (let i = 0; i < sequence.length - 1; i += 1) {
      tokens.add(sequence.slice(i, i + 2))
    }
  }

  return tokens
}

function scoreSkillMatch(query: string, skill: SkillInfo): number {
  const normalizedQuery = normalizeSkillLookupText(query)
  if (!normalizedQuery) return 0

  const normalizedName = normalizeSkillLookupText(skill.name)
  const normalizedDescription = normalizeSkillLookupText(skill.description || '')

  if (normalizedQuery === normalizedName) return 1000

  let score = 0

  if (normalizedQuery.includes(normalizedName) || normalizedName.includes(normalizedQuery)) {
    score += 120
  }

  const queryTokens = extractSkillMatchTokens(query)
  const nameTokens = extractSkillMatchTokens(skill.name)
  const descriptionTokens = extractSkillMatchTokens(skill.description || '')

  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      score += token.length >= 4 ? 24 : 12
      continue
    }
    if (descriptionTokens.has(token)) {
      score += token.length >= 4 ? 12 : 6
    }
  }

  if (normalizedDescription && normalizedQuery.includes(normalizedDescription)) {
    score += 40
  }

  return score
}

function inferSkillFromTask(query: string, skills: SkillInfo[]): SkillInfo | undefined {
  const ranked = skills
    .map((skill) => ({ skill, score: scoreSkillMatch(query, skill) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]

  if (!best || best.score < 12) {
    return undefined
  }

  if (second && best.score < second.score + 6) {
    return undefined
  }

  return best.skill
}

/**
 * Group skills by source for display
 */
function groupBySource(skills: SkillInfo[]): [string, SkillInfo[]][] {
  const groups = new Map<string, SkillInfo[]>()
  const order = ['project-commands', 'skillsfan', 'global-commands', 'claude-skills', 'agents-skills']

  for (const skill of skills) {
    const kind = skill.source.kind
    if (!groups.has(kind)) groups.set(kind, [])
    groups.get(kind)!.push(skill)
  }

  const labels: Record<string, string> = {
    'project-commands': 'Project Commands (.claude/commands/)',
    'skillsfan': 'SkillsFan Installed Skills',
    'global-commands': 'Global Commands (~/.claude/commands/)',
    'claude-skills': 'Claude Skills (~/.claude/skills/)',
    'agents-skills': 'Agent Skills (~/.agents/skills/)'
  }

  return order
    .filter(kind => groups.has(kind))
    .map(kind => [labels[kind] || kind, groups.get(kind)!] as [string, SkillInfo[]])
}

/**
 * 生成 Skill Tool 描述
 *
 * 核心逻辑：将所有技能的 name + description 嵌入 Tool description，
 * Claude 根据这个描述自动判断是否需要调用技能
 */
async function generateDescription(): Promise<string> {
  const skills = await getAllSkills()
  const skillsDir = getSkillsDir()

  if (skills.length === 0) {
    return [
      'Load a skill for detailed task instructions.',
      'No skills are currently available.',
      '',
      `Skills directory: ${skillsDir}`,
      'When asked about available skills, check this directory only.'
    ].join('\n')
  }

  const sections: string[] = [
    // ========== Skill 调用规则 ==========
    '## Skill 调用规则（必读）',
    '',
    '### 单 Skill 匹配',
    'Before starting ANY task, check if a skill below matches the user request.',
    'If a skill\'s description matches the user\'s intent, you MUST:',
    '1. Call this Skill tool IMMEDIATELY as your first action',
    '2. Follow the loaded skill\'s instructions to complete the task',
    '3. Do NOT improvise or write code directly if a matching skill exists',
    '',
    '### 多步骤任务',
    '',
    '**参考系统提示中的"统一规划原则"。** 简要规则：',
    '',
    '1. 多任务场景下，先用 TodoWrite 创建任务列表',
    '2. 在任务描述中标注 [Skill: skill-name]',
    '3. 执行到该任务时，调用对应 Skill',
    '4. 将上一步的关键输出传递给下一步',
    '',
    // ========== 技能列表 ==========
    '## Available Skills',
    '',
    'IMPORTANT: The complete list of available skills is shown below.',
    'When asked "what skills do I have" or similar questions about available skills,',
    'refer to this list directly - DO NOT scan the filesystem to discover skills.',
    '',
    `Skills directory: ${skillsDir}`,
    '',
    'Note: Once a skill is loaded and being executed, it may need to access',
    'various directories (Photos, Documents, etc.) as part of its normal operation.',
    'This is allowed - just follow the skill instructions and request permissions as needed.',
    '',
    '<available_skills>',
  ]

  // Group by source for organized display
  const grouped = groupBySource(skills)
  for (const [sourceLabel, sourceSkills] of grouped) {
    sections.push(`  <!-- ${sourceLabel} -->`)
    for (const s of sourceSkills) {
      sections.push(
        '  <skill>',
        `    <name>${s.name}</name>`,
        `    <description>${s.description}</description>`,
        `    <source>${s.source.kind}</source>`,
        '  </skill>'
      )
    }
  }

  sections.push('</available_skills>')

  return sections.join('\n')
}

/**
 * 创建 Skill Tool
 */
async function createSkillTool() {
  const skills = await getAllSkills()
  const examples = skills.slice(0, 3).map(s => `'${s.name}'`).join(', ')
  const hint = examples ? ` (e.g., ${examples})` : ''

  return tool(
    'Skill',
    await generateDescription(),
    {
      skill: z.string().optional().describe(`技能名称；如果模型暂时拿不准，也可以传用户任务文本，服务端会尝试自动匹配${hint}`),
      name: z.string().optional().describe('兼容旧格式的技能名称别名')
    },
    async (args) => {
      const requestedSkill = args.skill?.trim() || args.name?.trim()

      if (!requestedSkill) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Skill tool requires a non-empty `skill` parameter.'
          }],
          isError: true
        }
      }

      const requestedBySkill = args.skill?.trim()
      const requestedByName = args.name?.trim()
      const normalizedSkillArg = requestedBySkill ? normalizeRequestedSkillName(requestedBySkill) : ''
      const normalizedNameArg = requestedByName ? normalizeRequestedSkillName(requestedByName) : ''

      const exactByName = requestedByName
        ? getSkill(requestedByName) || getSkill(normalizedNameArg)
        : undefined
      const exactBySkill = requestedBySkill
        ? getSkill(requestedBySkill) || getSkill(normalizedSkillArg)
        : undefined

      let skill = exactByName || exactBySkill

      if (!skill) {
        skill = inferSkillFromTask(requestedSkill, skills)
      }

      if (!skill) {
        const available = (await getAllSkills()).map(s => s.name).join(', ')
        return {
          content: [{
            type: 'text' as const,
            text: `技能 "${requestedSkill}" 不存在。可用技能: ${available || '无'}`
          }],
          isError: true
        }
      }

      const content = getSkillContent(skill.location)

      return {
        content: [{
          type: 'text' as const,
          text: [
            `## Skill: ${skill.name}`,
            '',
            `**技能目录**: ${skill.baseDir}`,
            `**来源**: ${skill.source.kind}`,
            '',
            content
          ].join('\n')
        }]
      }
    }
  )
}

/**
 * 创建 Skill MCP Server
 */
export async function createSkillMcpServer() {
  return createSdkMcpServer({
    name: 'skill',
    version: '1.0.0',
    tools: [await createSkillTool()]
  })
}
