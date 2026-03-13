import { getConfig } from '../../../main/services/config.service'
import { getSharedToolPermissionPolicy } from '../../tools/policies'
import { NATIVE_BUILTIN_PROVIDER_ID } from '../../tools/types'
import type { NativeFunctionToolDefinition } from '../../tools/types'
import path from 'node:path'
import { requestNativeToolApproval, requestNativeUserQuestion } from './interaction'
import { normalizeNativeQuestionInput } from './question-shaping'
import { getNativeUserFacingMessage } from './user-facing'

interface NativeToolContext {
  signal: AbortSignal
  sessionId?: string
  _meta?: Record<string, unknown>
  requestId: string
  sendNotification: (notification: Record<string, unknown>) => Promise<void>
  sendRequest: (
    request: Record<string, unknown>,
    schema?: unknown,
    options?: Record<string, unknown>
  ) => Promise<unknown>
}

interface NativeToolHandlerResult {
  content?: Array<{ type?: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}

interface RegisteredSdkTool {
  inputSchema?: unknown
  enabled?: boolean
  handler: ((input: Record<string, unknown>, context: NativeToolContext) => Promise<NativeToolHandlerResult>)
    | ((context: NativeToolContext) => Promise<NativeToolHandlerResult>)
}

export interface ExecuteNativeFunctionToolInput {
  mcpServers: Record<string, unknown>
  tool: NativeFunctionToolDefinition
  args: Record<string, unknown>
  workDir: string
  spaceId?: string
  conversationId?: string
}

export interface ExecutedNativeFunctionToolResult {
  outputText: string
  isError: boolean
}

function isSdkServerConfig(value: unknown): value is { instance: { _registeredTools?: Record<string, RegisteredSdkTool> } } {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'sdk'
      && 'instance' in (value as Record<string, unknown>)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseToolInputSchema(
  inputSchema: unknown,
  args: Record<string, unknown>
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!inputSchema || !isRecord(inputSchema) || typeof (inputSchema as { safeParse?: unknown }).safeParse !== 'function') {
    return { ok: true, value: args }
  }

  const result = (inputSchema as { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { message?: string } } }).safeParse(args)
  if (!result.success) {
    return {
      ok: false,
      message: getNativeUserFacingMessage('toolInputInvalid')
    }
  }

  return {
    ok: true,
    value: isRecord(result.data) ? result.data : {}
  }
}

function ensurePathsWithinWorkspace(input: Record<string, unknown>, workDir: string): string | null {
  const absoluteWorkDir = path.resolve(workDir)
  const candidates = [
    input.file_path,
    input.path,
    input.notebook_path,
    input.old_path,
    input.new_path
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const pathParam of candidates) {
    const absolutePath = path.isAbsolute(pathParam)
      ? path.resolve(pathParam)
      : path.resolve(absoluteWorkDir, pathParam)
    const isWithinWorkDir =
      absolutePath.startsWith(`${absoluteWorkDir}${path.sep}`) || absolutePath === absoluteWorkDir

    if (!isWithinWorkDir) {
      return `Can only access files within the current space: ${workDir}`
    }
  }

  return null
}

