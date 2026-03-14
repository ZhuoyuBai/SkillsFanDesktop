import { getEnabledExtensions } from '../../main/services/extension'
import type { RuntimeKind } from '../runtime/types'
import { buildNativeFunctionToolDefinitions } from './native-tools'
import { buildSharedToolProviderDefinitions } from './providers'
import { buildToolRegistry } from './registry'
import type {
  BuildToolRegistryParams,
  RuntimeToolBundle,
  ToolProviderDefinition
} from './types'

export function resolveRuntimeKindToolProviders(
  providers: ToolProviderDefinition[],
  runtimeKind: RuntimeKind
): ToolProviderDefinition[] {
  return providers.filter((provider) => provider.runtimeKinds.includes(runtimeKind))
}

export function resolveConfiguredSharedToolProviders(args: {
  config: Record<string, any>
  includeSkillMcp?: boolean
}): ToolProviderDefinition[] {
  return buildSharedToolProviderDefinitions({
    effectiveAiBrowserEnabled: args.config.browserAutomation?.mode !== 'system-browser',
    includeSkillMcp: args.includeSkillMcp ?? true,
    extensionProviderIds: getEnabledExtensions().map((extension) => extension.manifest.id)
  })
}

export async function buildRuntimeToolBundle(
  params: BuildToolRegistryParams
): Promise<RuntimeToolBundle> {
  const registry = await buildToolRegistry(params)
  const nativeProviders = resolveRuntimeKindToolProviders(registry.providers, 'native')
  const nativeFunctionTools = buildNativeFunctionToolDefinitions({
    mcpServers: registry.mcpServers,
    providers: registry.providers,
    directory: registry.directory
  })

  return {
    ...registry,
    workDir: params.workDir,
    claudeSdk: {
      mcpServers: registry.mcpServers,
      addedMcpServers: registry.addedMcpServers,
      providerIds: registry.providers.map((provider) => provider.id)
    },
    native: {
      providers: nativeProviders,
      providerIds: nativeProviders.map((provider) => provider.id),
      functionTools: nativeFunctionTools,
      sharedToolRegistryReady: nativeProviders.length > 0
    }
  }
}
