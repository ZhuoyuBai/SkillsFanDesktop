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

import {
  buildRuntimeToolBundle,
  resolveConfiguredSharedToolProviders,
  resolveRuntimeKindToolProviders
} from '../../../../src/gateway/tools'

describe('runtime tool bundle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createBrowserMcpServer.mockReturnValue({ type: 'stdio', command: 'ai-browser' })
    mocks.createLocalToolsMcpServer.mockReturnValue({
      type: 'sdk',
      instance: {
        _registeredTools: {
          memory: {
            description: 'Access stored memory.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' }
              },
              additionalProperties: false
            }
          }
        }
      }
    })
    mocks.createWebToolsMcpServer.mockReturnValue({ type: 'stdio', command: 'web-tools' })
    mocks.createSkillMcpServer.mockResolvedValue({ type: 'stdio', command: 'skill' })
    mocks.getEnabledMcpServers.mockReturnValue({})
    mocks.getEnabledExtensions.mockReturnValue([])
    mocks.runGetMcpServersHooks.mockResolvedValue({})
  })

  it('builds a shared bundle with claude-sdk and native runtime views', async () => {
    const bundle = await buildRuntimeToolBundle({
      conversationId: 'conv-1',
      spaceId: 'space-1',
      workDir: '/tmp/space-1',
      config: { mcpServers: {} },
      includeSkillMcp: true
    })

    expect(bundle.workDir).toBe('/tmp/space-1')
    expect(bundle.claudeSdk).toEqual({
      mcpServers: {
        'local-tools': {
          type: 'sdk',
          instance: {
            _registeredTools: {
              memory: {
                description: 'Access stored memory.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' }
                  },
                  additionalProperties: false
                }
              }
            }
          }
        },
        'web-tools': { type: 'stdio', command: 'web-tools' },
        skill: { type: 'stdio', command: 'skill' }
      },
      addedMcpServers: ['local-tools', 'web-tools', 'skill'],
      providerIds: ['local-tools', 'web-tools', 'skill']
    })
    expect(bundle.native.providers.map((provider) => provider.id)).toEqual(['local-tools', 'web-tools'])
    expect(bundle.native.sharedToolRegistryReady).toBe(true)
    expect(bundle.native.functionTools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'app__ask_user_question',
        providerId: 'native-builtins'
      }),
      expect.objectContaining({
        name: 'mcp__local-tools__memory',
        providerId: 'local-tools',
        sourceToolName: 'memory'
      })
    ]))
  })

  it('filters providers by runtime kind and resolves configured shared providers from app config', () => {
    mocks.getEnabledExtensions.mockReturnValue([{ manifest: { id: 'calendar' } }])

    const providers = resolveConfiguredSharedToolProviders({
      config: {
        browserAutomation: {
          mode: 'system-browser'
        }
      },
      includeSkillMcp: true
    })

    expect(providers.map((provider) => provider.id)).toEqual(['local-tools', 'web-tools', 'skill', 'calendar'])
    expect(resolveRuntimeKindToolProviders(providers, 'native').map((provider) => provider.id)).toEqual([
      'local-tools',
      'web-tools',
      'calendar'
    ])
  })
})
