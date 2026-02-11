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
    { name: z.string().describe(`技能名称${hint}`) },
    async (args) => {
      const skill = getSkill(args.name)

      if (!skill) {
        const available = (await getAllSkills()).map(s => s.name).join(', ')
        return {
          content: [{
            type: 'text' as const,
            text: `技能 "${args.name}" 不存在。可用技能: ${available || '无'}`
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
