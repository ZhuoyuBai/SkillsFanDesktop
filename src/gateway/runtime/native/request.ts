import type {
  OpenAIResponsesInputContentPart,
  OpenAIResponsesFunctionCallOutput,
  OpenAIResponsesInputItem,
  OpenAIResponsesRequest
} from '../../../main/openai-compat-router/types/openai-responses'
import { normalizeThinkingEffortForModel } from '../../../shared/utils/openai-models'
import type {
  NativeFunctionToolDefinition,
  ToolProviderDefinition
} from '../../tools/types'
import { NATIVE_BUILTIN_PROVIDER_ID as BUILTIN_PROVIDER_ID } from '../../tools/types'
import { resolveNativeRuntimeTransportPlan } from './transport'
import type {
  NativeRuntimeAdapter,
  NativePreparedRequest,
  PrepareNativeRuntimeRequestInput
} from './types'
import { getNativeUserFacingMessage } from './user-facing'

function truncateMetadataValue(value: string, maxLength = 512): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function resolveUserContentParts(input: PrepareNativeRuntimeRequestInput): {
  content: string | OpenAIResponsesInputContentPart[]
  unsupportedInputKinds: string[]
} {
  const unsupportedInputKinds: string[] = []
  const contentParts: OpenAIResponsesInputContentPart[] = []

  if (input.request.message.trim()) {
    contentParts.push({
      type: 'input_text',
      text: input.request.message
    })
  }

  const imageAttachments = [
    ...(input.request.images || []),
    ...((input.request.attachments || []).filter((attachment) => attachment.type === 'image'))
  ]

  for (const image of imageAttachments) {
    contentParts.push({
      type: 'input_image',
      image_url: `data:${image.mediaType};base64,${image.data}`,
      detail: 'auto'
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

  if (contentParts.length === 1 && contentParts[0].type === 'input_text') {
    return {
      content: contentParts[0].text,
      unsupportedInputKinds
    }
  }

  return {
    content: contentParts,
    unsupportedInputKinds
  }
}

function buildNativeInputItems(input: PrepareNativeRuntimeRequestInput): {
  inputItems: OpenAIResponsesInputItem[]
  unsupportedInputKinds: string[]
} {
  const inputItems: OpenAIResponsesInputItem[] = []

  if (input.request.messagePrefix?.trim()) {
    inputItems.push({
      role: 'developer',
      content: input.request.messagePrefix.trim()
    })
  }

  const userContent = resolveUserContentParts(input)
  inputItems.push({
    role: 'user',
    content: userContent.content
  })

  return {
    inputItems,
    unsupportedInputKinds: userContent.unsupportedInputKinds
  }
}

function appendAskUserQuestionGuidance(
  inputItems: OpenAIResponsesInputItem[],
  nativeFunctionTools: NativeFunctionToolDefinition[]
): OpenAIResponsesInputItem[] {
  const hasAskUserQuestionTool = nativeFunctionTools.some(
    (tool) => tool.sourceToolName === 'AskUserQuestion'
  )
  if (!hasAskUserQuestionTool) {
    return inputItems
  }

  const guidance =
    'If one important detail is still unclear, call app__ask_user_question before guessing. ' +
    'Ask only one short, simple question at a time, avoid technical wording, and give up to three clear choices whenever possible.'

  const cloned = [...inputItems]
  const firstItem = cloned[0]
  if (firstItem?.role === 'developer' && typeof firstItem.content === 'string') {
    cloned[0] = {
      ...firstItem,
      content: `${firstItem.content}\n\n${guidance}`
    }
    return cloned
  }

  return [
    {
      role: 'developer',
      content: guidance
    },
    ...cloned
  ]
}

function buildNativeRequestMetadata(
  input: PrepareNativeRuntimeRequestInput,
  adapter: NativeRuntimeAdapter,
  nativeToolProviderIds: string[],
  unsupportedInputKinds: string[]
): Record<string, string> {
  const tags = input.request.runtimeTaskHint?.tags?.join(',') || ''

  return {
    skillsfan_space_id: truncateMetadataValue(input.request.spaceId),
    skillsfan_conversation_id: truncateMetadataValue(input.request.conversationId),
    skillsfan_runtime_kind: 'native',
    skillsfan_native_adapter: adapter.id,
    skillsfan_tool_provider_ids: truncateMetadataValue(nativeToolProviderIds.join(',')),
    skillsfan_runtime_tags: truncateMetadataValue(tags),
    skillsfan_unsupported_inputs: truncateMetadataValue(unsupportedInputKinds.join(','))
  }
}

function buildNativeRuntimeHeaders(input: PrepareNativeRuntimeRequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(input.endpoint.headers || {})
  }

  const hasAuthorizationHeader = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization'
  )

  if (!hasAuthorizationHeader) {
    headers.Authorization = `Bearer ${input.endpoint.apiKey}`
  }

  return headers
}

function buildReasoningConfig(input: PrepareNativeRuntimeRequestInput): OpenAIResponsesRequest['reasoning'] {
  const model = input.request.model || input.endpoint.model || null
  const effort = normalizeThinkingEffortForModel(model, input.request.thinkingEffort)

  if (effort === 'off') {
    return undefined
  }

  return {
    effort,
    summary: 'none'
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

export function buildNativeRuntimePreparedRequest(
  input: PrepareNativeRuntimeRequestInput,
  adapter: NativeRuntimeAdapter
): NativePreparedRequest {
  const transportResolution = resolveNativeRuntimeTransportPlan(input.endpoint)
  if (!transportResolution.plan) {
    throw new Error(transportResolution.reason)
  }

  const nativeToolProviderIds = resolveNativeToolProviderIds(input.sharedToolProviders)
  const nativeFunctionTools = resolveNativeFunctionTools(
    input.nativeFunctionTools,
    nativeToolProviderIds
  )
  const requestInput = buildNativeInputItems(input)
  const inputItems = appendAskUserQuestionGuidance(
    requestInput.inputItems,
    nativeFunctionTools
  )
  const model = input.request.model || input.endpoint.model

  if (!model) {
    throw new Error(getNativeUserFacingMessage('resolvedModelRequired'))
  }

  const stream = input.endpoint.forceStream !== false
  const body: OpenAIResponsesRequest = {
    model,
    input: inputItems,
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
    store: transportResolution.plan.storePolicy === 'force-true',
    tools: nativeFunctionTools.length > 0
      ? nativeFunctionTools.map((tool) => ({
          type: 'function' as const,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: tool.strict
        }))
      : undefined,
    tool_choice: nativeFunctionTools.length > 0 ? 'auto' : undefined,
    parallel_tool_calls: nativeFunctionTools.length > 0 ? true : undefined,
    reasoning: buildReasoningConfig(input),
    metadata: buildNativeRequestMetadata(
      input,
      adapter,
      nativeToolProviderIds,
      requestInput.unsupportedInputKinds
    ),
    user: truncateMetadataValue(`${input.request.spaceId}:${input.request.conversationId}`, 256)
  }

  return {
    adapterId: adapter.id,
    adapterDisplayName: adapter.displayName,
    method: 'POST',
    url: transportResolution.plan.endpointUrl,
    headers: buildNativeRuntimeHeaders(input),
    body,
    stream,
    toolProviderIds: nativeToolProviderIds,
    nativeTools: nativeFunctionTools,
    unsupportedInputKinds: requestInput.unsupportedInputKinds
  }
}

export function buildNativeRuntimeFollowupPreparedRequest(params: {
  preparedRequest: NativePreparedRequest
  previousResponseId: string
  toolOutputs: OpenAIResponsesFunctionCallOutput[]
}): NativePreparedRequest {
  const body: OpenAIResponsesRequest = {
    ...params.preparedRequest.body,
    input: params.toolOutputs,
    previous_response_id: params.previousResponseId
  }

  return {
    ...params.preparedRequest,
    body
  }
}
