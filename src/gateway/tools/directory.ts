import type { RuntimeKind } from '../runtime/types'
import { getSharedToolPermissionPolicy } from './policies'
import type {
  SharedToolPermissionPolicyKind
} from './policies'
import type {
  ToolCatalogEntry,
  ToolProviderDefinition,
  ToolProviderSource
} from './types'

export interface SharedToolDirectoryEntry extends ToolCatalogEntry {
  providerId: string
  providerSource: ToolProviderSource | 'built-in'
  runtimeKinds: RuntimeKind[]
  permissionPolicyKind?: SharedToolPermissionPolicyKind
}

export interface BuildSharedToolDirectoryOptions {
  catalog: ToolCatalogEntry[]
  providers: ToolProviderDefinition[]
}

function getBuiltInRuntimeKinds(entry: ToolCatalogEntry): RuntimeKind[] {
  if (entry.name === 'AskUserQuestion') {
    return ['claude-sdk', 'native']
  }

  return ['claude-sdk']
}

export function buildSharedToolDirectory(
  options: BuildSharedToolDirectoryOptions
): SharedToolDirectoryEntry[] {
  const providerMap = new Map(options.providers.map((provider) => [provider.id, provider]))

  return options.catalog.map((entry) => {
    const permissionPolicyKind = getSharedToolPermissionPolicy(entry.name)?.kind

    if (entry.source === 'built-in') {
      return {
        ...entry,
        providerId: 'built-in',
        providerSource: 'built-in',
        runtimeKinds: getBuiltInRuntimeKinds(entry),
        permissionPolicyKind
      }
    }

    const provider = entry.server ? providerMap.get(entry.server) : null
    return {
      ...entry,
      providerId: entry.server || 'unknown',
      providerSource: provider?.source || 'app',
      runtimeKinds: provider?.runtimeKinds || ['claude-sdk'],
      permissionPolicyKind
    }
  })
}

export function findSharedToolDirectoryEntry(
  directory: SharedToolDirectoryEntry[] | undefined,
  toolName: string
): SharedToolDirectoryEntry | undefined {
  return (directory || []).find((entry) => entry.name === toolName)
}
