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
import { getAllSkills, getSkill } from './skill-registry'
import { getSkillContent } from './skill-loader'

/**
 * 生成 Skill Tool 描述
 *
 * 核心逻辑：将所有技能的 name + description 嵌入 Tool description，
 * Claude 根据这个描述自动判断是否需要调用技能
 */
async function generateDescription(): Promise<string> {
  const skills = await getAllSkills()

  if (skills.length === 0) {
    return 'Load a skill for detailed task instructions. No skills are currently available.'
  }

  return [
    'Load a skill to get detailed instructions for a specific task.',
    'Skills provide specialized knowledge and step-by-step guidance.',
    'Use this when a task matches an available skill\'s description.',
    'Only the skills listed here are available:',
    '<available_skills>',
    ...skills.flatMap(s => [
      '  <skill>',
      `    <name>${s.name}</name>`,
      `    <description>${s.description}</description>`,
      '  </skill>'
    ]),
    '</available_skills>'
  ].join(' ')
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
