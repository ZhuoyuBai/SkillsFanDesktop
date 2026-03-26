import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { getConfig } from '../../config.service'
import { getHaloDir } from '../../config.service'
import { ensureSkillsInitialized, getSkillsSignature } from '../../skill'
import { isAIBrowserTool } from '../../ai-browser/tool-utils'
import type { ApiCredentials, SessionConfig, V2SDKSession } from '../types'
import { getApiCredentials, getHeadlessElectronPath, getMainWindow, sendToRenderer } from '../helpers'
import { buildSdkOptions, resolveSdkTransport } from '../sdk-options'
import { closeV2Session, getOrCreateV2Session } from '../session-manager'
import { extractResultUsage, extractSingleUsage } from '../message-utils'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../../utils/atomic-write'
import {
  normalizeThinkingEffortForModel,
  thinkingEffortToBudgetTokens
} from '../../../../shared/utils/openai-models'
import { stripLeadingSetModelStatus } from '../../../../shared/utils/sdk-status'
import type {
  SerializedSubagentRun,
  SubagentRun,
  SubagentRunStatus,
  SubagentSpawnParams
} from './types'
import { getApiCredentialsForSource } from '../helpers'

const DEFAULT_SUBAGENT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_SUBAGENT_TIMEOUT_MS = 30 * 60 * 1000
const AUTO_ANNOUNCE_DELAY_MS = 250
const AUTO_ANNOUNCE_RETRY_DELAY_MS = 1_500
const MAX_AUTO_ANNOUNCE_RETRIES = 2
const REGISTRY_VERSION = 1
const REGISTRY_FLUSH_DEBOUNCE_MS = 200
const RESTART_INTERRUPTED_ERROR = 'Hosted subagent was interrupted because the app restarted before it finished.'

const DISALLOWED_CHILD_BUILTIN_TOOLS = new Set([
  'Task',
  'AskUserQuestion',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'EnterPlanMode',
  'EnterWorktree'
])

const BLOCKED_SERVER_SIDE_TOOLS = new Set([
  'WebSearch',
  'WebFetch',
  'web_search',
  'web_fetch',
  'code_execution',
  'bash_code_execution',
  'text_editor_code_execution',
  'tool_search_tool_regex',
  'tool_search_tool_bm25',
  'memory'
])

const SUBAGENT_SYSTEM_PROMPT = `

## Hosted Subagent

You are a hosted subagent running under the SkillsFan app runtime.
Focus only on the assigned task from the parent agent.

Rules:
1. Do not ask the end user questions.
2. Do not spawn other subagents, tasks, or agent teams.
3. Do not end with placeholders like "please wait" or "稍候".
4. Return concrete results, findings, file references, or next actions.
5. Keep the final answer concise and directly useful to the parent agent.
`

const SUBAGENT_AUTO_ANNOUNCE_PREFIX = `
<hosted_subagent_completion_event>
This is an internal runtime event, not a new user message.
One or more hosted subagents launched in this conversation have reached terminal states.
There are no remaining active hosted subagents in this batch.
Use the structured payload below as internal context, continue the existing task, and answer the user directly if the earlier request can now be completed.
Do not mention XML tags, hidden runtime events, or that you were invoked internally.
If some hosted subagents failed, summarize what succeeded and what failed in normal user-facing language.
</hosted_subagent_completion_event>
`

interface SubagentExecution {
  abortController: AbortController
  workDir: string
  completionPromise: Promise<SubagentRun>
  resolveCompletion: (run: SubagentRun) => void
  timeoutId?: NodeJS.Timeout
}

const runs = new Map<string, SubagentRun>()
const runsByConversation = new Map<string, string[]>()
const executions = new Map<string, SubagentExecution>()
const autoAnnounceSuppressedParents = new Set<string>()
const autoAnnounceLocks = new Set<string>()
const autoAnnounceRetryCounts = new Map<string, number>()
const autoAnnounceTimers = new Map<string, NodeJS.Timeout>()
const persistTimersBySpace = new Map<string, NodeJS.Timeout>()
let registryLoaded = false

interface PersistedSubagentRegistry {
  version: number
  savedAt: string
  runs: SerializedSubagentRun[]
}

function isTerminalStatus(status: SubagentRunStatus): boolean {
  return status === 'completed'
    || status === 'failed'
    || status === 'killed'
    || status === 'timeout'
}

