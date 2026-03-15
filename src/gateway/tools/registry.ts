import { hostRuntime } from '../host-runtime'
import { getEnabledMcpServers } from '../../main/services/agent/helpers'
import { getEnabledExtensions, runGetMcpServersHooks } from '../../main/services/extension'
import { buildToolCatalog } from './catalog'
import { buildSharedToolDirectory } from './directory'
import { buildSharedToolProviderDefinitions } from './providers'
import type { BuildToolRegistryParams, BuildToolRegistryResult } from './types'

export async function buildToolRegistry(params: BuildToolRegistryParams): Promise<BuildToolRegistryResult> {
  const {
    conversationId,
    spaceId,
    workDir,
    config,
    aiBrowserEnabled = false,
    includeSubagentTools = true
  } = params

  const browserAutomationMode = config.browserAutomation?.mode === 'system-browser'
    ? 'system-browser'
    : 'ai-browser'
  const effectiveAiBrowserEnabled = aiBrowserEnabled && browserAutomationMode !== 'system-browser'

  const enabledMcp = getEnabledMcpServers(config.mcpServers || {})
  const mcpServers: Record<string, any> = enabledMcp ? { ...enabledMcp } : {}
  const addedMcpServers: string[] = []

  if (browserAutomationMode === 'system-browser' && mcpServers['ai-browser']) {
    delete mcpServers['ai-browser']
  }

  const { createLocalToolsMcpServer } = await import('../../main/services/local-tools/sdk-mcp-server')
  mcpServers['local-tools'] = createLocalToolsMcpServer({
    workDir,
    spaceId,
    conversationId,
    aiBrowserEnabled: effectiveAiBrowserEnabled,
    includeSubagentTools
  })
  addedMcpServers.push('local-tools')

  const { createWebToolsMcpServer } = await import('../../main/services/web-tools/sdk-mcp-server')
  mcpServers['web-tools'] = createWebToolsMcpServer()
  addedMcpServers.push('web-tools')

  if (effectiveAiBrowserEnabled) {
    mcpServers['ai-browser'] = hostRuntime.browser.createMcpServer('automated', {
      spaceId,
      conversationId
    })
    addedMcpServers.push('ai-browser')
  }

  const enabledExtensions = getEnabledExtensions()
  const extensionProviderIds: string[] = []
  if (enabledExtensions.length > 0) {
    const extensionMcpServers = await runGetMcpServersHooks(enabledExtensions)
    for (const [name, extensionConfig] of Object.entries(extensionMcpServers)) {
      mcpServers[name] = extensionConfig
      addedMcpServers.push(name)
      extensionProviderIds.push(name)
    }
  }

  const providers = buildSharedToolProviderDefinitions({
    effectiveAiBrowserEnabled,
    extensionProviderIds
  })
  const catalog = buildToolCatalog({
    aiBrowserEnabled: effectiveAiBrowserEnabled,
    includeSubagentTools
  })

  return {
    mcpServers,
    addedMcpServers,
    providers,
    catalog,
    directory: buildSharedToolDirectory({
      catalog,
      providers
    }),
    browserAutomationMode,
    effectiveAiBrowserEnabled
  }
}
