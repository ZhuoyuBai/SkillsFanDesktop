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

  return [
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
    '### 多步骤任务处理（重要）',
    '',
    '**核心规则：每个步骤都是独立的 Skill 调用机会**',
    '',
    'When the user request involves multiple tasks or steps:',
    '',
    '1. **每个步骤独立判断**',
    '   - 完成一个步骤后，在开始下一步之前，重新检查可用 Skill 列表',
    '   - 如果下一步的任务匹配某个 Skill，必须调用该 Skill',
    '   - 不要复用上一个 Skill 的指令，每个 Skill 有独立的专业指令',
    '',
    '2. **步骤间数据传递（灵活判断）**',
    '   - 根据任务性质判断上一步结果是否对下一步有用',
    '   - 传递关键信息：如文件路径、生成的内容、评估报告等',
    '   - 不要机械地传递所有内容，也不要遗漏关键信息',
    '',
    '3. **示例**',
    '   User: "创建技能，评估它，然后优化它"',
    '   ',
    '   Step 1: 检查 Skill → skill-creator 匹配 → Skill("skill-creator")',
    '           输出：技能路径 /Desktop/my-skill/',
    '   ',
    '   Step 2: 检查 Skill → skill-evaluator 匹配 → Skill("skill-evaluator")',
    '           输入：上一步的技能路径',
    '           输出：评估报告',
    '   ',
    '   Step 3: 检查 Skill → skill-optimizer 匹配 → Skill("skill-optimizer")',
    '           输入：技能路径 + 评估报告',
    '',
    '**关键：把每个步骤当作独立的用户请求，都需要判断 Skill 匹配！**',
    '',
    // ========== 原有内容 ==========
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
    ...skills.flatMap(s => [
      '  <skill>',
      `    <name>${s.name}</name>`,
      `    <description>${s.description}</description>`,
      '  </skill>'
    ]),
    '</available_skills>'
  ].join('\n')
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