function normalizeToolOutput(result: NativeToolHandlerResult | unknown): ExecutedNativeFunctionToolResult {
  if (typeof result === 'string') {
    return {
      outputText: result,
      isError: false
    }
  }

  if (!result || typeof result !== 'object') {
    return {
      outputText: JSON.stringify(result),
      isError: false
    }
  }

  const typedResult = result as NativeToolHandlerResult
  const textContent = Array.isArray(typedResult.content)
    ? typedResult.content
        .filter((item): item is { text: string } => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
    : ''

  if (textContent.trim()) {
    return {
      outputText: textContent,
      isError: Boolean(typedResult.isError)
    }
  }

  if (typeof typedResult.structuredContent !== 'undefined') {
    return {
      outputText: JSON.stringify(typedResult.structuredContent, null, 2),
      isError: Boolean(typedResult.isError)
    }
  }

  return {
    outputText: '',
    isError: Boolean(typedResult.isError)
  }
}

async function executeNativeBuiltInTool(
  input: ExecuteNativeFunctionToolInput
): Promise<ExecutedNativeFunctionToolResult> {
  if (input.tool.sourceToolName !== 'AskUserQuestion') {
    return {
      outputText: getNativeUserFacingMessage('toolUnavailable'),
      isError: true
    }
  }

  if (!input.spaceId || !input.conversationId) {
    return {
      outputText: getNativeUserFacingMessage('questionUnavailable'),
      isError: true
    }
  }

  const normalizedQuestion = normalizeNativeQuestionInput(input.args)
  if (!normalizedQuestion) {
    return {
      outputText: getNativeUserFacingMessage('toolInputInvalid'),
      isError: true
    }
  }

  const answers = await requestNativeUserQuestion({
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    toolId: `${input.tool.name}-${Date.now()}`,
    questions: [normalizedQuestion]
  })

  const primaryAnswer = answers[normalizedQuestion.question] || Object.values(answers)[0] || ''
  return {
    outputText: JSON.stringify({
      question: normalizedQuestion.question,
      answers,
      primaryAnswer
    }, null, 2),
    isError: false
  }
}

function buildNativeToolContext(): NativeToolContext {
  return {
    signal: AbortSignal.timeout(60_000),
    requestId: `native-tool-${Date.now()}`,
    sendNotification: async () => undefined,
    sendRequest: async () => {
      throw new Error(getNativeUserFacingMessage('nestedRequestsNotSupported'))
    }
  }
}

async function authorizeNativeToolExecution(params: {
  toolName: string
  input: Record<string, unknown>
  workDir: string
  spaceId?: string
  conversationId?: string
}): Promise<{ ok: true; input: Record<string, unknown> } | { ok: false; message: string }> {
  const sharedPolicy = getSharedToolPermissionPolicy(params.toolName)
  const config = getConfig()

  if (!sharedPolicy) {
    return { ok: true, input: params.input }
  }

  if (sharedPolicy.kind === 'allow') {
    return { ok: true, input: params.input }
  }

  if (sharedPolicy.kind === 'sanitize-web-search') {
    return { ok: true, input: params.input }
  }

  if (sharedPolicy.kind === 'workspace-paths') {
    const violation = ensurePathsWithinWorkspace(params.input, params.workDir)
    return violation ? { ok: false, message: violation } : { ok: true, input: params.input }
  }

  if (sharedPolicy.kind === 'system-browser-only') {
    if (config.browserAutomation?.mode !== 'system-browser') {
      return {
        ok: false,
        message: getNativeUserFacingMessage('systemBrowserOnly')
      }
    }

    return { ok: true, input: params.input }
  }

  if (sharedPolicy.kind === 'command-approval') {
    const permission = config.permissions?.commandExecution
    const trustMode = Boolean(config.permissions?.trustMode)

    if (permission === 'deny') {
      return {
        ok: false,
        message: getNativeUserFacingMessage('commandDisabled')
      }
    }

      if (permission === 'ask' && !trustMode) {
        if (!params.spaceId || !params.conversationId || !sharedPolicy.getApprovalDescription) {
          return {
            ok: false,
            message: getNativeUserFacingMessage('approvalUnavailable')
          }
        }

        const approved = await requestNativeToolApproval({
          spaceId: params.spaceId,
          conversationId: params.conversationId,
          toolName: params.toolName,
          input: params.input,
          description: sharedPolicy.getApprovalDescription(params.input)
        })

        if (!approved) {
          return {
            ok: false,
            message: getNativeUserFacingMessage('commandRejected')
          }
        }

        return {
          ok: true,
          input: params.input
        }
      }

    return { ok: true, input: params.input }
  }

  return { ok: true, input: params.input }
}

export async function executeNativeFunctionTool(
  input: ExecuteNativeFunctionToolInput
): Promise<ExecutedNativeFunctionToolResult> {
  if (input.tool.providerId === NATIVE_BUILTIN_PROVIDER_ID) {
    return executeNativeBuiltInTool(input)
  }

  const server = input.mcpServers[input.tool.providerId]
  if (!isSdkServerConfig(server)) {
    return {
      outputText: getNativeUserFacingMessage('providerUnsupported'),
      isError: true
    }
  }

  const registeredTool = server.instance._registeredTools?.[input.tool.sourceToolName]
  if (!registeredTool || registeredTool.enabled === false) {
    return {
      outputText: getNativeUserFacingMessage('toolUnavailable'),
      isError: true
    }
  }

  const inputValidation = parseToolInputSchema(registeredTool.inputSchema, input.args)
  if (!inputValidation.ok) {
    return {
      outputText: inputValidation.message,
      isError: true
    }
  }

  const permissionResult = await authorizeNativeToolExecution({
    toolName: input.tool.name,
    input: inputValidation.value,
    workDir: input.workDir,
    spaceId: input.spaceId,
    conversationId: input.conversationId
  })
  if (!permissionResult.ok) {
    return {
      outputText: permissionResult.message,
      isError: true
    }
  }

  try {
    const context = buildNativeToolContext()
    const executionResult = registeredTool.inputSchema
      ? await (registeredTool.handler as (args: Record<string, unknown>, context: NativeToolContext) => Promise<NativeToolHandlerResult>)(permissionResult.input, context)
      : await (registeredTool.handler as (context: NativeToolContext) => Promise<NativeToolHandlerResult>)(context)

    return normalizeToolOutput(executionResult)
  } catch (error) {
    return {
      outputText: error instanceof Error ? error.message : String(error),
      isError: true
    }
  }
}
