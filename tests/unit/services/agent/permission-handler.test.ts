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

import { createCanUseTool, handleToolApproval } from '../../../../src/main/services/agent/permission-handler'
import { activeSessions } from '../../../../src/main/services/agent/session-manager'

describe('permission-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeSessions.clear()
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

  it('denies sdk server-side web tools so only local MCP replacements can run', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('WebSearch', {
      query: 'GPT-5.4 最新资讯'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Built-in server-side tool "WebSearch" is disabled. Use local MCP tools instead.'
    })
  })

  it('denies other anthropic server-side tools defensively', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('code_execution', {
      code: 'print("hello")'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Built-in server-side tool "code_execution" is disabled. Use local MCP tools instead.'
    })
  })

  it('allows local memory tool with updated input', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('mcp__local-tools__memory', {
      command: 'search',
      query: 'decision log'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'search',
        query: 'decision log'
      }
    })
  })

  it('allows local text editor tool inside the workspace', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('mcp__local-tools__text_editor_code_execution', {
      command: 'view',
      path: 'src/index.ts'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'view',
        path: 'src/index.ts'
      }
    })
  })

  it('denies local text editor tool outside the workspace', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('mcp__local-tools__text_editor_code_execution', {
      command: 'view',
      path: '/etc/passwd'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Can only access files within the current space: /tmp/workspace'
    })
  })

  it('requests approval for local code execution when command execution is ask-only', async () => {
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'ask',
        trustMode: false
      }
    })

    activeSessions.set('conv-1', {
      abortController: new AbortController(),
      spaceId: 'space-1',
      conversationId: 'conv-1',
      pendingPermissionResolve: null,
      pendingPermissionToolCall: null,
      thoughts: [],
      pendingUserQuestion: null,
      currentStreamingContent: ''
    })

    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')
    const pendingDecision = canUseTool('mcp__local-tools__code_execution', {
      code: 'console.log("hello")',
      language: 'javascript'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__code_execution',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Execute javascript snippet'
      })
    )
    expect(activeSessions.get('conv-1')?.pendingPermissionResolve).toBeTypeOf('function')
    expect(activeSessions.get('conv-1')?.pendingPermissionToolCall).toEqual(
      expect.objectContaining({
        name: 'mcp__local-tools__code_execution',
        status: 'waiting_approval'
      })
    )

    handleToolApproval('conv-1', true)

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-approval-resolved',
      'space-1',
      'conv-1',
      expect.objectContaining({
        toolName: 'mcp__local-tools__code_execution',
        approved: true
      })
    )

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        code: 'console.log("hello")',
        language: 'javascript'
      }
    })
    expect(activeSessions.get('conv-1')?.pendingPermissionResolve).toBeNull()
    expect(activeSessions.get('conv-1')?.pendingPermissionToolCall).toBeNull()
  })
})
