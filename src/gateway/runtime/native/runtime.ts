import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import { addMessage, updateLastMessage } from '../../../main/services/conversation.service'
import { getConfig } from '../../../main/services/config.service'
import { hostRuntime } from '../../host-runtime'
import type { NativeFunctionToolDefinition, ToolProviderDefinition } from '../../tools/types'
import type { AgentRuntime } from '../types'
import {
  describeRuntimeSelectionForUser,
  resolveRuntimeRequestSourceContext,
  resolveRuntimeSelection
} from '../routing'
import { listNativeRuntimeAdapters, resolveNativeRuntimeAdapter } from './adapters'
import { resolveNativeProviderCapability } from './capabilities'
import {
  executeNativePreparedRequest,
  NativeRuntimeRequestTimeoutError,
  NativeRuntimeUpstreamError
} from './client'
import {
  clearNativeActiveRun,
  getNativeActiveRun,
  registerNativeActiveRun,
  updateNativeActiveRunContent
} from './active-runs'
import {
  getNativeRuntimeInteractionStatus,
  type NativeRuntimeInteractionStatus
} from './interaction'
import { buildNativeRuntimeFollowupPreparedRequest } from './request'
import { executeNativeFunctionTool } from './tool-executor'
import { resolveNativeRuntimeTransportPlan, type NativeRuntimeTransportPlan } from './transport'
import {
  describeNativeUnsupportedInputKinds,
  describeNativeUpstreamError,
  getNativeUserFacingMessage
} from './user-facing'
import type {
  AgentRequest,
  Thought,
  TokenUsage,
  ToolCall
} from '../../../main/services/agent/types'
import type {
  NativeAdapterId,
  NativeAdapterStage,
  NativeNormalizedToolCall,
  NativeNormalizedUsage,
  NativeRuntimeReadinessReasonId,
  NativeSupportedApiType
} from './types'

const MAX_NATIVE_TOOL_ROUNDTRIPS = 5

export interface NativeRuntimeStatus {
  scaffolded: boolean
  ready: boolean
  readinessReasonId: NativeRuntimeReadinessReasonId | null
  endpointSupported: boolean
  adapterResolved: boolean
  adapterStage: NativeAdapterStage | null
  transportResolved: boolean
  providerNativeExecution: boolean
  sharedToolRegistryReady: boolean
  taskRoutingReady: boolean
  supportedProviders: string[]
  supportedApiTypes: NativeSupportedApiType[]
  availableAdapterIds: NativeAdapterId[]
  currentSource: string | null
  currentProvider: string | null
  currentApiType: NativeSupportedApiType | null
  sharedToolProviderIds: string[]
  nativeToolProviderIds: string[]
  adapterId: NativeAdapterId | null
  transport: NativeRuntimeTransportPlan | null
  supportsStreaming: boolean
  supportsToolCalls: boolean
  supportsUsage: boolean
  interaction: NativeRuntimeInteractionStatus
  note: string
}

const DEFAULT_NATIVE_RUNTIME_ADAPTERS = listNativeRuntimeAdapters()

const DEFAULT_NATIVE_RUNTIME_STATUS: NativeRuntimeStatus = {
  scaffolded: true,
  ready: false,
  readinessReasonId: null,
  endpointSupported: false,
  adapterResolved: false,
  adapterStage: null,
  transportResolved: false,
  providerNativeExecution: false,
  sharedToolRegistryReady: true,
  taskRoutingReady: true,
  supportedProviders: resolveSupportedProviders(),
  supportedApiTypes: resolveSupportedApiTypes(),
  availableAdapterIds: DEFAULT_NATIVE_RUNTIME_ADAPTERS.map((adapter) => adapter.id),
  currentSource: null,
  currentProvider: null,
  currentApiType: null,
  sharedToolProviderIds: [],
  nativeToolProviderIds: [],
  adapterId: null,
  transport: null,
  supportsStreaming: false,
  supportsToolCalls: false,
  supportsUsage: false,
  interaction: getNativeRuntimeInteractionStatus(),
  note: getNativeUserFacingMessage('scaffoldReadyButInactive')
}

