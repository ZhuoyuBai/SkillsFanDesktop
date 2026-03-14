import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureOpenAICompatRouter: vi.fn(),
  encodeBackendConfig: vi.fn(),
  createBrowserMcpServer: vi.fn(),
  createLocalToolsMcpServer: vi.fn(),
  createWebToolsMcpServer: vi.fn(),
  createSkillMcpServer: vi.fn(),
  createCanUseTool: vi.fn(),
  buildSystemPromptAppend: vi.fn(),
  getEnabledMcpServers: vi.fn(),
  inferOpenAIWireApi: vi.fn()
}))

vi.mock('../../../../src/main/openai-compat-router', () => ({
  ensureOpenAICompatRouter: mocks.ensureOpenAICompatRouter,
  encodeBackendConfig: mocks.encodeBackendConfig
}))

vi.mock('../../../../src/main/services/ai-browser/prompt', () => ({
  AI_BROWSER_SYSTEM_PROMPT: '[AI_BROWSER_PROMPT]'
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    browser: {
      createMcpServer: mocks.createBrowserMcpServer
    }
  }
}))

vi.mock('../../../../src/main/services/local-tools/sdk-mcp-server', () => ({
  createLocalToolsMcpServer: mocks.createLocalToolsMcpServer
}))

vi.mock('../../../../src/main/services/web-tools/sdk-mcp-server', () => ({
  createWebToolsMcpServer: mocks.createWebToolsMcpServer
}))

vi.mock('../../../../src/main/services/skill', () => ({
  createSkillMcpServer: mocks.createSkillMcpServer
}))

vi.mock('../../../../src/main/services/agent/permission-handler', () => ({
  createCanUseTool: mocks.createCanUseTool
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  buildSystemPromptAppend: mocks.buildSystemPromptAppend,
  getEnabledMcpServers: mocks.getEnabledMcpServers,
  inferOpenAIWireApi: mocks.inferOpenAIWireApi
}))

import { buildSdkOptions, resolveSdkTransport } from '../../../../src/main/services/agent/sdk-options'

