import type { ToolProviderDefinition } from './types'

export interface BuildSharedToolProviderDefinitionsOptions {
  effectiveAiBrowserEnabled: boolean
  extensionProviderIds?: string[]
}

export function buildSharedToolProviderDefinitions(
  options: BuildSharedToolProviderDefinitionsOptions
): ToolProviderDefinition[] {
  const providers: ToolProviderDefinition[] = [
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
  ]

  if (options.effectiveAiBrowserEnabled) {
    providers.push({
      id: 'ai-browser',
      kind: 'mcp',
      source: 'app',
      description: 'Automated browser MCP tools backed by the shared HostRuntime browser adapter.',
      runtimeKinds: ['claude-sdk', 'native']
    })
  }

  for (const id of options.extensionProviderIds || []) {
    providers.push({
      id,
      kind: 'mcp',
      source: 'extension',
      description: `Extension-provided MCP tools from ${id}.`,
      runtimeKinds: ['claude-sdk', 'native']
    })
  }

  return providers
}