let nativeRuntimeStatusOverride: NativeRuntimeStatus | null = null

export const nativeRuntime: AgentRuntime = {
  kind: 'native',

  async sendMessage({ request }) {
    const endpoint = await resolveNativeRuntimeEndpointForRequest(request)
    const adapterResolution = resolveNativeRuntimeAdapter(endpoint)
    const adapter = adapterResolution.adapter

    if (!adapter) {
      throw new Error(adapterResolution.reason)
    }

    const sharedToolContext = await resolveNativeSharedToolContext(request)
    const preparedRequest = adapter.prepareRequest({
      mainWindow: null,
      request,
      endpoint,
      sharedToolProviders: sharedToolContext.providers,
      nativeFunctionTools: sharedToolContext.nativeFunctionTools
    })

    if (preparedRequest.unsupportedInputKinds.length > 0) {
      throw new Error(
        getNativeUserFacingMessage('unsupportedInputs', {
          unsupportedKinds: describeNativeUnsupportedInputKinds(preparedRequest.unsupportedInputKinds)
        })
      )
    }

    const { spaceId, conversationId } = request
    const abortController = new AbortController()
    hostRuntimeSafeClearTask(conversationId)
    const config = getConfig()
    const configuredMode = config.runtime?.mode || 'claude-sdk'
    const runtimeRequestSourceContext = resolveRuntimeRequestSourceContext({
      request,
      aiSources: config.aiSources,
      fallbackModel: config.api?.model || null
    })
    const runtimeSelection = resolveRuntimeSelection({
      configuredMode: configuredMode === 'claude-sdk' ? 'hybrid' : configuredMode,
      hasNativeRuntime: true,
      request,
      currentSource: runtimeRequestSourceContext.sourceId,
      currentModel: runtimeRequestSourceContext.modelId,
      nativePolicy: config.runtime?.nativeRollout,
      nativeReadinessReasonId: 'ready',
      nativeNote: getNativeUserFacingMessage('nativeRolloutReady')
    })
    const runtimeRoute = describeRuntimeSelectionForUser(runtimeSelection)
    registerNativeActiveRun({
      spaceId,
      conversationId,
      runtimeRoute,
      startedAt: Date.now(),
      abortController,
      requestContext: {
        aiBrowserEnabled: request.aiBrowserEnabled,
        thinkingEnabled: request.thinkingEnabled,
        thinkingEffort: request.thinkingEffort,
        model: request.model,
        modelSource: request.modelSource,
        routeHint: request.routeHint,
        runtimeTaskHint: request.runtimeTaskHint
      }
    })
    await sendNativeRendererEvent('agent:start', spaceId, conversationId, {
      runtimeRoute
    })

    addMessage(spaceId, conversationId, {
      role: 'user',
      content: request.message,
      images: request.images,
      attachments: request.attachments
    })

    addMessage(spaceId, conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    })

    let streamedContent = ''
    let latestAssistantContent = ''
    let aggregatedTokenUsage: TokenUsage | null = null
    const assistantThoughts: Thought[] = []
    const assistantToolCalls = new Map<string, ToolCall>()
    let currentPreparedRequest = preparedRequest

    try {
      for (let roundtrip = 0; roundtrip < MAX_NATIVE_TOOL_ROUNDTRIPS; roundtrip += 1) {
        const executionResult = await executeNativePreparedRequest({
          preparedRequest: currentPreparedRequest,
          adapter,
          options: {
            signal: abortController.signal,
            async onStreamEvent(event) {
              if (event.kind === 'text-delta' && event.delta) {
                streamedContent += event.delta
                updateNativeActiveRunContent(conversationId, streamedContent)
                await sendNativeRendererEvent('agent:message', spaceId, conversationId, {
                  type: 'message',
                  content: streamedContent,
                  isComplete: false,
                  isStreaming: true
                })
              }

              if (event.kind === 'text-done' && typeof event.text === 'string') {
                streamedContent = event.text
                latestAssistantContent = event.text
                updateNativeActiveRunContent(conversationId, event.text)
                await sendNativeRendererEvent('agent:message', spaceId, conversationId, {
                  type: 'message',
                  content: streamedContent,
                  isComplete: false,
                  isStreaming: false
                })
              }
            }
          }
        })

        const finalResponse = executionResult.response
        if (!finalResponse) {
          throw new Error(getNativeUserFacingMessage('noFinalResponse'))
        }

        if (finalResponse.status === 'failed') {
          throw new Error(finalResponse.error?.message || getNativeUserFacingMessage('requestFailed'))
        }

        const finalContent = finalResponse.outputText || finalResponse.refusalText || ''
        if (finalContent) {
          latestAssistantContent = finalContent
          updateNativeActiveRunContent(conversationId, finalContent)
        }

        aggregatedTokenUsage = accumulateTokenUsage(
          aggregatedTokenUsage,
          mapNativeUsageToTokenUsage(finalResponse.usage)
        )

        if (finalResponse.toolCalls.length === 0) {
          if (finalResponse.status === 'incomplete' && !finalResponse.outputText) {
            throw new Error(getNativeUserFacingMessage('incomplete', {
              reason: finalResponse.incompleteReason
            }))
          }

          updateLastMessage(spaceId, conversationId, {
            content: latestAssistantContent,
            thoughts: assistantThoughts.length > 0 ? [...assistantThoughts] : undefined,
            toolCalls: assistantToolCalls.size > 0 ? Array.from(assistantToolCalls.values()) : undefined,
            tokenUsage: aggregatedTokenUsage || undefined
          })

          await sendNativeRendererEvent('agent:message', spaceId, conversationId, {
            type: 'message',
            content: latestAssistantContent,
            isComplete: true,
            isStreaming: false
          })

          await sendNativeRendererEvent('agent:complete', spaceId, conversationId, {
            type: 'complete',
            duration: 0,
            tokenUsage: aggregatedTokenUsage
          })
          return
        }

        await emitNativeToolCalls({
          spaceId,
          conversationId,
          preparedTools: currentPreparedRequest.nativeTools,
          toolCalls: finalResponse.toolCalls,
          assistantThoughts,
          assistantToolCalls
        })

        const toolOutputs = []
        for (const toolCall of finalResponse.toolCalls) {
          if (abortController.signal.aborted) {
            throw new Error(getNativeUserFacingMessage('requestCancelled'))
          }

          const preparedTool = currentPreparedRequest.nativeTools.find((tool) => tool.name === toolCall.name)
          const result = preparedTool
            ? await executeNativeFunctionTool({
                mcpServers: sharedToolContext.mcpServers,
                tool: preparedTool,
                args: parseNativeToolArguments(toolCall.argumentsText),
                workDir: sharedToolContext.workDir,
                spaceId,
                conversationId
              })
            : {
                outputText: `Tool ${toolCall.name} is not available in the current native tool registry.`,
                isError: true
              }

          await emitNativeToolResult({
            spaceId,
            conversationId,
            preparedTools: currentPreparedRequest.nativeTools,
            toolCall,
            assistantThoughts,
            assistantToolCalls,
            resultText: result.outputText,
            isError: result.isError
          })

          toolOutputs.push({
            toolCall,
            outputText: result.outputText,
            isError: result.isError
          })
        }

        if (abortController.signal.aborted) {
          throw new Error(getNativeUserFacingMessage('requestCancelled'))
        }

        updateLastMessage(spaceId, conversationId, {
          content: latestAssistantContent,
          thoughts: [...assistantThoughts],
          toolCalls: Array.from(assistantToolCalls.values()),
          tokenUsage: aggregatedTokenUsage || undefined
        })

        currentPreparedRequest = buildNativeRuntimeFollowupPreparedRequest({
          preparedRequest: currentPreparedRequest,
          previousResponseId: finalResponse.responseId,
          assistantResponseText: finalContent,
          toolOutputs
        })
      }

      throw new Error(getNativeUserFacingMessage('tooManyToolSteps'))
    } catch (error) {
      const activeRun = getNativeActiveRun(conversationId)
      const suppressedByInject = activeRun?.abortReason === 'inject'
      const normalized = normalizeNativeSendError(error)
      if (!suppressedByInject) {
        await sendNativeRendererEvent('agent:error', spaceId, conversationId, {
          type: 'error',
          error: normalized.message,
          errorCode: normalized.errorCode
        })
      }

      if (error instanceof NativeRuntimeUpstreamError) {
        throw new NativeRuntimeUpstreamError({
          code: error.code,
          message: normalized.message,
          statusCode: error.statusCode,
          statusText: error.statusText,
          responseText: error.responseText
        })
      }

      if (error instanceof Error) {
        throw new Error(normalized.message)
      }

      throw new Error(normalized.message)
    } finally {
      clearNativeActiveRun(conversationId)
    }
  },

  async ensureSessionWarm() {
    // Native runtime adapters may later opt into warm-session behavior.
  }
}

