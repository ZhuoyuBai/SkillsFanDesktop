import { getAISourceManager } from '../../main/services/ai-sources'
import { getConfig } from '../../main/services/config.service'
import { getEnabledExtensions } from '../../main/services/extension'
import { runDesktopSmokeFlow } from '../host-runtime/desktop/smoke-flows'
import { buildSharedToolProviderDefinitions } from '../tools/providers'
import { resolveNativeRuntimeAdapter } from './native/adapters'
import { executeNativePreparedRequest } from './native/client'
import { resolveNativeRuntimeStatus } from './native/runtime'
import { getNativeUserFacingMessage } from './native/user-facing'
import {
  getNativeRolloutTrialSnapshot,
  setNativeRolloutTrialSnapshot
} from './rollout-trials'
import type {
  NativeRolloutTrialCheckResult,
  NativeRolloutTrialResult,
  NativeRolloutValidationId
} from './rollout-types'

const FIRST_BATCH_TRIAL_IDS: NativeRolloutValidationId[] = [
  'chat-simple',
  'browser-simple',
  'terminal-simple'
]

class NativeRolloutAcceptanceError extends Error {
  readonly checks: NativeRolloutTrialCheckResult[]

  constructor(message: string, checks: NativeRolloutTrialCheckResult[]) {
    super(message)
    this.name = 'NativeRolloutAcceptanceError'
    this.checks = checks
  }
}

export async function runNativeRolloutAcceptance(args: {
  targetId: NativeRolloutValidationId | 'all'
  workDir?: string
}): Promise<NativeRolloutTrialResult[]> {
  const targetIds = args.targetId === 'all' ? FIRST_BATCH_TRIAL_IDS : [args.targetId]
  const results: NativeRolloutTrialResult[] = []

  for (const id of targetIds) {
    results.push(await runSingleNativeRolloutAcceptance({
      id,
      workDir: args.workDir
    }))
  }

  return results
}

