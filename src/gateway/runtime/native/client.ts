import type { OpenAIResponsesResponse, OpenAIResponsesStreamEvent } from '../../../main/openai-compat-router/types/openai-responses'
import type {
  NativeNormalizedResponse,
  NativeNormalizedStreamEvent,
  NativePreparedRequest,
  NativeRuntimeAdapter
} from './types'
import { describeNativeUpstreamError } from './user-facing'

export interface NativePreparedRequestExecutionResult {
  statusCode: number
  statusText: string
  headers: Record<string, string>
  response: NativeNormalizedResponse | null
  streamEvents: NativeNormalizedStreamEvent[]
}

export interface ExecuteNativePreparedRequestOptions {
  fetchImpl?: typeof fetch
  onStreamEvent?: (event: NativeNormalizedStreamEvent) => void | Promise<void>
  signal?: AbortSignal
}

export class NativeRuntimeUpstreamError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly statusText: string
  readonly responseText: string

  constructor(params: {
    code: string
    message: string
    statusCode: number
    statusText: string
    responseText: string
  }) {
    super(params.message)
    this.name = 'NativeRuntimeUpstreamError'
    this.code = params.code
    this.statusCode = params.statusCode
    this.statusText = params.statusText
    this.responseText = params.responseText
  }
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

async function parseUpstreamError(response: Response): Promise<never> {
  const responseText = await response.text().catch(() => '')
  const parsed = safeJsonParse<{ error?: { code?: string; message?: string }; message?: string }>(responseText)
  const code = parsed?.error?.code || 'upstream_error'
  const message = describeNativeUpstreamError({
    code,
    statusCode: response.status,
    fallbackMessage: parsed?.error?.message || parsed?.message
  })

  throw new NativeRuntimeUpstreamError({
    code,
    message,
    statusCode: response.status,
    statusText: response.statusText,
    responseText
  })
}

function parseSSELines(buffer: string): { lines: string[]; remaining: string } {
  const lines = buffer.split('\n')
  const remaining = lines.pop() || ''
  return { lines, remaining }
}

function parseSSEData(line: string): { data: string | null; isDone: boolean } {
  if (!line.startsWith('data:')) {
    return { data: null, isDone: false }
  }

  const data = line.slice(5).trim()
  if (data === '[DONE]') {
    return { data: null, isDone: true }
  }

  return { data, isDone: false }
}

async function processNativeSSEStream(params: {
  response: Response
  adapter: NativeRuntimeAdapter
  onStreamEvent?: (event: NativeNormalizedStreamEvent) => void | Promise<void>
}): Promise<{ streamEvents: NativeNormalizedStreamEvent[]; finalResponse: NativeNormalizedResponse | null }> {
  const body = params.response.body
  if (!body) {
    return {
      streamEvents: [],
      finalResponse: null
    }
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResponse: NativeNormalizedResponse | null = null
  const streamEvents: NativeNormalizedStreamEvent[] = []

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSELines(buffer)
    buffer = parsed.remaining

    for (const line of parsed.lines) {
      const { data, isDone } = parseSSEData(line)
      if (isDone) {
        return { streamEvents, finalResponse }
      }

      if (!data) {
        continue
      }

      const rawEvent = safeJsonParse<OpenAIResponsesStreamEvent>(data)
      if (!rawEvent) {
        continue
      }

      const normalizedEvent = params.adapter.normalizeStreamEvent(rawEvent)
      streamEvents.push(normalizedEvent)

      if ('response' in rawEvent && rawEvent.response) {
        finalResponse = params.adapter.normalizeResponse(rawEvent.response)
      }

      if (params.onStreamEvent) {
        await params.onStreamEvent(normalizedEvent)
      }
    }
  }

  return { streamEvents, finalResponse }
}

export async function executeNativePreparedRequest(params: {
  preparedRequest: NativePreparedRequest
  adapter: NativeRuntimeAdapter
  options?: ExecuteNativePreparedRequestOptions
}): Promise<NativePreparedRequestExecutionResult> {
  const fetchImpl = params.options?.fetchImpl || fetch
  const response = await fetchImpl(params.preparedRequest.url, {
    method: params.preparedRequest.method,
    headers: params.preparedRequest.headers,
    body: JSON.stringify(params.preparedRequest.body),
    signal: params.options?.signal
  })

  if (!response.ok) {
    await parseUpstreamError(response)
  }

  const headers = responseHeadersToObject(response.headers)

  if (!params.preparedRequest.stream) {
    const payload = await response.json() as OpenAIResponsesResponse
    return {
      statusCode: response.status,
      statusText: response.statusText,
      headers,
      response: params.adapter.normalizeResponse(payload),
      streamEvents: []
    }
  }

  const streamed = await processNativeSSEStream({
    response,
    adapter: params.adapter,
    onStreamEvent: params.options?.onStreamEvent
  })

  return {
    statusCode: response.status,
    statusText: response.statusText,
    headers,
    response: streamed.finalResponse,
    streamEvents: streamed.streamEvents
  }
}