export interface ResolveNativeRuntimeStatusInput {
  endpoint?: RuntimeEndpoint | null
  sharedToolProviders?: ToolProviderDefinition[]
}

export function resolveNativeRuntimeStatus(
  input: ResolveNativeRuntimeStatusInput = {}
): NativeRuntimeStatus {
  const sharedToolProviders = input.sharedToolProviders || []
  const nativeToolProviders = sharedToolProviders.filter((provider) => provider.runtimeKinds.includes('native'))
  const endpoint = input.endpoint || null
  const capability = resolveNativeProviderCapability(endpoint)
  const transportResolution = resolveNativeRuntimeTransportPlan(endpoint)
  const endpointSupported = capability.supported
  const sharedToolRegistryReady = nativeToolProviders.length > 0
  const ready = endpointSupported && sharedToolRegistryReady
  const readinessReasonId = resolveNativeRuntimeReadinessReasonId({
    capabilityReasonId: capability.reasonId,
    sharedToolRegistryReady,
    ready
  })

  return {
    scaffolded: true,
    ready,
    readinessReasonId,
    endpointSupported,
    adapterResolved: capability.adapterId !== null,
    adapterStage: capability.adapterStage,
    transportResolved: transportResolution.plan !== null,
    providerNativeExecution: capability.providerNativeExecution,
    sharedToolRegistryReady,
    taskRoutingReady: true,
    supportedProviders: resolveSupportedProviders(),
    supportedApiTypes: resolveSupportedApiTypes(),
    availableAdapterIds: DEFAULT_NATIVE_RUNTIME_ADAPTERS.map((adapter) => adapter.id),
    currentSource: endpoint?.source || endpoint?.requestedSource || null,
    currentProvider: endpoint?.provider || null,
    currentApiType: endpoint?.provider === 'anthropic'
      ? 'messages'
      : (endpoint?.apiType || null),
    sharedToolProviderIds: sharedToolProviders.map((provider) => provider.id),
    nativeToolProviderIds: nativeToolProviders.map((provider) => provider.id),
    adapterId: capability.adapterId,
    transport: transportResolution.plan,
    supportsStreaming: capability.supportsStreaming,
    supportsToolCalls: capability.supportsToolCalls,
    supportsUsage: capability.supportsUsage,
    interaction: getNativeRuntimeInteractionStatus(),
    note: resolveNativeRuntimeNote({
      capabilityReason: capability.reason,
      sharedToolRegistryReady,
      providerNativeExecution: capability.providerNativeExecution
    })
  }
}

