import type { RuntimeKind } from '../runtime/types'
import type { SharedToolDirectoryEntry } from './directory'

export interface BuildToolRegistryParams {
  conversationId: string
  spaceId: string
  workDir: string
  config: Record<string, any>
  aiBrowserEnabled?: boolean
  includeSkillMcp?: boolean
  includeSubagentTools?: boolean
}

export interface BuildToolRegistryResult {
  mcpServers: Record<string, any>
  addedMcpServers: string[]
  providers: ToolProviderDefinition[]
  catalog: ToolCatalogEntry[]
  directory: SharedToolDirectoryEntry[]
  browserAutomationMode: 'ai-browser' | 'system-browser'
  effectiveAiBrowserEnabled: boolean
}

export interface RuntimeToolRuntimeView {
  providerIds: string[]
}

export interface ClaudeSdkToolRuntimeView extends RuntimeToolRuntimeView {
  mcpServers: Record<string, unknown>
  addedMcpServers: string[]
}

export interface NativeToolRuntimeView extends RuntimeToolRuntimeView {
  providers: ToolProviderDefinition[]
  functionTools: NativeFunctionToolDefinition[]
  sharedToolRegistryReady: boolean
}

export interface RuntimeToolBundle extends BuildToolRegistryResult {
  workDir: string
  claudeSdk: ClaudeSdkToolRuntimeView
  native: NativeToolRuntimeView
}

export type ToolCatalogSource = 'built-in' | 'mcp'

export type ToolCatalogCategory =
  | 'files'
  | 'shell'
  | 'tasks'
  | 'browser'
  | 'desktop'
  | 'web'
  | 'memory'
  | 'skills'
  | 'meta'

export interface ToolCatalogEntry {
  name: string
  description: string
  source: ToolCatalogSource
  server?: string
  category: ToolCatalogCategory
}

export type ToolProviderSource = 'app' | 'extension'

export interface ToolProviderDefinition {
  id: string
  kind: 'mcp'
  source: ToolProviderSource
  description: string
  runtimeKinds: RuntimeKind[]
}

export interface NativeFunctionToolParameters {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface NativeFunctionToolDefinition {
  name: string
  providerId: string
  sourceToolName: string
  description: string
  parameters: NativeFunctionToolParameters
  strict?: boolean
}

export const NATIVE_BUILTIN_PROVIDER_ID = 'native-builtins'
