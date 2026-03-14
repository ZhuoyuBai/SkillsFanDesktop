import type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicRequest,
  AnthropicSystemBlock,
  AnthropicTool,
  AnthropicToolResultBlock
} from '../../../main/openai-compat-router/types/anthropic'
import { thinkingEffortToBudgetTokens } from '../../../shared/utils/openai-models'
import type {
  NativeFunctionToolDefinition,
  ToolProviderDefinition
} from '../../tools/types'
import { NATIVE_BUILTIN_PROVIDER_ID as BUILTIN_PROVIDER_ID } from '../../tools/types'
import type {
  NativeNormalizedToolCall,
  NativePreparedRequest,
  PrepareNativeRuntimeRequestInput
} from './types'
import { getNativeUserFacingMessage } from './user-facing'

const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192
const ANTHROPIC_VERSION = '2023-06-01'

function truncateMetadataValue(value: string, maxLength = 512): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function isDeepSeekAnthropicEndpoint(input: PrepareNativeRuntimeRequestInput): boolean {
  const source = (input.endpoint.source || input.endpoint.requestedSource || '').toLowerCase()
  if (source === 'deepseek') {
    return true
  }

  try {
    return new URL(input.endpoint.baseUrl).hostname.toLowerCase() === 'api.deepseek.com'
  } catch {
    return input.endpoint.baseUrl.toLowerCase().includes('api.deepseek.com')
  }
}

function resolveAnthropicUserBlocks(input: PrepareNativeRuntimeRequestInput): {
  content: string | AnthropicContentBlock[]
  unsupportedInputKinds: string[]
} {
  const unsupportedInputKinds: string[] = []
  const contentBlocks: AnthropicContentBlock[] = []
  const deepSeekEndpoint = isDeepSeekAnthropicEndpoint(input)

  if (input.request.message.trim()) {
    contentBlocks.push({
      type: 'text',
      text: input.request.message
    })
  }

  const imageAttachments = [
    ...(input.request.images || []),
    ...((input.request.attachments || []).filter((attachment) => attachment.type === 'image'))
  ]

  for (const image of imageAttachments) {
    if (deepSeekEndpoint) {
      unsupportedInputKinds.push('image-input')
      continue
    }

    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: image.data
      }
    })
  }

  for (const attachment of input.request.attachments || []) {
    if (attachment.type === 'pdf') {
      unsupportedInputKinds.push('pdf-attachment')
    }

    if (attachment.type === 'text') {
      unsupportedInputKinds.push('text-attachment')
    }
  }

  if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
    return {
      content: contentBlocks[0].text,
      unsupportedInputKinds
    }
  }

  return {
    content: contentBlocks,
    unsupportedInputKinds
  }
}

function resolveNativeToolProviderIds(sharedToolProviders: ToolProviderDefinition[] | undefined): string[] {
  return (sharedToolProviders || [])
    .filter((provider) => provider.runtimeKinds.includes('native'))
    .map((provider) => provider.id)
}

function resolveNativeFunctionTools(
  nativeFunctionTools: NativeFunctionToolDefinition[] | undefined,
  nativeToolProviderIds: string[]
): NativeFunctionToolDefinition[] {
  return (nativeFunctionTools || []).filter((tool) =>
    tool.providerId === BUILTIN_PROVIDER_ID || nativeToolProviderIds.includes(tool.providerId)
  )
}

function buildAnthropicSystemBlocks(
  input: PrepareNativeRuntimeRequestInput,
  nativeFunctionTools: NativeFunctionToolDefinition[]
): string | AnthropicSystemBlock[] | undefined {
  const parts: string[] = []

  if (input.request.messagePrefix?.trim()) {
    parts.push(input.request.messagePrefix.trim())
  }

  const hasAskUserQuestionTool = nativeFunctionTools.some(
    (tool) => tool.sourceToolName === 'AskUserQuestion'
  )

  if (hasAskUserQuestionTool) {
    parts.push(
      'If one important detail is still unclear, call app__ask_user_question before guessing. ' +
      'Ask only one short, simple question at a time, avoid technical wording, and give up to three clear choices whenever possible.'
    )
  }

  if (parts.length === 0) {
    return undefined
  }

  return parts.map((text) => ({
    type: 'text' as const,
    text
  }))
}

function buildAnthropicTools(nativeFunctionTools: NativeFunctionToolDefinition[]): AnthropicTool[] | undefined {
  if (nativeFunctionTools.length === 0) {
    return undefined
  }

  return nativeFunctionTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters.properties as Record<string, any>,
      required: tool.parameters.required
    },
    strict: tool.strict
  }))
}

function buildAnthropicThinkingConfig(
  input: PrepareNativeRuntimeRequestInput
): AnthropicRequest['thinking'] | undefined {
  const budgetTokens = thinkingEffortToBudgetTokens(
    input.request.thinkingEffort ?? (input.request.thinkingEnabled ? 'high' : undefined)
  )

  if (!budgetTokens) {
    return undefined
  }

  return {
    type: 'enabled',
    budget_tokens: budgetTokens
  }
}