function resolveNativeRuntimeNote(params: {
  capabilityReason: string
  sharedToolRegistryReady: boolean
  providerNativeExecution: boolean
}): string {
  if (!params.sharedToolRegistryReady) {
    return getNativeUserFacingMessage('sharedToolsNotReady')
  }

  if (params.providerNativeExecution) {
    return params.capabilityReason
  }

  return params.capabilityReason
}

function resolveNativeRuntimeReadinessReasonId(params: {
  capabilityReasonId: ReturnType<typeof resolveNativeProviderCapability>['reasonId']
  sharedToolRegistryReady: boolean
  ready: boolean
}): NativeRuntimeReadinessReasonId {
  if (params.ready) {
    return 'ready'
  }

  if (!params.sharedToolRegistryReady) {
    return 'shared-tools-missing'
  }

  if (params.capabilityReasonId === 'supported') {
    return 'ready'
  }

  return params.capabilityReasonId
}

function resolveSupportedProviders(): string[] {
  return Array.from(new Set(
    DEFAULT_NATIVE_RUNTIME_ADAPTERS.flatMap((adapter) => adapter.providerIds)
  ))
}

function resolveSupportedApiTypes(): NativeSupportedApiType[] {
  return Array.from(new Set(
    DEFAULT_NATIVE_RUNTIME_ADAPTERS.flatMap((adapter) => adapter.apiTypes)
  ))
}

