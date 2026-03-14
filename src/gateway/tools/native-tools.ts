import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { findSharedToolDirectoryEntry } from './directory'
import type {
  NativeFunctionToolDefinition,
  NativeFunctionToolParameters,
  SharedToolDirectoryEntry,
  ToolProviderDefinition
} from './types'
import { NATIVE_BUILTIN_PROVIDER_ID as BUILTIN_PROVIDER_ID } from './types'
import { SHARED_BUILT_IN_TOOL_CATALOG } from './built-ins'

interface BuildNativeFunctionToolDefinitionsInput {
  mcpServers: Record<string, unknown>
  providers: ToolProviderDefinition[]
  directory?: SharedToolDirectoryEntry[]
}

interface RegisteredSdkTool {
  description?: string
  inputSchema?: unknown
  enabled?: boolean
}

function isSdkServerConfig(value: unknown): value is McpSdkServerConfigWithInstance {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'sdk'
      && 'instance' in (value as Record<string, unknown>)
  )
}

function buildNativeFunctionToolName(providerId: string, toolName: string): string {
  const providerSegment = providerId.replace(/[^A-Za-z0-9_-]/g, '_')
  const toolSegment = toolName.replace(/[^A-Za-z0-9_-]/g, '_')
  return `mcp__${providerSegment}__${toolSegment}`
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeJsonSchemaProperties(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {}
}

function normalizeFunctionToolParameters(inputSchema: unknown): NativeFunctionToolParameters {
  if (!inputSchema) {
    return {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }

  if (isObjectRecord(inputSchema) && inputSchema.type === 'object') {
    return {
      type: 'object',
      properties: normalizeJsonSchemaProperties(inputSchema.properties),
      required: Array.isArray(inputSchema.required)
        ? inputSchema.required.filter((item): item is string => typeof item === 'string')
        : undefined,
      additionalProperties:
        typeof inputSchema.additionalProperties === 'boolean'
          ? inputSchema.additionalProperties
          : false
    }
  }

  try {
    const jsonSchema = z.toJSONSchema(inputSchema as z.ZodTypeAny)
    return {
      type: 'object',
      properties: normalizeJsonSchemaProperties(jsonSchema.properties),
      required: Array.isArray(jsonSchema.required)
        ? jsonSchema.required.filter((item): item is string => typeof item === 'string')
        : undefined,
      additionalProperties:
        typeof jsonSchema.additionalProperties === 'boolean'
          ? jsonSchema.additionalProperties
          : false
    }
  } catch {
    return {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
}

function listRegisteredSdkTools(server: McpSdkServerConfigWithInstance): Array<[string, RegisteredSdkTool]> {
  const registeredTools = (
    server.instance as unknown as { _registeredTools?: Record<string, RegisteredSdkTool> }
  )._registeredTools

  return Object.entries(registeredTools || {})
}

function buildAskUserQuestionToolDefinition(): NativeFunctionToolDefinition {
  const sharedDescription = SHARED_BUILT_IN_TOOL_CATALOG.find((entry) => entry.name === 'AskUserQuestion')?.description
  const parameters: NativeFunctionToolParameters = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'A short follow-up question written for a normal user.'
      },
      header: {
        type: 'string',
        description: 'A short title such as Confirm, Choose, or Continue.'
      },
      options: {
        type: 'array',
        description: 'Two to four simple answer options.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['label'],
          additionalProperties: false
        }
      }
    },
    required: ['question'],
    additionalProperties: false
  }

  return {
    name: 'app__ask_user_question',
    providerId: BUILTIN_PROVIDER_ID,
    sourceToolName: 'AskUserQuestion',
    description: sharedDescription || 'Pause and ask the user one short follow-up question when a key detail is still unclear.',
    parameters,
    strict: false
  }
}

function buildCatalogDescriptionLookup(directory: SharedToolDirectoryEntry[] | undefined): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const entry of directory || []) {
    lookup.set(entry.name, entry.description)
  }
  return lookup
}

export function buildNativeFunctionToolDefinitions(
  input: BuildNativeFunctionToolDefinitionsInput
): NativeFunctionToolDefinition[] {
  const nativeProviderIds = new Set(
    input.providers
      .filter((provider) => provider.runtimeKinds.includes('native'))
      .map((provider) => provider.id)
  )

  const definitions: NativeFunctionToolDefinition[] = []
  const catalogDescriptions = buildCatalogDescriptionLookup(input.directory)

  for (const [providerId, server] of Object.entries(input.mcpServers)) {
    if (!nativeProviderIds.has(providerId) || !isSdkServerConfig(server)) {
      continue
    }

    for (const [toolName, tool] of listRegisteredSdkTools(server)) {
      if (tool.enabled === false) {
        continue
      }

      const nativeName = buildNativeFunctionToolName(providerId, toolName)
      const directoryEntry = findSharedToolDirectoryEntry(input.directory, nativeName)
      if (directoryEntry && !directoryEntry.runtimeKinds.includes('native')) {
        continue
      }

      definitions.push({
        name: nativeName,
        providerId,
        sourceToolName: toolName,
        description: catalogDescriptions.get(nativeName) || tool.description || `${toolName} from ${providerId}`,
        parameters: normalizeFunctionToolParameters(tool.inputSchema),
        strict: false
      })
    }
  }

  definitions.push(buildAskUserQuestionToolDefinition())

  return definitions.sort((left, right) => left.name.localeCompare(right.name))
}
