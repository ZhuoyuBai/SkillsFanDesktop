import { describe, expect, it } from 'vitest'

import { buildSharedToolProviderDefinitions } from '../../../../src/gateway/tools/providers'

describe('shared tool provider definitions', () => {
  it('returns app-managed providers by default', () => {
    expect(buildSharedToolProviderDefinitions({
      effectiveAiBrowserEnabled: false
    })).toEqual([
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
  })

  it('adds ai-browser and extension providers when enabled', () => {
    expect(buildSharedToolProviderDefinitions({
      effectiveAiBrowserEnabled: true,
      extensionProviderIds: ['calendar']
    })).toEqual([
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
        id: 'calendar',
        kind: 'mcp',
        source: 'extension',
        description: 'Extension-provided MCP tools from calendar.',
        runtimeKinds: ['claude-sdk', 'native']
      }
    ])
  })
})