export function getNativeRuntimeStatus(
  input?: ResolveNativeRuntimeStatusInput
): NativeRuntimeStatus {
  if (nativeRuntimeStatusOverride) {
    return {
      ...nativeRuntimeStatusOverride,
      supportedProviders: [...nativeRuntimeStatusOverride.supportedProviders],
      supportedApiTypes: [...nativeRuntimeStatusOverride.supportedApiTypes],
    availableAdapterIds: [...nativeRuntimeStatusOverride.availableAdapterIds],
    sharedToolProviderIds: [...nativeRuntimeStatusOverride.sharedToolProviderIds],
    nativeToolProviderIds: [...nativeRuntimeStatusOverride.nativeToolProviderIds],
    interaction: {
      ...nativeRuntimeStatusOverride.interaction
    }
  }
  }

  if (input) {
    return resolveNativeRuntimeStatus(input)
  }

  return {
    ...DEFAULT_NATIVE_RUNTIME_STATUS,
    supportedProviders: [...DEFAULT_NATIVE_RUNTIME_STATUS.supportedProviders],
    supportedApiTypes: [...DEFAULT_NATIVE_RUNTIME_STATUS.supportedApiTypes],
    availableAdapterIds: [...DEFAULT_NATIVE_RUNTIME_STATUS.availableAdapterIds],
    sharedToolProviderIds: [...DEFAULT_NATIVE_RUNTIME_STATUS.sharedToolProviderIds],
    nativeToolProviderIds: [...DEFAULT_NATIVE_RUNTIME_STATUS.nativeToolProviderIds],
    interaction: {
      ...getNativeRuntimeInteractionStatus()
    }
  }
}

export function setNativeRuntimeStatusForTests(
  status: Partial<NativeRuntimeStatus> | null
): void {
  if (!status) {
    nativeRuntimeStatusOverride = null
    return
  }

  nativeRuntimeStatusOverride = {
    ...DEFAULT_NATIVE_RUNTIME_STATUS,
    ...status,
    supportedProviders: status.supportedProviders
      ? [...status.supportedProviders]
      : [...DEFAULT_NATIVE_RUNTIME_STATUS.supportedProviders],
    supportedApiTypes: status.supportedApiTypes
      ? [...status.supportedApiTypes]
      : [...DEFAULT_NATIVE_RUNTIME_STATUS.supportedApiTypes],
    availableAdapterIds: status.availableAdapterIds
      ? [...status.availableAdapterIds]
      : [...DEFAULT_NATIVE_RUNTIME_STATUS.availableAdapterIds],
    sharedToolProviderIds: status.sharedToolProviderIds
      ? [...status.sharedToolProviderIds]
      : [...DEFAULT_NATIVE_RUNTIME_STATUS.sharedToolProviderIds],
    nativeToolProviderIds: status.nativeToolProviderIds
      ? [...status.nativeToolProviderIds]
      : [...DEFAULT_NATIVE_RUNTIME_STATUS.nativeToolProviderIds],
    interaction: {
      ...DEFAULT_NATIVE_RUNTIME_STATUS.interaction,
      ...status.interaction
    }
  }
}

