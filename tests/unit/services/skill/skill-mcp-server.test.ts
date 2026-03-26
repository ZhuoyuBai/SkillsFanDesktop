import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllSkills: vi.fn(),
  getSkill: vi.fn(),
  getSkillsDir: vi.fn(),
  getSkillContent: vi.fn(),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn()
}))

vi.mock('../../../../src/main/services/skill/skill-registry', () => ({
  getAllSkills: mocks.getAllSkills,
  getSkill: mocks.getSkill,
  getSkillsDir: mocks.getSkillsDir
}))

vi.mock('../../../../src/main/services/skill/skill-loader', () => ({
  getSkillContent: mocks.getSkillContent
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  tool: mocks.tool,
  createSdkMcpServer: mocks.createSdkMcpServer
}))

import { createSkillMcpServer } from '../../../../src/main/services/skill/skill-mcp-server'

describe('skill-mcp-server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAllSkills.mockResolvedValue([
      {
        name: 'web-access',
        description: '所有联网操作必须通过此 skill 处理，包括搜索、网页抓取、新闻查询、天气查询等。',
        source: { kind: 'skillsfan' },
        location: '/tmp/skills/web-access/SKILL.md',
        baseDir: '/tmp/skills/web-access'
      }
    ])
    mocks.getSkillsDir.mockReturnValue('/tmp/skills')
    mocks.getSkill.mockImplementation((name: string) => {
      if (name === 'web-access') {
        return {
          name: 'web-access',
          description: '所有联网操作必须通过此 skill 处理，包括搜索、网页抓取、新闻查询、天气查询等。',
          source: { kind: 'skillsfan' },
          location: '/tmp/skills/web-access/SKILL.md',
          baseDir: '/tmp/skills/web-access'
        }
      }
      return undefined
    })
    mocks.getSkillContent.mockReturnValue('Use web tools carefully.')
    mocks.tool.mockImplementation((name, description, schema, handler) => ({
      name,
      description,
      schema,
      handler
    }))
    mocks.createSdkMcpServer.mockImplementation((config) => config)
  })

  it('normalizes a leading colon in the requested skill name', async () => {
    const server = await createSkillMcpServer()
    const skillTool = server.tools[0]

    const result = await skillTool.handler({ skill: ':web-access' })

    expect(mocks.getSkill).toHaveBeenCalledWith(':web-access')
    expect(mocks.getSkill).toHaveBeenCalledWith('web-access')
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: expect.stringContaining('## Skill: web-access')
      }]
    })
  })

  it('normalizes a leading full-width colon in the requested skill name alias', async () => {
    const server = await createSkillMcpServer()
    const skillTool = server.tools[0]

    const result = await skillTool.handler({ name: '：web-access' })

    expect(mocks.getSkill).toHaveBeenCalledWith('：web-access')
    expect(mocks.getSkill).toHaveBeenCalledWith('web-access')
    expect(result.content[0].text).toContain('Use web tools carefully.')
  })

  it('prefers a valid name field when the skill field contains the user task', async () => {
    const server = await createSkillMcpServer()
    const skillTool = server.tools[0]

    const result = await skillTool.handler({
      name: 'web-access',
      skill: '搜索国产模型 minimax2.7 的新闻'
    })

    expect(result.content[0].text).toContain('## Skill: web-access')
  })

  it('can infer the intended skill from task text when no valid skill name is provided', async () => {
    const server = await createSkillMcpServer()
    const skillTool = server.tools[0]

    const result = await skillTool.handler({
      skill: '帮我搜索关于国产模型 minimax2.7 的新闻和最新信息'
    })

    expect(result.content[0].text).toContain('## Skill: web-access')
  })
})