function clampTimeout(timeoutMs?: number): number {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) return DEFAULT_SUBAGENT_TIMEOUT_MS
  return Math.max(5_000, Math.min(MAX_SUBAGENT_TIMEOUT_MS, Math.floor(timeoutMs)))
}

function getDurationMs(run: SubagentRun): number | undefined {
  const started = run.startedAt || run.spawnedAt
  const startTs = Date.parse(started)
  if (Number.isNaN(startTs)) return undefined
  const endTs = run.endedAt ? Date.parse(run.endedAt) : Date.now()
  if (Number.isNaN(endTs)) return undefined
  return Math.max(0, endTs - startTs)
}

function serializeRun(run: SubagentRun): SerializedSubagentRun {
  return {
    ...run,
    durationMs: getDurationMs(run)
  }
}

function getSubagentRegistryRootDir(): string {
  return path.join(getHaloDir(), 'subagents')
}

function getSubagentRegistryPath(spaceId: string): string {
  return path.join(getSubagentRegistryRootDir(), spaceId, 'runs.json')
}

function ensureSubagentRegistryDir(spaceId: string): string {
  const dir = path.dirname(getSubagentRegistryPath(spaceId))
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function persistSpaceRuns(spaceId: string): void {
  ensureRegistryLoaded()
  ensureSubagentRegistryDir(spaceId)
  const filePath = getSubagentRegistryPath(spaceId)
  const payload: PersistedSubagentRegistry = {
    version: REGISTRY_VERSION,
    savedAt: new Date().toISOString(),
    runs: Array.from(runs.values())
      .filter((run) => run.parentSpaceId === spaceId)
      .sort((a, b) => Date.parse(a.spawnedAt) - Date.parse(b.spawnedAt))
      .map(serializeRun)
  }
  atomicWriteJsonSync(filePath, payload, { backup: true })
}

function schedulePersistForSpace(spaceId: string): void {
  const existing = persistTimersBySpace.get(spaceId)
  if (existing) {
    clearTimeout(existing)
  }

  const timer = setTimeout(() => {
    persistTimersBySpace.delete(spaceId)
    try {
      persistSpaceRuns(spaceId)
    } catch (error) {
      console.error(`[Subagent][${spaceId}] Failed to persist hosted subagent registry:`, error)
    }
  }, REGISTRY_FLUSH_DEBOUNCE_MS)

  persistTimersBySpace.set(spaceId, timer)
}

function loadRunsForSpace(spaceId: string): SerializedSubagentRun[] {
  const filePath = getSubagentRegistryPath(spaceId)
  const payload = safeReadJsonSync<PersistedSubagentRegistry | null>(filePath, null)
  if (!payload || payload.version !== REGISTRY_VERSION || !Array.isArray(payload.runs)) {
    return []
  }
  return payload.runs
}

function ensureRegistryLoaded(): void {
  if (registryLoaded) {
    return
  }

  registryLoaded = true

  const registryRoot = getSubagentRegistryRootDir()
  if (!existsSync(registryRoot)) {
    return
  }

  const nowIso = new Date().toISOString()
  const spaces = readdirSync(registryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const dirtySpaces = new Set<string>()

  for (const spaceId of spaces) {
    for (const run of loadRunsForSpace(spaceId)) {
      let restored: SubagentRun = { ...run }

      if (restored.status === 'waiting_announce') {
        restored = {
          ...restored,
          status: 'completed',
          endedAt: restored.endedAt || nowIso,
          announcedAt: restored.announcedAt || nowIso
        }
        dirtySpaces.add(spaceId)
      } else if (!isTerminalStatus(restored.status)) {
        restored = {
          ...restored,
          status: 'failed',
          endedAt: restored.endedAt || nowIso,
          error: restored.error || RESTART_INTERRUPTED_ERROR,
          resultSummary: restored.resultSummary || restored.latestSummary || RESTART_INTERRUPTED_ERROR,
          announcedAt: restored.announcedAt || nowIso
        }
        dirtySpaces.add(spaceId)
      }

      runs.set(restored.runId, restored)
      appendRunToConversation(restored.parentConversationId, restored.runId)
    }
  }

  for (const spaceId of dirtySpaces) {
    try {
      persistSpaceRuns(spaceId)
    } catch (error) {
      console.error(`[Subagent][${spaceId}] Failed to persist recovered hosted subagent registry:`, error)
    }
  }
}

function clearAutoAnnounceTimer(parentConversationId: string): void {
  const timer = autoAnnounceTimers.get(parentConversationId)
  if (timer) {
    clearTimeout(timer)
    autoAnnounceTimers.delete(parentConversationId)
  }
}

function getConversationRuns(parentConversationId: string): SubagentRun[] {
  const runIds = runsByConversation.get(parentConversationId) || []
  return runIds
    .map((runId) => runs.get(runId))
    .filter((run): run is SubagentRun => Boolean(run))
    .sort((a, b) => Date.parse(a.spawnedAt) - Date.parse(b.spawnedAt))
}

function escapeXml(value?: string): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildAutoAnnouncePayload(parentConversationId: string, pendingRuns: SubagentRun[]): string {
  const renderedRuns = pendingRuns.map((run) => {
    const durationMs = getDurationMs(run)
    const tokenUsageSection = run.tokenUsage
      ? `
    <token_usage>
      <input_tokens>${run.tokenUsage.inputTokens}</input_tokens>
      <output_tokens>${run.tokenUsage.outputTokens}</output_tokens>
      ${typeof run.tokenUsage.totalCostUsd === 'number' ? `<total_cost_usd>${run.tokenUsage.totalCostUsd}</total_cost_usd>` : ''}
    </token_usage>`
      : ''

    return `
  <run>
    <run_id>${escapeXml(run.runId)}</run_id>
    <child_conversation_id>${escapeXml(run.childConversationId)}</child_conversation_id>
    <status>${escapeXml(run.status)}</status>
    ${run.label ? `<label>${escapeXml(run.label)}</label>` : ''}
    <task>${escapeXml(run.task)}</task>
    ${run.model ? `<model>${escapeXml(run.model)}</model>` : ''}
    ${run.modelSource ? `<model_source>${escapeXml(run.modelSource)}</model_source>` : ''}
    ${run.startedAt ? `<started_at>${escapeXml(run.startedAt)}</started_at>` : ''}
    ${run.endedAt ? `<ended_at>${escapeXml(run.endedAt)}</ended_at>` : ''}
    ${typeof durationMs === 'number' ? `<duration_ms>${durationMs}</duration_ms>` : ''}
    ${run.latestSummary ? `<latest_summary>${escapeXml(run.latestSummary)}</latest_summary>` : ''}
    ${run.resultSummary ? `<result_summary>${escapeXml(run.resultSummary)}</result_summary>` : ''}
    ${run.error ? `<error>${escapeXml(run.error)}</error>` : ''}
    ${tokenUsageSection}
  </run>`.trim()
  }).join('\n')

  return `
<subagent_completion_batch>
  <parent_conversation_id>${escapeXml(parentConversationId)}</parent_conversation_id>
  <completed_run_count>${pendingRuns.length}</completed_run_count>
  <runs>
${renderedRuns}
  </runs>
</subagent_completion_batch>
`.trim()
}

function markRunsAnnounced(runIds: string[], announcedAt = new Date().toISOString()): void {
  for (const runId of runIds) {
    const existing = runs.get(runId)
    if (!existing || !isTerminalStatus(existing.status) || existing.announcedAt) {
      continue
    }
    updateRun(runId, { announcedAt })
  }
}

async function maybeAutoAnnounce(parentConversationId: string): Promise<void> {
  if (autoAnnounceSuppressedParents.has(parentConversationId) || autoAnnounceLocks.has(parentConversationId)) {
    return
  }

  const conversationRuns = getConversationRuns(parentConversationId)
  if (conversationRuns.some((run) => !isTerminalStatus(run.status))) {
    return
  }

  const pendingRuns = conversationRuns.filter((run) => isTerminalStatus(run.status) && !run.announcedAt)
  if (pendingRuns.length === 0) {
    autoAnnounceRetryCounts.delete(parentConversationId)
    return
  }

  autoAnnounceLocks.add(parentConversationId)

  let didComplete = false
  let finalContent = ''
  let announceError: string | null = null
  const pendingRunIds = pendingRuns.map((run) => run.runId)

  try {
    const { sendMessage } = await import('../send-message')

    await sendMessage(getMainWindow(), {
      spaceId: pendingRuns[0].parentSpaceId,
      conversationId: parentConversationId,
      message: buildAutoAnnouncePayload(parentConversationId, pendingRuns),
      messagePrefix: SUBAGENT_AUTO_ANNOUNCE_PREFIX,
      internalMessage: {
        kind: 'subagent_completion',
        persistUserMessage: false,
        persistAssistantMode: 'append_new',
        suppressQueuedEvent: true,
        suppressErrorEvent: true,
        onComplete: (result) => {
          didComplete = true
          finalContent = result.finalContent
        },
        onError: (errorMessage) => {
          announceError = errorMessage
        }
      }
    })

    if (!didComplete || !finalContent.trim()) {
      throw new Error(announceError || 'Hosted subagent auto-announce finished without a visible assistant response.')
    }

    markRunsAnnounced(pendingRunIds)
    autoAnnounceRetryCounts.delete(parentConversationId)
  } catch (error) {
    if (autoAnnounceSuppressedParents.has(parentConversationId)) {
      return
    }

    const retryCount = autoAnnounceRetryCounts.get(parentConversationId) || 0
    if (retryCount < MAX_AUTO_ANNOUNCE_RETRIES) {
      autoAnnounceRetryCounts.set(parentConversationId, retryCount + 1)
      clearAutoAnnounceTimer(parentConversationId)
      const retryTimer = setTimeout(() => {
        autoAnnounceTimers.delete(parentConversationId)
        void maybeAutoAnnounce(parentConversationId)
      }, AUTO_ANNOUNCE_RETRY_DELAY_MS)
      autoAnnounceTimers.set(parentConversationId, retryTimer)
    } else {
      autoAnnounceRetryCounts.delete(parentConversationId)
      console.error(
        `[Subagent][${parentConversationId}] Hosted subagent auto-announce failed after retries:`,
        error
      )
    }
  } finally {
    autoAnnounceLocks.delete(parentConversationId)
  }
}

function scheduleAutoAnnounce(parentConversationId: string, delayMs = AUTO_ANNOUNCE_DELAY_MS): void {
  if (autoAnnounceSuppressedParents.has(parentConversationId)) {
    return
  }

  clearAutoAnnounceTimer(parentConversationId)
  const timer = setTimeout(() => {
    autoAnnounceTimers.delete(parentConversationId)
    void maybeAutoAnnounce(parentConversationId)
  }, delayMs)
  autoAnnounceTimers.set(parentConversationId, timer)
}

function appendRunToConversation(parentConversationId: string, runId: string): void {
  const existing = runsByConversation.get(parentConversationId) || []
  if (!existing.includes(runId)) {
    runsByConversation.set(parentConversationId, [...existing, runId])
  }
}

function dispatchRunUpdate(run: SubagentRun): void {
  sendToRenderer(
    'agent:subagent-update',
    run.parentSpaceId,
    run.parentConversationId,
    { ...serializeRun(run) } as Record<string, unknown>
  )
}

function updateRun(runId: string, updates: Partial<SubagentRun>): SubagentRun {
  ensureRegistryLoaded()
  const existing = runs.get(runId)
  if (!existing) {
    throw new Error(`Subagent run not found: ${runId}`)
  }

  const next = { ...existing, ...updates }
  runs.set(runId, next)
  schedulePersistForSpace(next.parentSpaceId)
  dispatchRunUpdate(next)
  return next
}

function finalizeRun(runId: string, updates: Partial<SubagentRun>): SubagentRun {
  const next = updateRun(runId, {
    endedAt: updates.endedAt || new Date().toISOString(),
    ...updates
  })
  const execution = executions.get(runId)
  if (execution?.timeoutId) {
    clearTimeout(execution.timeoutId)
  }
  if (execution) {
    execution.resolveCompletion(next)
    executions.delete(runId)
  }
  closeV2Session(next.childConversationId)
  persistSpaceRuns(next.parentSpaceId)
  if (isTerminalStatus(next.status)) {
    scheduleAutoAnnounce(next.parentConversationId)
  }
  return next
}

function buildChildPrompt(run: SubagentRun): string {
  const labelSection = run.label ? `Label: ${run.label}\n\n` : ''
  return `${labelSection}<subagent_task>\n${run.task}\n</subagent_task>`
}

function createSubagentCanUseTool(workDir: string) {
  const absoluteWorkDir = path.resolve(workDir)

  const ensurePathsWithinWorkspace = (input: Record<string, unknown>) => {
    const pathParams = [
      input.file_path,
      input.path,
      input.notebook_path,
      input.old_path,
      input.new_path
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)

    for (const pathParam of pathParams) {
      const absolutePath = path.isAbsolute(pathParam)
        ? path.resolve(pathParam)
        : path.resolve(absoluteWorkDir, pathParam)
      const isWithinWorkDir =
        absolutePath.startsWith(absoluteWorkDir + path.sep) || absolutePath === absoluteWorkDir

      if (!isWithinWorkDir) {
        return {
          behavior: 'deny' as const,
          message: `Can only access files within the current space: ${workDir}`
        }
      }
    }

    return null
  }

  const canRunCommands = () => {
    const currentConfig = getConfig()
    const permission = currentConfig.permissions.commandExecution
    if (permission === 'deny') {
      return {
        behavior: 'deny' as const,
        message: 'Command execution is disabled'
      }
    }
    if (permission === 'ask' && !currentConfig.permissions.trustMode) {
      return {
        behavior: 'deny' as const,
        message: 'Interactive approval is unavailable inside hosted subagents. Run this step in the primary agent instead.'
      }
    }
    return {
      behavior: 'allow' as const
    }
  }

  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: { signal: AbortSignal }
  ) => {
    if (
      toolName === 'mcp__local-tools__subagent_spawn'
      || toolName === 'mcp__local-tools__subagents'
      || DISALLOWED_CHILD_BUILTIN_TOOLS.has(toolName)
    ) {
      return {
        behavior: 'deny' as const,
        message: 'Nested hosted subagents and team orchestration are disabled inside a hosted subagent.'
      }
    }

    if (BLOCKED_SERVER_SIDE_TOOLS.has(toolName)) {
      return {
        behavior: 'deny' as const,
        message: `Built-in server-side tool "${toolName}" is disabled. Use local MCP tools instead.`
      }
    }

    const fileTools = [
      'Read',
      'Write',
      'Edit',
      'Grep',
      'Glob',
      'NotebookEdit',
      'mcp__local-tools__text_editor_code_execution'
    ]
    if (fileTools.includes(toolName)) {
      const violation = ensurePathsWithinWorkspace(input)
      if (violation) return violation
      return { behavior: 'allow' as const, updatedInput: input }
    }

    if (
      toolName === 'Bash'
      || toolName === 'mcp__local-tools__bash_code_execution'
      || toolName === 'mcp__local-tools__code_execution'
      || toolName === 'mcp__local-tools__open_application'
      || toolName === 'mcp__local-tools__run_applescript'
    ) {
      const commandPermission = canRunCommands()
      return commandPermission.behavior === 'allow'
        ? { behavior: 'allow' as const, updatedInput: input }
        : commandPermission
    }

    if (toolName === 'mcp__local-tools__open_url') {
      const currentConfig = getConfig()
      if (currentConfig.browserAutomation?.mode !== 'system-browser') {
        return {
          behavior: 'deny' as const,
          message: 'System browser opening is disabled while automated browser mode is active. Use automated browser tools instead.'
        }
      }
      return { behavior: 'allow' as const, updatedInput: input }
    }

    if (isAIBrowserTool(toolName)) {
      const currentConfig = getConfig()
      if (currentConfig.browserAutomation?.mode === 'system-browser') {
        return {
          behavior: 'deny' as const,
          message: 'Automated browser is disabled while "Use System Default Browser" mode is enabled.'
        }
      }
      return { behavior: 'allow' as const, updatedInput: input }
    }

    return { behavior: 'allow' as const, updatedInput: input }
  }
}

async function resolveSubagentCredentials(
  model?: string,
  modelSource?: string
): Promise<ApiCredentials> {
  const config = getConfig()
  let credentials = modelSource
    ? await getApiCredentialsForSource(config, modelSource, model)
    : await getApiCredentials(config)

  if (model) {
    credentials.model = model
  }

  return credentials
}

async function runSubagent(runId: string): Promise<void> {
  const run = runs.get(runId)
  const execution = executions.get(runId)
  if (!run || !execution) return

  const abortController = execution.abortController

  try {
    updateRun(runId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      latestSummary: run.label || run.task
    })

    const config = getConfig()
    const credentials = await resolveSubagentCredentials(run.model, run.modelSource)
    const transport = await resolveSdkTransport(credentials)
    const electronPath = getHeadlessElectronPath()

    await ensureSkillsInitialized(execution.workDir, { forceRefresh: true })
    const skillsSignature = getSkillsSignature()

    const { getExtensionHash } = await import('../../extension')
    const browserAutomationMode = config.browserAutomation?.mode === 'system-browser'
      ? 'system-browser'
      : 'ai-browser'
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: false,
      skillsSignature,
      browserAutomationMode,
      customInstructionsHash: config.customInstructions?.enabled && config.customInstructions?.content
        ? config.customInstructions.content
        : undefined,
      extensionHash: getExtensionHash()
    }

    const { sdkOptions } = await buildSdkOptions({
      conversationId: run.childConversationId,
      spaceId: run.parentSpaceId,
      workDir: execution.workDir,
      config: config as Record<string, any>,
      abortController,
      sdkModel: transport.sdkModel,
      credentialsModel: credentials.model,
      anthropicBaseUrl: transport.anthropicBaseUrl,
      anthropicApiKey: transport.anthropicApiKey,
      electronPath,
      onStderr: (data: string) => {
        console.error(`[Subagent][${runId}] CLI stderr:`, data)
      },
      aiBrowserEnabled: false,
      thinkingEnabled: false,
      includeSkillMcp: skillsSignature.length > 0,
      includeSubagentTools: false,
      ralphSystemPromptAppend: SUBAGENT_SYSTEM_PROMPT,
      routed: transport.routed
    })

    sdkOptions.canUseTool = createSubagentCanUseTool(sdkOptions.cwd)
    sdkOptions.allowedTools = (sdkOptions.allowedTools || []).filter(
      (toolName: string) => !DISALLOWED_CHILD_BUILTIN_TOOLS.has(toolName)
    )
    sdkOptions.tools = (sdkOptions.tools || []).filter(
      (toolName: string) => !DISALLOWED_CHILD_BUILTIN_TOOLS.has(toolName)
    )
    sdkOptions.maxTurns = Math.min(30, sdkOptions.maxTurns || 30)

    const v2Session = await getOrCreateV2Session(
      run.parentSpaceId,
      run.childConversationId,
      sdkOptions,
      undefined,
      sessionConfig
    ) as V2SDKSession

    if (v2Session.setPermissionMode) {
      await v2Session.setPermissionMode('acceptEdits')
    }

    try {
      if (v2Session.setModel && !transport.routed) {
        await v2Session.setModel(transport.sdkModel)
      }

      if (v2Session.setMaxThinkingTokens) {
        const effort = normalizeThinkingEffortForModel(
          credentials.model,
          run.thinkingEffort ?? (config as any).thinkingEffort
        )
        const thinkingTokens = thinkingEffortToBudgetTokens(effort)
        await v2Session.setMaxThinkingTokens(thinkingTokens)
      }
    } catch (error) {
      console.error(`[Subagent][${runId}] Failed to set dynamic session params:`, error)
    }

    let accumulatedText = ''
    let currentStreamingText = ''
    let isStreamingTextBlock = false
    let lastSingleUsage: ReturnType<typeof extractSingleUsage> = null
    let tokenUsage: ReturnType<typeof extractResultUsage> = null
    let sawResult = false

    const setLatestSummary = (value?: string) => {
      const trimmed = value?.trim()
      if (!trimmed) return
      const current = runs.get(runId)
      if (!current || current.latestSummary === trimmed) return
      updateRun(runId, { latestSummary: trimmed.slice(0, 240) })
    }

    v2Session.send(buildChildPrompt(run))

    for await (const sdkMessage of v2Session.stream()) {
      if (abortController.signal.aborted) break

      if (sdkMessage.type === 'assistant') {
        const usage = extractSingleUsage(sdkMessage)
        if (usage) {
          lastSingleUsage = usage
        }
      }

      if (sdkMessage.type === 'result') {
        sawResult = true
        tokenUsage = extractResultUsage(sdkMessage, lastSingleUsage)
        continue
      }

      if (sdkMessage.type === 'system') {
        const systemMessage = sdkMessage as any
        const subtype = systemMessage.subtype

        if (subtype === 'status' || subtype === 'local_command_output') {
          setLatestSummary(String(systemMessage.content || systemMessage.status || ''))
          continue
        }

        if (subtype === 'task_started') {
          setLatestSummary(systemMessage.description || 'Running sub-task')
          continue
        }

        if (subtype === 'task_progress') {
          setLatestSummary(systemMessage.summary || systemMessage.description || systemMessage.last_tool_name || '')
          continue
        }

        if (subtype === 'task_notification') {
          setLatestSummary(systemMessage.summary || systemMessage.status || '')
          continue
        }
      }

      if (sdkMessage.type === 'stream_event') {
        const event = (sdkMessage as any).event
        if (!event) continue

        if (event.type === 'content_block_start' && event.content_block?.type === 'text') {
          isStreamingTextBlock = true
          currentStreamingText = event.content_block.text || ''
          if (accumulatedText) {
            accumulatedText += '\n\n'
          }
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && isStreamingTextBlock) {
          currentStreamingText += event.delta.text || ''
        }

        if (event.type === 'content_block_stop' && isStreamingTextBlock) {
          isStreamingTextBlock = false
          accumulatedText += currentStreamingText
          setLatestSummary(stripLeadingSetModelStatus(accumulatedText).slice(-240))
        }
      }
    }

    if (abortController.signal.aborted) {
      const current = runs.get(runId)
      if (current && !isTerminalStatus(current.status)) {
        finalizeRun(runId, {
          status: 'killed',
          error: current.error || 'Subagent run aborted'
        })
      }
      return
    }

    const visibleContent = stripLeadingSetModelStatus(accumulatedText).trim()
    finalizeRun(runId, {
      status: 'completed',
      latestSummary: visibleContent ? visibleContent.slice(0, 240) : runs.get(runId)?.latestSummary,
      resultSummary: visibleContent || runs.get(runId)?.latestSummary || 'Subagent completed without returning visible text.',
      tokenUsage: tokenUsage
        ? {
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalCostUsd: tokenUsage.totalCostUsd
          }
        : undefined
    })

    if (!sawResult) {
      console.warn(`[Subagent][${runId}] Stream ended without explicit result message`)
    }
  } catch (error) {
    const err = error as Error
    const current = runs.get(runId)
    if (current?.status === 'timeout') {
      finalizeRun(runId, {
        status: 'timeout',
        error: current.error || err.message
      })
      return
    }

    if (current?.status === 'killed') {
      finalizeRun(runId, {
        status: 'killed',
        error: current.error || err.message
      })
      return
    }

    finalizeRun(runId, {
      status: 'failed',
      error: err.message || 'Subagent run failed'
    })
  }
}