async function resolveNativeRuntimeEndpointForRequest(request: { modelSource?: string; model?: string }) {
  const { getAISourceManager } = await import('../../../main/services/ai-sources')
  const manager = getAISourceManager()
  await manager.ensureInitialized()

  const endpoint = manager.resolveRuntimeEndpoint(request.modelSource)
  if (!endpoint) {
    throw new Error(getNativeUserFacingMessage('noEndpoint'))
  }

  return request.model
    ? {
        ...endpoint,
        model: request.model
      }
    : endpoint
}

async function resolveNativeSharedToolContext(request: Pick<AgentRequest, 'spaceId' | 'conversationId' | 'aiBrowserEnabled' | 'ralphMode'>): Promise<{
  mcpServers: Record<string, unknown>
  providers: ToolProviderDefinition[]
  nativeFunctionTools: NativeFunctionToolDefinition[]
  workDir: string
}> {
  const config = getConfig()
  const { getWorkingDir } = await import('../../../main/services/agent/helpers')
  const { buildRuntimeToolBundle } = await import('../../tools')

  const workDir = request.ralphMode?.projectDir || getWorkingDir(request.spaceId)
  const bundle = await buildRuntimeToolBundle({
    conversationId: request.conversationId,
    spaceId: request.spaceId,
    workDir,
    config,
    aiBrowserEnabled: request.aiBrowserEnabled,
    includeSkillMcp: true,
    includeSubagentTools: true
  })

  return {
    mcpServers: bundle.claudeSdk.mcpServers,
    providers: bundle.native.providers,
    workDir,
    nativeFunctionTools: bundle.native.functionTools
  }
}

function mapNativeUsageToTokenUsage(
  usage: NativeNormalizedUsage | null
): TokenUsage | null {
  if (!usage) {
    return null
  }

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cachedInputTokens,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    contextWindow: 0
  }
}

function accumulateTokenUsage(
  current: TokenUsage | null,
  next: TokenUsage | null
): TokenUsage | null {
  if (!current) {
    return next
  }

  if (!next) {
    return current
  }

  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
    cacheCreationTokens: current.cacheCreationTokens + next.cacheCreationTokens,
    totalCostUsd: current.totalCostUsd + next.totalCostUsd,
    contextWindow: Math.max(current.contextWindow, next.contextWindow)
  }
}

function normalizeNativeSendError(error: unknown): { message: string; errorCode?: number } {
  if (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
  ) {
    return {
      message: getNativeUserFacingMessage('requestCancelled')
    }
  }

  if (error instanceof NativeRuntimeUpstreamError) {
    return {
      message: describeNativeUpstreamError({
        code: error.code,
        statusCode: error.statusCode,
        fallbackMessage: error.message
      }),
      errorCode: error.statusCode
    }
  }

  if (error instanceof NativeRuntimeRequestTimeoutError) {
    return {
      message: getNativeUserFacingMessage('requestTimedOut', {
        minutes: Math.max(1, Math.round(error.timeoutMs / 60_000))
      })
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message
    }
  }

  return {
    message: getNativeUserFacingMessage('requestFailed')
  }
}

function resolveNativeToolDisplayName(
  preparedTools: NativeFunctionToolDefinition[],
  nativeToolName: string
): string {
  return preparedTools.find((tool) => tool.name === nativeToolName)?.sourceToolName || nativeToolName
}

function parseNativeToolArguments(argumentsText: string): Record<string, unknown> {
  if (!argumentsText.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(argumentsText) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return {
      value: parsed,
      rawArguments: argumentsText
    }
  } catch {
    return {
      rawArguments: argumentsText
    }
  }
}