function buildAnthropicRequestMetadata(
  input: PrepareNativeRuntimeRequestInput,
  nativeToolProviderIds: string[],
  unsupportedInputKinds: string[]
): Record<string, unknown> {
  const tags = input.request.runtimeTaskHint?.tags?.join(',') || ''

  return {
    user_id: truncateMetadataValue(`${input.request.spaceId}:${input.request.conversationId}`, 256),
    skillsfan_space_id: truncateMetadataValue(input.request.spaceId),
    skillsfan_conversation_id: truncateMetadataValue(input.request.conversationId),
    skillsfan_runtime_kind: 'native',
    skillsfan_native_adapter: 'anthropic-messages',
    skillsfan_tool_provider_ids: truncateMetadataValue(nativeToolProviderIds.join(',')),
    skillsfan_runtime_tags: truncateMetadataValue(tags),
    skillsfan_unsupported_inputs: truncateMetadataValue(unsupportedInputKinds.join(','))
  }
}

function buildAnthropicHeaders(input: PrepareNativeRuntimeRequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(input.endpoint.headers || {})
  }

  const hasApiKeyHeader = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'x-api-key'
  )
  const hasAnthropicVersion = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'anthropic-version'
  )

  if (!hasApiKeyHeader) {
    headers['x-api-key'] = input.endpoint.apiKey
  }

  if (!hasAnthropicVersion) {
    headers['anthropic-version'] = ANTHROPIC_VERSION
  }

  return headers
}

function parseToolArguments(argumentsText: string): Record<string, unknown> {
  if (!argumentsText.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(argumentsText) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed }
  } catch {
    return {
      rawArguments: argumentsText
    }
  }
}

export function buildAnthropicNativeRuntimePreparedRequest(
  input: PrepareNativeRuntimeRequestInput
): NativePreparedRequest {
  const nativeToolProviderIds = resolveNativeToolProviderIds(input.sharedToolProviders)
  const nativeFunctionTools = resolveNativeFunctionTools(
    input.nativeFunctionTools,
    nativeToolProviderIds
  )
  const userContent = resolveAnthropicUserBlocks(input)
  const model = input.request.model || input.endpoint.model

  if (!model) {
    throw new Error(getNativeUserFacingMessage('resolvedModelRequired'))
  }

  const body: AnthropicRequest = {
    model,
    max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: userContent.content
      }
    ],
    stream: false,
    system: buildAnthropicSystemBlocks(input, nativeFunctionTools),
    tools: buildAnthropicTools(nativeFunctionTools),
    tool_choice: nativeFunctionTools.length > 0 ? { type: 'auto' } : undefined,
    thinking: buildAnthropicThinkingConfig(input),
    metadata: buildAnthropicRequestMetadata(
      input,
      nativeToolProviderIds,
      userContent.unsupportedInputKinds
    )
  }

  return {
    adapterId: 'anthropic-messages',
    adapterDisplayName: 'Anthropic Messages Adapter',
    method: 'POST',
    url: `${input.endpoint.baseUrl.replace(/\/$/, '')}/v1/messages`,
    requestTimeoutMs: isDeepSeekAnthropicEndpoint(input)
      ? 10 * 60_000
      : 5 * 60_000,
    headers: buildAnthropicHeaders(input),
    body,
    stream: false,
    toolProviderIds: nativeToolProviderIds,
    nativeTools: nativeFunctionTools,
    unsupportedInputKinds: userContent.unsupportedInputKinds
  }
}

export function buildAnthropicNativeRuntimeFollowupPreparedRequest(params: {
  preparedRequest: NativePreparedRequest
  assistantResponseText?: string
  toolOutputs: Array<{
    toolCall: NativeNormalizedToolCall
    outputText: string
    isError: boolean
  }>
}): NativePreparedRequest {
  const body = params.preparedRequest.body as AnthropicRequest
  const assistantContent: AnthropicContentBlock[] = []

  if (params.assistantResponseText?.trim()) {
    assistantContent.push({
      type: 'text',
      text: params.assistantResponseText
    })
  }

  for (const toolOutput of params.toolOutputs) {
    assistantContent.push({
      type: 'tool_use',
      id: toolOutput.toolCall.id,
      name: toolOutput.toolCall.name,
      input: parseToolArguments(toolOutput.toolCall.argumentsText)
    })
  }

  const userToolResults: AnthropicToolResultBlock[] = params.toolOutputs.map((toolOutput) => ({
    type: 'tool_result',
    tool_use_id: toolOutput.toolCall.id,
    content: toolOutput.outputText,
    is_error: toolOutput.isError
  }))

  const messages: AnthropicMessage[] = [
    ...(body.messages || []),
    {
      role: 'assistant',
      content: assistantContent
    },
    {
      role: 'user',
      content: userToolResults
    }
  ]

  return {
    ...params.preparedRequest,
    body: {
      ...body,
      messages
    }
  }
}
