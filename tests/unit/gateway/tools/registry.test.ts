import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBrowserMcpServer: vi.fn(),
  createLocalToolsMcpServer: vi.fn(),
  createWebToolsMcpServer: vi.fn(),
  createSkillMcpServer: vi.fn(),
  getEnabledMcpServers: vi.fn(),
  getEnabledExtensions: vi.fn(),
  runGetMcpServersHooks: vi.fn()
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

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  getEnabledMcpServers: mocks.getEnabledMcpServers
}))

vi.mock('../../../../src/main/services/extension', () => ({
  getEnabledExtensions: mocks.getEnabledExtensions,
  runGetMcpServersHooks: mocks.runGetMcpServersHooks
}))

import { buildToolRegistry } from '../../../../src/gateway/tools'

describe('buildToolRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createBrowserMcpServer.mockReturnValue({ type: 'stdio', command: 'ai-browser' })
    mocks.createLocalToolsMcpServer.mockReturnValue({ type: 'stdio', command: 'local-tools' })
    mocks.createWebToolsMcpServer.mockReturnValue({ type: 'stdio', command: 'web-tools' })
    mocks.createSkillMcpServer.mockResolvedValue({ type: 'stdio', command: 'skill' })
    mocks.getEnabledMcpServers.mockReturnValue({})
    mocks.getEnabledExtensions.mockReturnValue([])
    mocks.runGetMcpServersHooks.mockResolvedValue({})
  })

  it('registers shared local and web MCP servers by default', async () => {
    const result = await buildToolRegistry({
      conversationId: 'conv-1',
      spaceId: 'space-1',
      workDir: '/tmp/space-1',
      config: { mcpServers: {} }
    })

    expect(result.browserAutomationMode).toBe('ai-browser')
    expect(result.effectiveAiBrowserEnabled).toBe(false)
    expect(result.addedMcpServers).toEqual(['local-tools', 'web-tools'])
    expect(result.providers).toEqual([
      {
        id: 'local-tools',
        kind: 'mcp',
        source: 'app',
        description: 'Workspace, desktop, terminal, browser, memory, and local automation tools managed by the app.',
        runtimeKinds: ['claude-sdk', 'native']
      },
      {
        id: 'web-tools',
        kind: 'mcp',
        source: 'app',
        description: 'App-managed local web search and web fetch tools.',
        runtimeKinds: ['claude-sdk', 'native']
      }
    ])
    expect(result.mcpServers).toEqual({
      'local-tools': { type: 'stdio', command: 'local-tools' },
      'web-tools': { type: 'stdio', command: 'web-tools' }
    })
    expect(mocks.createBrowserMcpServer).not.toHaveBeenCalled()
  })

  it('keeps ai-browser out when system browser mode is enabled', async () => {
    mocks.getEnabledMcpServers.mockReturnValue({
      github: { type: 'stdio', command: 'github-mcp' },
      'ai-browser': { type: 'stdio', command: 'custom-ai-browser' }
    })

    const result = await buildToolRegistry({
      conversationId: 'conv-2',
      spaceId: 'space-2',
      workDir: '/tmp/space-2',
      config: {
        mcpServers: {
          github: { command: 'github-mcp' },
          'ai-browser': { command: 'custom-ai-browser' }
        },
        browserAutomation: { mode: 'system-browser' }
      },
      aiBrowserEnabled: true
    })

    expect(result.browserAutomationMode).toBe('system-browser')
    expect(result.effectiveAiBrowserEnabled).toBe(false)
    expect(result.addedMcpServers).toEqual(['local-tools', 'web-tools'])
    expect(result.providers).toEqual([
      {
        id: 'local-tools',
        kind: 'mcp',
        source: 'app',
        description: 'Workspace, desktop, terminal, browser, memory, and local automation tools managed by the app.',
        runtimeKinds: ['claude-sdk', 'native']
      },
      {
        id: 'web-tools',
        kind: 'mcp',
        source: 'app',
        description: 'App-managed local web search and web fetch tools.',
        runtimeKinds: ['claude-sdk', 'native']
      }
    ])
    expect(result.mcpServers).toEqual({
      github: { type: 'stdio', command: 'github-mcp' },
      'local-tools': { type: 'stdio', command: 'local-tools' },
      'web-tools': { type: 'stdio', command: 'web-tools' }
    })
    expect(mocks.createBrowserMcpServer).not.toHaveBeenCalled()
  })

  it('adds skill, ai-browser, and extension MCP servers when enabled', async () => {
    mocks.getEnabledExtensions.mockReturnValue([{ manifest: { id: 'calendar' } }])
    mocks.runGetMcpServersHooks.mockResolvedValue({
      calendar: { type: 'stdio', command: 'calendar-mcp' }
    })

    const result = await buildToolRegistry({
      conversationId: 'conv-3',
      spaceId: 'space-3',
      workDir: '/tmp/space-3',
      config: { mcpServers: {} },
      aiBrowserEnabled: true,
      includeSkillMcp: true
    })

    expect(result.effectiveAiBrowserEnabled).toBe(true)
    expect(result.addedMcpServers).toEqual(['local-tools', 'web-tools', 'ai-browser', 'skill', 'calendar'])
    expect(result.providers).toEqual([
      {
        id: 'local-tools',
        kind: 'mcp',
        source: 'app',
        description: 'Workspace, desktop, terminal, browser, memory, and local automation tools managed by the app.',
        runtimeKinds: ['claude-sdk', 'native']
      },
      {
        id: 'web-tools',
        kind: 'mcp',
        source: 'app',
        description: 'App-managed local web search and web fetch tools.',
        runtimeKinds: ['claude-sdk', 'native']
      },
      {
        id: 'ai-browser',
        kind: 'mcp',
        source: 'app',
        description: 'Automated browser MCP tools backed by the shared HostRuntime browser adapter.',
        runtimeKinds: ['claude-sdk', 'native']
      },
      {
        id: 'skill',
        kind: 'mcp',
        source: 'app',
        description: 'Local skill loading MCP tools exposed through the shared skill runtime.',
        runtimeKinds: ['claude-sdk']
      },
      {
        id: 'calendar',
        kind: 'mcp',
        source: 'extension',
        description: 'Extension-provided MCP tools from calendar.',
        runtimeKinds: ['claude-sdk', 'native']
      }
    ])
    expect(result.mcpServers).toEqual({
      'local-tools': { type: 'stdio', command: 'local-tools' },
      'web-tools': { type: 'stdio', command: 'web-tools' },
      'ai-browser': { type: 'stdio', command: 'ai-browser' },
      skill: { type: 'stdio', command: 'skill' },
      calendar: { type: 'stdio', command: 'calendar-mcp' }
    })
    expect(mocks.createBrowserMcpServer).toHaveBeenCalledWith('automated', {
      spaceId: 'space-3',
      conversationId: 'conv-3'
    })
    expect(mocks.runGetMcpServersHooks).toHaveBeenCalledTimes(1)
  })
})
