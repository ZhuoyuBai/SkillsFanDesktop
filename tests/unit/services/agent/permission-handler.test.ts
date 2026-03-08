import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  isAIBrowserTool: vi.fn(),
  sendToRenderer: vi.fn()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/main/services/ai-browser/tool-utils', () => ({
  isAIBrowserTool: mocks.isAIBrowserTool
}))

vi.mock('../../../../src/main/services/agent/session-manager', () => ({
  activeSessions: new Map()
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  sendToRenderer: mocks.sendToRenderer
}))

import { createCanUseTool } from '../../../../src/main/services/agent/permission-handler'

describe('permission-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      }
    })
    mocks.isAIBrowserTool.mockReturnValue(false)
  })

  it('returns updatedInput for default allow decisions', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('mcp__web-tools__WebFetch', {
      url: 'https://example.com',
      prompt: 'ignored'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'https://example.com',
        prompt: 'ignored'
      }
    })
  })

  it('sanitizes local MCP web search input before allowing the tool', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('mcp__web-tools__WebSearch', {
      query: '  GPT-5.4   最新资讯  ',
      allowed_domains: ['openai.com']
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'GPT-5.4 最新资讯'
      }
    })
  })
})
