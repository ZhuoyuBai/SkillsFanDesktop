import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import type {
  OpenAIResponsesRequest,
  OpenAIResponsesResponse,
  OpenAIResponsesStreamEvent
} from '../../../main/openai-compat-router/types/openai-responses'
import type {
  NativeFunctionToolDefinition,
  ToolProviderDefinition
} from '../../tools/types'
import type { RuntimeSendMessageInput, RuntimeWarmSessionInput } from '../types'
import { getNativeUserFacingMessage } from './user-facing'

export type NativeAdapterId = 'openai-responses' | 'openai-codex-responses'
export type NativeAdapterStage = 'scaffolded' | 'ready'
export type NativeSupportedApiType = 'chat_completions' | 'responses'

export interface PrepareNativeRuntimeRequestInput extends RuntimeSendMessageInput {
  endpoint: RuntimeEndpoint
  sharedToolProviders?: ToolProviderDefinition[]
  nativeFunctionTools?: NativeFunctionToolDefinition[]
}

export interface NativePreparedRequest {
  adapterId: NativeAdapterId
  adapterDisplayName: string
  method: 'POST'
  url: string
  headers: Record<string, string>
  body: OpenAIResponsesRequest
  stream: boolean
  toolProviderIds: string[]
  nativeTools: NativeFunctionToolDefinition[]
  unsupportedInputKinds: string[]
}

export interface NativeNormalizedUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

export interface NativeNormalizedToolCall {
  id: string
  name: string
  argumentsText: string
  status: 'in_progress' | 'completed'
}

export interface NativeNormalizedResponse {
  responseId: string
  model: string
  status: 'in_progress' | 'completed' | 'incomplete' | 'failed'
  outputText: string
  refusalText: string | null
  toolCalls: NativeNormalizedToolCall[]
  usage: NativeNormalizedUsage | null
  incompleteReason: string | null
  error: { code: string; message: string } | null
}

export type NativeNormalizedStreamEventKind =
  | 'response-created'
  | 'response-in-progress'
  | 'response-completed'
  | 'response-incomplete'
  | 'response-failed'
  | 'text-delta'
  | 'text-done'
  | 'tool-call-arguments-delta'
  | 'tool-call-arguments-done'
  | 'error'

export interface NativeNormalizedStreamEvent {
  kind: NativeNormalizedStreamEventKind
  responseId?: string
  model?: string
  status?: 'in_progress' | 'completed' | 'incomplete' | 'failed'
  delta?: string
  text?: string
  callId?: string
  outputIndex?: number
  usage?: NativeNormalizedUsage | null
  incompleteReason?: string | null
  errorCode?: string
  errorMessage?: string
}

export interface NativeRuntimeAdapter {
  id: NativeAdapterId
  displayName: string
  providerIds: string[]
  sourceIds: string[]
  apiTypes: NativeSupportedApiType[]
  stage: NativeAdapterStage
  providerNativeExecution: boolean
  supportsStreaming: boolean
  supportsToolCalls: boolean
  supportsUsage: boolean
  note: string
  matches(endpoint: RuntimeEndpoint): boolean
  prepareRequest(input: PrepareNativeRuntimeRequestInput): NativePreparedRequest
  normalizeResponse(response: OpenAIResponsesResponse): NativeNormalizedResponse
  normalizeStreamEvent(event: OpenAIResponsesStreamEvent): NativeNormalizedStreamEvent
  sendMessage(input: RuntimeSendMessageInput & { endpoint: RuntimeEndpoint }): Promise<void>
  ensureSessionWarm?(input: RuntimeWarmSessionInput & { endpoint: RuntimeEndpoint }): Promise<void>
}

export interface NativeRuntimeAdapterResolution {
  adapter: NativeRuntimeAdapter | null
  reason: string
}

export function createScaffoldedNativeAdapterError(adapter: NativeRuntimeAdapter): Error {
  return new Error(getNativeUserFacingMessage('requestFailed'))
}
