import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  isAIBrowserTool: vi.fn(),
  sendToRenderer: vi.fn(),
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async () => ({
    accepted: true,
    conversationId: 'conv-1'
  }))
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

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

import {
  createCanUseTool,
  handleToolApproval,
  handleUserQuestionAnswer
} from '../../../../src/main/services/agent/permission-handler'
import { activeSessions } from '../../../../src/main/services/agent/session-manager'
import {
  requestNativeToolApproval,
  requestNativeUserQuestion,
  resetNativeRuntimeInteractionForTests
} from '../../../../src/gateway/runtime/native/interaction'

describe('permission-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeSessions.clear()
    resetNativeRuntimeInteractionForTests()
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      }
    })
    mocks.isAIBrowserTool.mockReturnValue(false)
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
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

  it('delegates tool approval to the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    handleToolApproval('conv-1', true)

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.tool-approval', {
      conversationId: 'conv-1',
      approved: true
    })
  })

  it('delegates user question answers to the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    handleUserQuestionAnswer('conv-1', {
      answer: 'continue'
    })

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.question-answer', {
      conversationId: 'conv-1',
      answers: {
        answer: 'continue'
      }
    })
  })

  it('resolves native runtime tool approvals when no claude-sdk session is pending', async () => {
    const pendingApproval = requestNativeToolApproval({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      toolName: 'mcp__local-tools__terminal_run_command',
      input: {
        command: 'pnpm test'
      },
      description: 'Run terminal command: pnpm test'
    })

    handleToolApproval('conv-1', true)

    await expect(pendingApproval).resolves.toBe(true)
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-approval-resolved',
      'space-1',
      'conv-1',
      expect.objectContaining({
        toolName: 'mcp__local-tools__terminal_run_command',
        approved: true
      })
    )
  })

  it('resolves native runtime user questions when no claude-sdk session is pending', async () => {
    const pendingQuestion = requestNativeUserQuestion({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      questions: [
        {
          header: 'Confirm',
          question: 'Continue?',
          options: [
            {
              label: 'Yes',
              description: 'Proceed'
            }
          ],
          multiSelect: false
        }
      ]
    })

    handleUserQuestionAnswer('conv-1', {
      answer: 'yes'
    })

    await expect(pendingQuestion).resolves.toEqual({
      answer: 'yes'
    })
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:user-question-answered',
      'space-1',
      'conv-1',
      {}
    )
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

  it('requests approval before opening a macOS application', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__open_application', {
      application: 'Google Chrome',
      target: 'https://creator.xiaohongshu.com/login'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__open_application',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open macOS application: Google Chrome'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'Google Chrome',
        target: 'https://creator.xiaohongshu.com/login'
      }
    })
  })

  it('requests approval before executing AppleScript', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__run_applescript', {
      script: 'tell application "Google Chrome" to activate'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__run_applescript',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Execute AppleScript for macOS UI automation'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        script: 'tell application "Google Chrome" to activate'
      }
    })
  })

  it('requests approval before running a terminal adapter command', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_run_command', {
      application: 'Terminal',
      command: 'pnpm test'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command: pnpm test'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'Terminal',
        command: 'pnpm test'
      }
    })
  })

  it('requests approval before focusing a chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_focus_tab', {
      title: 'Dashboard'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_focus_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Focus Chrome tab: Dashboard'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        title: 'Dashboard'
      }
    })
  })

  it('requests approval before opening a chrome URL', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_open_url', {
      url: 'https://example.com/docs'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_open_url',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open Chrome URL: https://example.com/docs'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'https://example.com/docs'
      }
    })
  })

  it('requests approval before opening a finder folder', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__finder_open_folder', {
      target: '/tmp'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__finder_open_folder',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open Finder folder: /tmp'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        target: '/tmp'
      }
    })
  })

  it('requests approval before running a finder search', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__finder_search', {
      query: 'invoice'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__finder_search',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Search in Finder: invoice'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'invoice'
      }
    })
  })

  it('requests approval before revealing a finder path', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__finder_reveal_path', {
      target: '/tmp/file.txt'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__finder_reveal_path',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Reveal in Finder: /tmp/file.txt'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        target: '/tmp/file.txt'
      }
    })
  })

  it('requests approval before opening the finder home folder', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__finder_open_home_folder', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__finder_open_home_folder',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open Finder home folder'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before opening a new finder window', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__finder_new_window', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__finder_new_window',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open new Finder window'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before running a terminal command in a new tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_new_tab_run_command', {
      command: 'pnpm lint'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_new_tab_run_command',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command in new tab: pnpm lint'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pnpm lint'
      }
    })
  })

  it('requests approval before running a terminal command in a new window', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_new_window_run_command', {
      command: 'pnpm typecheck'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_new_window_run_command',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command in new window: pnpm typecheck'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pnpm typecheck'
      }
    })
  })

  it('requests approval before running a terminal command in a directory', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_run_command_in_directory', {
      command: 'pnpm test',
      directory: '/tmp/project'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command_in_directory',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command in directory: /tmp/project → pnpm test'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pnpm test',
        directory: '/tmp/project'
      }
    })
  })

  it('requests approval before listing terminal sessions', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_list_sessions', {
      application: 'iTerm2'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_list_sessions',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'List terminal sessions'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2'
      }
    })
  })

  it('requests approval before focusing a terminal session', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_focus_session', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_focus_session',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Focus terminal target: window 2, tab 3, pane 2'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })
  })

  it('requests approval before listing terminal panes', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_list_panes', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_list_panes',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'List terminal panes: window 2, tab 3'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3
      }
    })
  })

  it('requests approval before reading terminal pane layout', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_get_pane_layout', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_get_pane_layout',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Read terminal pane layout: window 2, tab 3'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3
      }
    })
  })

  it('requests approval before interrupting a terminal process', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_interrupt_process', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_interrupt_process',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Interrupt terminal process'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before interrupting a targeted iTerm pane', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_interrupt_process', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_interrupt_process',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Interrupt terminal process: window 2, tab 3, pane 2'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })
  })

  it('requests approval before reading terminal session state', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_get_session_state', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_get_session_state',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Read terminal session state: window 2, tab 3, pane 2'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })
  })

  it('requests approval before reading terminal last command result', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_get_last_command_result', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_get_last_command_result',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Read terminal last command result: window 2, tab 3, pane 2'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })
  })

  it('requests approval before reading terminal output', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_read_output', {
      application: 'iTerm2'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_read_output',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Read terminal output'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2'
      }
    })
  })

  it('requests approval before waiting for terminal output', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_wait_for_output', {
      expectedText: 'ready'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_wait_for_output',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Wait for terminal output: ready'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        expectedText: 'ready'
      }
    })
  })

  it('requests approval before waiting for terminal session idle state', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_wait_until_not_busy', {
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_wait_until_not_busy',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Wait for terminal session to become idle: window 2, tab 3, pane 2'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })
  })

  it('requests approval before waiting for terminal idle state', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_wait_until_idle', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_wait_until_idle',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Wait for terminal idle state'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before running a terminal command and waiting for completion', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_run_command_and_wait', {
      command: 'pnpm test'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command_and_wait',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command and wait: pnpm test'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pnpm test'
      }
    })
  })

  it('requests approval before splitting a terminal pane and running a command', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_split_pane_run_command', {
      application: 'iTerm2',
      command: 'pnpm dev',
      direction: 'horizontal'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_split_pane_run_command',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Split terminal pane (horizontal) and run: pnpm dev'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'iTerm2',
        command: 'pnpm dev',
        direction: 'horizontal'
      }
    })
  })

  it('requests approval before running a terminal command in a directory and waiting for completion', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__terminal_run_command_in_directory_and_wait', {
      command: 'pnpm lint',
      directory: '/tmp/project'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command_in_directory_and_wait',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command in directory and wait: /tmp/project → pnpm lint'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pnpm lint',
        directory: '/tmp/project'
      }
    })
  })

  it('requests approval before opening a new chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_new_tab', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_new_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open new Chrome tab'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before opening a chrome URL in a new tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_open_url_in_new_tab', {
      url: 'https://example.com/docs'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_open_url_in_new_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open Chrome URL in new tab: https://example.com/docs'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'https://example.com/docs'
      }
    })
  })

  it('requests approval before reloading the active chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_reload_active_tab', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_reload_active_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Reload active Chrome tab'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before focusing a chrome tab by URL', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_focus_tab_by_url', {
      url: 'example.com/dashboard'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_focus_tab_by_url',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Focus Chrome tab by URL: example.com/dashboard'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'example.com/dashboard'
      }
    })
  })

  it('requests approval before listing chrome tabs', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_list_tabs', {
      application: 'Google Chrome'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_list_tabs',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'List Chrome tabs'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'Google Chrome'
      }
    })
  })

  it('requests approval before finding chrome tabs', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_find_tabs', {
      query: 'docs'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_find_tabs',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Find Chrome tabs: docs'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'docs'
      }
    })
  })

  it('requests approval before closing matching chrome tabs', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_close_tabs', {
      query: 'docs'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_close_tabs',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Close Chrome tabs: docs'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'docs'
      }
    })
  })

  it('requests approval before reading the active chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_get_active_tab', {
      application: 'Chromium'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_get_active_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Read active Chrome tab'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'Chromium'
      }
    })
  })

  it('requests approval before waiting for a chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_wait_for_tab', {
      query: 'openai.com',
      field: 'domain'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_wait_for_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Wait for Chrome tab: openai.com'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'openai.com',
        field: 'domain'
      }
    })
  })

  it('requests approval before waiting for the active chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_wait_for_active_tab', {
      query: 'dashboard',
      field: 'title'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_wait_for_active_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Wait for active Chrome tab: dashboard'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        query: 'dashboard',
        field: 'title'
      }
    })
  })

  it('requests approval before closing the active chrome tab', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__chrome_close_active_tab', {
      application: 'Google Chrome'
    }, { signal: new AbortController().signal })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__chrome_close_active_tab',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Close active Chrome tab'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        application: 'Google Chrome'
      }
    })
  })

  it('requests approval before opening skillsfan settings', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__skillsfan_open_settings', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__skillsfan_open_settings',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Open SkillsFan settings'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('requests approval before focusing skillsfan main window', async () => {
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
    const pendingDecision = canUseTool('mcp__local-tools__skillsfan_focus_main_window', {}, {
      signal: new AbortController().signal
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__skillsfan_focus_main_window',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Focus SkillsFan main window'
      })
    )

    handleToolApproval('conv-1', true)

    await expect(pendingDecision).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {}
    })
  })

  it('denies delegating web research to a Task sub-agent', async () => {
    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')

    const result = await canUseTool('Task', {
      description: '搜索飞机乘客数据',
      prompt: '联网搜索并汇总可用于中文社交帖子中的可靠数据，并附来源链接'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Web research must run in the primary agent. Use mcp__web-tools__WebSearch/WebFetch directly instead of delegating it to a Task sub-agent.'
    })
  })

  it('denies AI Browser tools when system browser mode is enabled', async () => {
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      },
      browserAutomation: {
        mode: 'system-browser'
      }
    })
    mocks.isAIBrowserTool.mockReturnValue(true)

    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')
    const result = await canUseTool('mcp__ai-browser__browser_new_page', {
      url: 'https://example.com'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Automated browser is disabled while "Use System Default Browser" mode is enabled. Use local system browser tools instead.'
    })
  })

  it('allows AI Browser tools when system browser mode is not enabled', async () => {
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      },
      browserAutomation: {
        mode: 'ai-browser'
      }
    })
    mocks.isAIBrowserTool.mockReturnValue(true)

    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')
    const result = await canUseTool('mcp__ai-browser__browser_new_page', {
      url: 'https://example.com'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'https://example.com'
      }
    })
  })

  it('denies open_url when AI Browser mode is active', async () => {
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      },
      browserAutomation: {
        mode: 'ai-browser'
      }
    })

    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')
    const result = await canUseTool('mcp__local-tools__open_url', {
      url: 'https://example.com'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'deny',
      message: 'System browser opening is disabled while automated browser mode is active. Use automated browser tools instead.'
    })
  })

  it('allows open_url when system browser mode is enabled', async () => {
    mocks.getConfig.mockReturnValue({
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      },
      browserAutomation: {
        mode: 'system-browser'
      }
    })

    const canUseTool = createCanUseTool('/tmp/workspace', 'space-1', 'conv-1')
    const result = await canUseTool('mcp__local-tools__open_url', {
      url: 'https://example.com'
    }, { signal: new AbortController().signal })

    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        url: 'https://example.com'
      }
    })
  })
})