export async function spawnSubagent(params: SubagentSpawnParams): Promise<SerializedSubagentRun> {
  ensureRegistryLoaded()
  const runId = randomUUID()
  const childConversationId = `subagent-${runId}`
  const timeoutMs = clampTimeout(params.timeoutMs)

  autoAnnounceSuppressedParents.delete(params.parentConversationId)
  autoAnnounceRetryCounts.delete(params.parentConversationId)
  clearAutoAnnounceTimer(params.parentConversationId)

  const run: SubagentRun = {
    runId,
    parentConversationId: params.parentConversationId,
    parentSpaceId: params.parentSpaceId,
    childConversationId,
    status: 'queued',
    task: params.task,
    label: params.label,
    model: params.model,
    modelSource: params.modelSource,
    thinkingEffort: params.thinkingEffort,
    spawnedAt: new Date().toISOString(),
    latestSummary: params.label || params.task,
    toolUseId: params.toolUseId
  }

  let resolveCompletion!: (run: SubagentRun) => void
  const completionPromise = new Promise<SubagentRun>((resolve) => {
    resolveCompletion = resolve
  })

  const execution: SubagentExecution = {
    abortController: new AbortController(),
    workDir: params.workDir,
    completionPromise,
    resolveCompletion
  }

  execution.timeoutId = setTimeout(() => {
    const current = runs.get(runId)
    if (!current || isTerminalStatus(current.status)) return
    updateRun(runId, {
      status: 'timeout',
      error: `Subagent timed out after ${Math.round(timeoutMs / 1000)}s`
    })
    execution.abortController.abort()
  }, timeoutMs)

  runs.set(runId, run)
  executions.set(runId, execution)
  appendRunToConversation(params.parentConversationId, runId)
  persistSpaceRuns(params.parentSpaceId)
  dispatchRunUpdate(run)

  queueMicrotask(() => {
    runSubagent(runId).catch((error) => {
      console.error(`[Subagent][${runId}] Unhandled execution error:`, error)
      finalizeRun(runId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
    })
  })

  return serializeRun(run)
}

export function getSubagentRun(runId: string): SerializedSubagentRun | null {
  ensureRegistryLoaded()
  const run = runs.get(runId)
  return run ? serializeRun(run) : null
}

export function acknowledgeSubagentRuns(runIds: string[]): void {
  ensureRegistryLoaded()
  markRunsAnnounced(runIds)
}

export function suppressAutoAnnounceForConversation(parentConversationId: string): void {
  ensureRegistryLoaded()
  autoAnnounceSuppressedParents.add(parentConversationId)
  autoAnnounceRetryCounts.delete(parentConversationId)
  clearAutoAnnounceTimer(parentConversationId)
}

export function listSubagentRunsForConversation(
  parentConversationId: string,
  options?: { includeCompleted?: boolean; limit?: number }
): SerializedSubagentRun[] {
  ensureRegistryLoaded()
  const runIds = runsByConversation.get(parentConversationId) || []
  const includeCompleted = options?.includeCompleted ?? true
  const limit = options?.limit ?? runIds.length

  return runIds
    .map((runId) => runs.get(runId))
    .filter((run): run is SubagentRun => {
      if (!run) return false
      return includeCompleted || !isTerminalStatus(run.status)
    })
    .sort((a, b) => Date.parse(b.spawnedAt) - Date.parse(a.spawnedAt))
    .slice(0, Math.max(1, limit))
    .map(serializeRun)
}

export async function waitForSubagentRun(
  runId: string,
  timeoutMs?: number
): Promise<SerializedSubagentRun> {
  ensureRegistryLoaded()
  const existing = runs.get(runId)
  if (!existing) {
    throw new Error(`Subagent run not found: ${runId}`)
  }

  if (isTerminalStatus(existing.status)) {
    return serializeRun(existing)
  }

  const execution = executions.get(runId)
  if (!execution) {
    return serializeRun(existing)
  }

  const effectiveTimeout = clampTimeout(timeoutMs)
  let waitTimeoutId: NodeJS.Timeout | undefined
  const completed = await Promise.race([
    execution.completionPromise,
    new Promise<SubagentRun>((_, reject) => {
      waitTimeoutId = setTimeout(() => reject(new Error(`Timed out waiting for subagent ${runId}`)), effectiveTimeout)
    })
  ]).finally(() => {
    if (waitTimeoutId) {
      clearTimeout(waitTimeoutId)
    }
  })

  return serializeRun(completed)
}

export async function waitForConversationSubagents(
  parentConversationId: string,
  timeoutMs?: number
): Promise<SerializedSubagentRun[]> {
  ensureRegistryLoaded()
  const activeRuns = listSubagentRunsForConversation(parentConversationId, {
    includeCompleted: false
  })

  if (activeRuns.length === 0) {
    return listSubagentRunsForConversation(parentConversationId)
  }

  const effectiveTimeout = clampTimeout(timeoutMs)
  const startedAt = Date.now()
  const results: SerializedSubagentRun[] = []

  for (const run of activeRuns) {
    const remaining = Math.max(1_000, effectiveTimeout - (Date.now() - startedAt))
    results.push(await waitForSubagentRun(run.runId, remaining))
  }

  return results
}

export function killSubagentRun(runId: string): SerializedSubagentRun {
  ensureRegistryLoaded()
  const run = runs.get(runId)
  if (!run) {
    throw new Error(`Subagent run not found: ${runId}`)
  }

  if (isTerminalStatus(run.status)) {
    return serializeRun(run)
  }

  updateRun(runId, {
    status: 'killed',
    error: 'Subagent terminated by parent agent'
  })

  const execution = executions.get(runId)
  if (execution) {
    execution.abortController.abort()
  }

  return serializeRun(runs.get(runId)!)
}

export function initializeSubagentRuntime(): void {
  ensureRegistryLoaded()
}

export function shutdownSubagentRuntime(): void {
  ensureRegistryLoaded()

  for (const timer of persistTimersBySpace.values()) {
    clearTimeout(timer)
  }
  persistTimersBySpace.clear()

  for (const timer of autoAnnounceTimers.values()) {
    clearTimeout(timer)
  }
  autoAnnounceTimers.clear()

  const affectedSpaces = new Set(Array.from(runs.values()).map((run) => run.parentSpaceId))
  for (const spaceId of affectedSpaces) {
    try {
      persistSpaceRuns(spaceId)
    } catch (error) {
      console.error(`[Subagent][${spaceId}] Failed to flush hosted subagent registry on shutdown:`, error)
    }
  }
}