describe('sdk-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureOpenAICompatRouter.mockResolvedValue({ baseUrl: 'http://router.local' })
    mocks.encodeBackendConfig.mockReturnValue('encoded-backend-config')
    mocks.createBrowserMcpServer.mockReturnValue({ type: 'stdio', command: 'ai-browser' })
    mocks.createLocalToolsMcpServer.mockReturnValue({ type: 'stdio', command: 'local-tools' })
    mocks.createWebToolsMcpServer.mockReturnValue({ type: 'stdio', command: 'web-tools' })
    mocks.createSkillMcpServer.mockResolvedValue({ type: 'stdio', command: 'skill' })
    mocks.createCanUseTool.mockReturnValue(vi.fn())
    mocks.buildSystemPromptAppend.mockReturnValue('[BASE_PROMPT]')
    mocks.getEnabledMcpServers.mockReturnValue({})
    mocks.inferOpenAIWireApi.mockReturnValue('responses')
  })

  describe('resolveSdkTransport', () => {
    it('returns raw anthropic transport only for native anthropic server tools', async () => {
      const result = await resolveSdkTransport({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'anthropic-key',
        model: 'claude-3-7-sonnet',
        nativeAnthropicServerTools: true
      })

      expect(result).toEqual({
        anthropicBaseUrl: 'https://api.anthropic.com',
        anthropicApiKey: 'anthropic-key',
        sdkModel: 'claude-3-7-sonnet',
        routed: false
      })
      expect(mocks.ensureOpenAICompatRouter).not.toHaveBeenCalled()
      expect(mocks.encodeBackendConfig).not.toHaveBeenCalled()
    })

    it('keeps anthropic-compatible providers on direct anthropic transport', async () => {
      const result = await resolveSdkTransport({
        provider: 'anthropic',
        baseUrl: 'https://api.minimaxi.com/anthropic',
        apiKey: 'minimax-key',
        model: 'MiniMax-M2.1',
        nativeAnthropicServerTools: false
      })

      expect(result).toEqual({
        anthropicBaseUrl: 'https://api.minimaxi.com/anthropic',
        anthropicApiKey: 'minimax-key',
        sdkModel: 'MiniMax-M2.1',
        routed: false
      })
      expect(mocks.ensureOpenAICompatRouter).not.toHaveBeenCalled()
      expect(mocks.encodeBackendConfig).not.toHaveBeenCalled()
    })

    it('routes oauth providers through openai-compat with chat_completions api type', async () => {
      const result = await resolveSdkTransport({
        provider: 'oauth',
        baseUrl: 'https://oauth.provider/v1',
        apiKey: 'oauth-token',
        model: 'gpt-4.1',
        customHeaders: { 'x-auth': 'token' }
      })

      expect(mocks.ensureOpenAICompatRouter).toHaveBeenCalledTimes(1)
      expect(mocks.encodeBackendConfig).toHaveBeenCalledWith({
        url: 'https://oauth.provider/v1',
        key: 'oauth-token',
        model: 'gpt-4.1',
        headers: { 'x-auth': 'token' },
        apiType: 'chat_completions'
      })
      expect(mocks.inferOpenAIWireApi).not.toHaveBeenCalled()
      expect(result).toEqual({
        anthropicBaseUrl: 'http://router.local',
        anthropicApiKey: 'encoded-backend-config',
        sdkModel: 'claude-sonnet-4-20250514',
        routed: true,
        apiType: 'chat_completions'
      })
    })

    it('infers api type for openai-compatible non-oauth providers', async () => {
      const result = await resolveSdkTransport({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'openai-key',
        model: 'gpt-4.1-mini'
      })

      expect(mocks.inferOpenAIWireApi).toHaveBeenCalledWith('https://api.openai.com/v1')
      expect(mocks.encodeBackendConfig).toHaveBeenCalledWith({
        url: 'https://api.openai.com/v1',
        key: 'openai-key',
        model: 'gpt-4.1-mini',
        headers: undefined,
        apiType: 'responses'
      })
      expect(result.apiType).toBe('responses')
      expect(result.routed).toBe(true)
    })
  })

  describe('buildSdkOptions', () => {
    it('builds base sdk options without optional MCP or thinking', async () => {
      const abortController = new AbortController()
      const onStderr = vi.fn()

      const { sdkOptions, addedMcpServers } = await buildSdkOptions({
        conversationId: 'conv-1',
        spaceId: 'space-1',
        workDir: '/tmp/space-1',
        config: { mcpServers: {}, memory: { enabled: true } },
        abortController,
        sdkModel: 'claude-sonnet-4-20250514',
        credentialsModel: 'glm-5',
        anthropicBaseUrl: 'http://router.local',
        anthropicApiKey: 'encoded-key',
        electronPath: '/Applications/Electron.app/Contents/MacOS/Electron',
        onStderr
      })

      expect(addedMcpServers).toEqual(['local-tools', 'web-tools'])
      expect(sdkOptions.model).toBe('claude-sonnet-4-20250514')
      expect(sdkOptions.cwd).toBe('/tmp/space-1')
      expect(sdkOptions.abortController).toBe(abortController)
      expect(sdkOptions.maxThinkingTokens).toBeUndefined()
      expect(sdkOptions.mcpServers).toEqual({
        'local-tools': { type: 'stdio', command: 'local-tools' },
        'web-tools': { type: 'stdio', command: 'web-tools' }
      })
      expect(sdkOptions.extraArgs).toBeUndefined()
      expect(sdkOptions.env.ANTHROPIC_API_KEY).toBe('encoded-key')
      expect(sdkOptions.env.ANTHROPIC_BASE_URL).toBe('http://router.local')
      expect(sdkOptions.systemPrompt.append).toContain('[BASE_PROMPT]')
      expect(sdkOptions.systemPrompt.append).toContain('Do not delegate that work to a `Task` sub-agent.')
      expect(sdkOptions.allowedTools).toEqual([
        'Read', 'Write', 'Edit', 'Grep', 'Glob',
        'Bash',
        'TodoWrite', 'TaskOutput',
        'NotebookEdit',
        'Task',
        'AskUserQuestion',
        'TeamCreate', 'TeamDelete', 'SendMessage',
        'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
        'EnterPlanMode', 'EnterWorktree',
      ])
      expect(sdkOptions.tools).toEqual(sdkOptions.allowedTools)
      expect(sdkOptions.strictMcpConfig).toBe(true)
      expect(sdkOptions.disallowedTools).toEqual([
        'WebSearch',
        'WebFetch',
        'web_search',
        'web_fetch',
        'code_execution',
        'bash_code_execution',
        'text_editor_code_execution',
        'tool_search_tool_regex',
        'tool_search_tool_bm25',
        'memory'
      ])
      expect(mocks.createLocalToolsMcpServer).toHaveBeenCalledWith({
        workDir: '/tmp/space-1',
        spaceId: 'space-1',
        conversationId: 'conv-1',
        aiBrowserEnabled: false,
        includeSkillMcp: false,
        includeSubagentTools: true
      })
      expect(mocks.createCanUseTool).toHaveBeenCalledWith('/tmp/space-1', 'space-1', 'conv-1')
      expect(mocks.buildSystemPromptAppend).toHaveBeenCalledWith('/tmp/space-1', 'glm-5', true)

      sdkOptions.stderr('stderr message')
      expect(onStderr).toHaveBeenCalledWith('stderr message')
    })

    it('adds ai-browser + skill MCP and thinking tokens when enabled', async () => {
      mocks.getEnabledMcpServers.mockReturnValue({
        github: { type: 'stdio', command: 'github-mcp' }
      })
      const abortController = new AbortController()

      const { sdkOptions, addedMcpServers } = await buildSdkOptions({
        conversationId: 'conv-2',
        spaceId: 'space-2',
        workDir: '/tmp/space-2',
        config: { mcpServers: { github: { command: 'github-mcp' } }, memory: { enabled: false } },
        abortController,
        sdkModel: 'claude-sonnet-4-20250514',
        credentialsModel: 'gpt-4.1',
        anthropicBaseUrl: 'http://router.local',
        anthropicApiKey: 'encoded-key',
        electronPath: '/Applications/Electron.app/Contents/MacOS/Electron',
        onStderr: vi.fn(),
        aiBrowserEnabled: true,
        thinkingEnabled: true,
        includeSkillMcp: true,
        ralphSystemPromptAppend: '[RALPH_APPEND]'
      })

      expect(addedMcpServers).toEqual(['local-tools', 'web-tools', 'ai-browser', 'skill'])
      expect(mocks.createBrowserMcpServer).toHaveBeenCalledTimes(1)
      expect(mocks.createBrowserMcpServer).toHaveBeenCalledWith('automated', {
        spaceId: 'space-2',
        conversationId: 'conv-2'
      })
      expect(mocks.createLocalToolsMcpServer).toHaveBeenCalledTimes(1)
      expect(mocks.createWebToolsMcpServer).toHaveBeenCalledTimes(1)
      expect(mocks.createSkillMcpServer).toHaveBeenCalledTimes(1)
      expect(sdkOptions.thinking).toEqual({ type: 'enabled', budgetTokens: 10240 })
      expect(sdkOptions.systemPrompt.append).toContain('[BASE_PROMPT]')
      expect(sdkOptions.systemPrompt.append).toContain('[AI_BROWSER_PROMPT]')
      expect(sdkOptions.systemPrompt.append).toContain('prefer the automated browser tools')
      expect(sdkOptions.systemPrompt.append).toContain('[RALPH_APPEND]')
      expect(sdkOptions.tools).toEqual(sdkOptions.allowedTools)
      expect(sdkOptions.disallowedTools).toEqual([
        'WebSearch',
        'WebFetch',
        'web_search',
        'web_fetch',
        'code_execution',
        'bash_code_execution',
        'text_editor_code_execution',
        'tool_search_tool_regex',
        'tool_search_tool_bm25',
        'memory'
      ])
      expect(sdkOptions.mcpServers).toEqual({
        github: { type: 'stdio', command: 'github-mcp' },
        'local-tools': { type: 'stdio', command: 'local-tools' },
        'web-tools': { type: 'stdio', command: 'web-tools' },
        'ai-browser': { type: 'stdio', command: 'ai-browser' },
        skill: { type: 'stdio', command: 'skill' }
      })
      expect(mocks.buildSystemPromptAppend).toHaveBeenCalledWith('/tmp/space-2', 'gpt-4.1', false)
    })

    it('disables AI Browser MCP when system browser mode is enabled', async () => {
      const abortController = new AbortController()

      const { sdkOptions, addedMcpServers } = await buildSdkOptions({
        conversationId: 'conv-3',
        spaceId: 'space-3',
        workDir: '/tmp/space-3',
        config: {
          mcpServers: {},
          memory: { enabled: true },
          browserAutomation: { mode: 'system-browser' }
        },
        abortController,
        sdkModel: 'claude-sonnet-4-20250514',
        credentialsModel: 'glm-5',
        anthropicBaseUrl: 'http://router.local',
        anthropicApiKey: 'encoded-key',
        electronPath: '/Applications/Electron.app/Contents/MacOS/Electron',
        onStderr: vi.fn(),
        aiBrowserEnabled: true
      })

      expect(addedMcpServers).toEqual(['local-tools', 'web-tools'])
      expect(mocks.createBrowserMcpServer).not.toHaveBeenCalled()
      expect(mocks.createLocalToolsMcpServer).toHaveBeenCalledWith({
        workDir: '/tmp/space-3',
        spaceId: 'space-3',
        conversationId: 'conv-3',
        aiBrowserEnabled: false,
        includeSkillMcp: false,
        includeSubagentTools: true
      })
      expect(sdkOptions.systemPrompt.append).toContain('System Browser Mode')
      expect(sdkOptions.systemPrompt.append).toContain('mcp__local-tools__open_url')
      expect(sdkOptions.systemPrompt.append).toContain('mcp__local-tools__open_application')
      expect(sdkOptions.systemPrompt.append).toContain('Terminal Automation Policy')
      expect(sdkOptions.systemPrompt.append).toContain('Do not call `mcp__local-tools__open_application` first just to launch Terminal or iTerm.')
      expect(sdkOptions.systemPrompt.append).toContain('Structured App Automation Policy')
      expect(sdkOptions.systemPrompt.append).toContain('Avoid opening an extra blank window before using Finder, Chrome, Terminal, or iTerm tools.')
      expect(sdkOptions.systemPrompt.append).not.toContain('[AI_BROWSER_PROMPT]')
      expect(sdkOptions.strictMcpConfig).toBe(true)
    })

    it('removes configured ai-browser MCP servers in system browser mode', async () => {
      mocks.getEnabledMcpServers.mockReturnValue({
        github: { type: 'stdio', command: 'github-mcp' },
        'ai-browser': { type: 'stdio', command: 'custom-ai-browser' }
      })
      const abortController = new AbortController()

      const { sdkOptions, addedMcpServers } = await buildSdkOptions({
        conversationId: 'conv-4',
        spaceId: 'space-4',
        workDir: '/tmp/space-4',
        config: {
          mcpServers: {
            github: { command: 'github-mcp' },
            'ai-browser': { command: 'custom-ai-browser' }
          },
          memory: { enabled: true },
          browserAutomation: { mode: 'system-browser' }
        },
        abortController,
        sdkModel: 'claude-sonnet-4-20250514',
        credentialsModel: 'glm-5',
        anthropicBaseUrl: 'http://router.local',
        anthropicApiKey: 'encoded-key',
        electronPath: '/Applications/Electron.app/Contents/MacOS/Electron',
        onStderr: vi.fn(),
        aiBrowserEnabled: true
      })

      expect(addedMcpServers).toEqual(['local-tools', 'web-tools'])
      expect(mocks.createBrowserMcpServer).not.toHaveBeenCalled()
      expect(sdkOptions.mcpServers).toEqual({
        github: { type: 'stdio', command: 'github-mcp' },
        'local-tools': { type: 'stdio', command: 'local-tools' },
        'web-tools': { type: 'stdio', command: 'web-tools' }
      })
      expect(sdkOptions.strictMcpConfig).toBe(true)
    })
  })
})