async function runSingleNativeRolloutAcceptance(args: {
  id: NativeRolloutValidationId
  workDir?: string
}): Promise<NativeRolloutTrialResult> {
  const existingRun = getNativeRolloutTrialSnapshot(args.id)
  if (existingRun?.state === 'running') {
    return existingRun
  }

  const runningRun = setNativeRolloutTrialSnapshot({
    id: args.id,
    state: 'running',
    startedAt: new Date().toISOString(),
    summary: resolveRunningSummary(args.id),
    error: null,
    checks: []
  })

  try {
    const checks = await runAcceptanceChecks({
      id: args.id,
      workDir: args.workDir
    })

    return finalizeNativeRolloutAcceptance({
      base: runningRun,
      state: 'passed',
      summary: resolveSuccessSummary(args.id),
      checks
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return finalizeNativeRolloutAcceptance({
      base: runningRun,
      state: 'failed',
      summary: resolveFailureSummary(args.id),
      error: message,
      checks: error instanceof NativeRolloutAcceptanceError ? error.checks : []
    })
  }
}

function finalizeNativeRolloutAcceptance(args: {
  base: NativeRolloutTrialResult
  state: 'passed' | 'failed'
  summary: string
  error?: string | null
  checks: NativeRolloutTrialCheckResult[]
}): NativeRolloutTrialResult {
  const finishedAt = new Date().toISOString()
  const durationMs = Date.parse(finishedAt) - Date.parse(args.base.startedAt)

  return setNativeRolloutTrialSnapshot({
    ...args.base,
    state: args.state,
    finishedAt,
    durationMs,
    summary: args.summary,
    error: args.error ?? null,
    checks: args.checks
  })
}

async function runAcceptanceChecks(args: {
  id: NativeRolloutValidationId
  workDir?: string
}): Promise<NativeRolloutTrialCheckResult[]> {
  switch (args.id) {
    case 'chat-simple':
      return [await runChatSimpleAcceptanceCheck()]
    case 'browser-simple':
      return await runDesktopAcceptanceChecks({
        flowIds: ['chrome.tab-roundtrip', 'chrome.discovery-roundtrip'],
        workDir: args.workDir
      })
    case 'terminal-simple':
      return await runDesktopAcceptanceChecks({
        flowIds: ['terminal.command-roundtrip', 'terminal.session-targeting'],
        workDir: args.workDir
      })
  }
}

async function runChatSimpleAcceptanceCheck(): Promise<NativeRolloutTrialCheckResult> {
  const manager = getAISourceManager()
  await manager.ensureInitialized()
  const endpoint = manager.resolveRuntimeEndpoint()
  const config = getConfig()
  const sharedToolProviders = buildSharedToolProviderDefinitions({
    effectiveAiBrowserEnabled: config.browserAutomation?.mode !== 'system-browser',
    includeSkillMcp: true,
    extensionProviderIds: getEnabledExtensions().map((extension) => extension.manifest.id)
  })
  const nativeStatus = resolveNativeRuntimeStatus({
    endpoint,
    sharedToolProviders
  })

  if (!nativeStatus.ready || !endpoint) {
    throw new Error(nativeStatus.note || getNativeUserFacingMessage('outsideScope'))
  }

  const adapterResolution = resolveNativeRuntimeAdapter(endpoint)
  const adapter = adapterResolution.adapter
  if (!adapter) {
    throw new Error(adapterResolution.reason)
  }

  const preparedRequest = adapter.prepareRequest({
    mainWindow: null,
    request: {
      spaceId: 'runtime-rollout-check',
      conversationId: 'runtime-rollout-check-chat',
      message: 'Please reply with READY.',
      messagePrefix: 'Reply with the single word READY. Do not use any tools. Do not ask follow-up questions.'
    },
    endpoint,
    sharedToolProviders: [],
    nativeFunctionTools: []
  })

  const result = await executeNativePreparedRequest({
    preparedRequest,
    adapter
  })
  const response = result.response

  if (!response) {
    throw new Error(getNativeUserFacingMessage('noFinalResponse'))
  }

  if (response.status !== 'completed') {
    throw new Error(response.error?.message || getNativeUserFacingMessage('requestFailed'))
  }

  if ((response.toolCalls || []).length > 0) {
    throw new Error('The new route tried to use tools during the short chat check.')
  }

  const content = (response.outputText || '').trim()
  if (!/ready/i.test(content)) {
    throw new Error('The short chat check did not return the expected reply.')
  }

  return {
    id: 'chat.reply-ready',
    state: 'passed',
    summary: 'The new route answered a short chat task correctly.'
  }
}

async function runDesktopAcceptanceChecks(args: {
  flowIds: string[]
  workDir?: string
}): Promise<NativeRolloutTrialCheckResult[]> {
  const checks: NativeRolloutTrialCheckResult[] = []

  for (const flowId of args.flowIds) {
    const execution = await runDesktopSmokeFlow({
      flowId,
      workDir: args.workDir
    })
    const check: NativeRolloutTrialCheckResult = {
      id: flowId,
      state: execution.state === 'passed' ? 'passed' : 'failed',
      summary: execution.summary,
      error: execution.error || null
    }
    checks.push(check)

    if (check.state === 'failed') {
      throw new NativeRolloutAcceptanceError(execution.error || execution.summary, checks)
    }
  }

  return checks
}

function resolveRunningSummary(id: NativeRolloutValidationId): string {
  switch (id) {
    case 'chat-simple':
      return 'Checking whether the new route can answer a short chat task.'
    case 'browser-simple':
      return 'Checking whether simple browser tasks are ready on this device.'
    case 'terminal-simple':
      return 'Checking whether simple terminal tasks are ready on this device.'
  }
}

function resolveSuccessSummary(id: NativeRolloutValidationId): string {
  switch (id) {
    case 'chat-simple':
      return 'Short chat tasks are ready to try on the new route.'
    case 'browser-simple':
      return 'Simple browser tasks are ready to try on the new route.'
    case 'terminal-simple':
      return 'Simple terminal tasks are ready to try on the new route.'
  }
}

function resolveFailureSummary(id: NativeRolloutValidationId): string {
  switch (id) {
    case 'chat-simple':
      return 'The short chat check did not pass.'
    case 'browser-simple':
      return 'The simple browser check did not pass.'
    case 'terminal-simple':
      return 'The simple terminal check did not pass.'
  }
}