function createNativeToolUseThought(params: {
  toolCall: NativeNormalizedToolCall
  preparedTools: NativeFunctionToolDefinition[]
}): Thought {
  const toolName = resolveNativeToolDisplayName(params.preparedTools, params.toolCall.name)

  return {
    id: params.toolCall.id,
    type: 'tool_use',
    content: `Tool call: ${toolName}`,
    timestamp: new Date().toISOString(),
    toolName,
    toolInput: parseNativeToolArguments(params.toolCall.argumentsText)
  }
}

function createNativeToolResultThought(params: {
  toolCall: NativeNormalizedToolCall
  preparedTools: NativeFunctionToolDefinition[]
  resultText: string
  isError: boolean
}): Thought {
  const toolName = resolveNativeToolDisplayName(params.preparedTools, params.toolCall.name)

  return {
    id: params.toolCall.id,
    type: 'tool_result',
    content: `Tool result: ${toolName}`,
    timestamp: new Date().toISOString(),
    toolName,
    toolOutput: params.resultText,
    isError: params.isError
  }
}

async function emitNativeThought(
  spaceId: string,
  conversationId: string,
  thought: Thought
): Promise<void> {
  await sendNativeRendererEvent('agent:thought', spaceId, conversationId, { thought })
}

async function emitNativeToolCalls(params: {
  spaceId: string
  conversationId: string
  preparedTools: NativeFunctionToolDefinition[]
  toolCalls: NativeNormalizedToolCall[]
  assistantThoughts: Thought[]
  assistantToolCalls: Map<string, ToolCall>
}): Promise<void> {
  for (const toolCall of params.toolCalls) {
    if (params.assistantToolCalls.has(toolCall.id)) {
      continue
    }

    const thought = createNativeToolUseThought({
      toolCall,
      preparedTools: params.preparedTools
    })
    params.assistantThoughts.push(thought)
    await emitNativeThought(params.spaceId, params.conversationId, thought)

    const rendererToolCall: ToolCall = {
      id: toolCall.id,
      name: thought.toolName || toolCall.name,
      status: 'running',
      input: thought.toolInput || {}
    }

    params.assistantToolCalls.set(toolCall.id, rendererToolCall)
    await sendNativeRendererEvent(
      'agent:tool-call',
      params.spaceId,
      params.conversationId,
      rendererToolCall as unknown as Record<string, unknown>
    )
  }
}

async function emitNativeToolResult(params: {
  spaceId: string
  conversationId: string
  preparedTools: NativeFunctionToolDefinition[]
  toolCall: NativeNormalizedToolCall
  assistantThoughts: Thought[]
  assistantToolCalls: Map<string, ToolCall>
  resultText: string
  isError: boolean
}): Promise<void> {
  const existing = params.assistantToolCalls.get(params.toolCall.id)
  const thought = createNativeToolResultThought({
    toolCall: params.toolCall,
    preparedTools: params.preparedTools,
    resultText: params.resultText,
    isError: params.isError
  })

  params.assistantThoughts.push(thought)
  await emitNativeThought(params.spaceId, params.conversationId, thought)

  params.assistantToolCalls.set(params.toolCall.id, {
    id: params.toolCall.id,
    name: thought.toolName || existing?.name || params.toolCall.name,
    status: params.isError ? 'error' : 'success',
    input: existing?.input || parseNativeToolArguments(params.toolCall.argumentsText),
    output: params.isError ? undefined : params.resultText,
    error: params.isError ? params.resultText : undefined
  })

  await sendNativeRendererEvent('agent:tool-result', params.spaceId, params.conversationId, {
    type: 'tool_result',
    toolId: params.toolCall.id,
    result: params.resultText,
    isError: params.isError
  })
}

function hostRuntimeSafeClearTask(conversationId: string): void {
  try {
    hostRuntime.stepReporter.clearTask(conversationId)
  } catch {
    // Ignore if host runtime is unavailable during tests.
  }
}

async function sendNativeRendererEvent(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { sendToRenderer } = await import('../../../main/services/agent/helpers')
  sendToRenderer(channel, spaceId, conversationId, data)
}
