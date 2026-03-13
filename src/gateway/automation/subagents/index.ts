import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getHaloDir } from '../../../main/services/config.service'
import {
  acknowledgeSubagentRuns as acknowledgeLegacySubagentRuns,
  getSubagentRun as getLegacySubagentRun,
  getSubagentRuntimeStatus as getLegacySubagentRuntimeStatus,
  initializeSubagentRuntime as initializeLegacySubagentRuntime,
  killSubagentRun as killLegacySubagentRun,
  listSubagentRunsBySessionKey as listLegacySubagentRunsBySessionKey,
  listSubagentRunsForConversation as listLegacySubagentRunsForConversation,
  waitForConversationSubagents as waitForLegacyConversationSubagents,
  waitForSubagentRun as waitForLegacySubagentRun,
  shutdownSubagentRuntime as shutdownLegacySubagentRuntime,
  type HostedSubagentRuntimeStatus
} from '../../../main/services/agent'
import type { SerializedSubagentRun, SubagentRunStatus } from '../../../main/services/agent/subagent/types'
import { safeReadJsonSync } from '../../../main/utils/atomic-write'
import { canDelegateGatewayCommands, executeGatewayCommand } from '../../commands'
import { getGatewayProcessStatus } from '../../process'
import { resolveSubagentGatewayRoute } from '../../sessions/automation'
import { findPreferredGatewaySessionByConversationId } from '../../sessions/store'

export type { HostedSubagentRuntimeStatus }

interface PersistedSubagentRegistry {
  version: number
  savedAt: string
  runs: SerializedSubagentRun[]
}

const REGISTRY_VERSION = 1
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_WAIT_TIMEOUT_MS = 30 * 60 * 1000
const WAIT_POLL_INTERVAL_MS = 500

function isTerminalStatus(status: SubagentRunStatus): boolean {
  return status === 'completed'
    || status === 'failed'
    || status === 'killed'
    || status === 'timeout'
}

function shouldReadObservedSubagentRuns(): boolean {
  const processStatus = getGatewayProcessStatus()
  return processStatus.configuredMode === 'external' && !processStatus.managedByCurrentProcess
}

function getSubagentRegistryRootDir(): string {
  return join(getHaloDir(), 'subagents')
}

function loadPersistedRunsForSpace(spaceId: string): SerializedSubagentRun[] {
  const filePath = join(getSubagentRegistryRootDir(), spaceId, 'runs.json')
  const payload = safeReadJsonSync<PersistedSubagentRegistry | null>(filePath, null)
  if (!payload || payload.version !== REGISTRY_VERSION || !Array.isArray(payload.runs)) {
    return []
  }

  return payload.runs
    .filter((run) => (
      run
      && typeof run.runId === 'string'
      && typeof run.parentConversationId === 'string'
      && typeof run.parentSpaceId === 'string'
      && typeof run.childConversationId === 'string'
      && typeof run.spawnedAt === 'string'
      && typeof run.status === 'string'
    ))
    .map((run) => ({ ...run }))
}

function listPersistedSubagentRuns(): SerializedSubagentRun[] {
  const rootDir = getSubagentRegistryRootDir()
  if (!existsSync(rootDir)) {
    return []
  }

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => loadPersistedRunsForSpace(entry.name))
}

function sortRuns(left: SerializedSubagentRun, right: SerializedSubagentRun): number {
  return Date.parse(right.spawnedAt) - Date.parse(left.spawnedAt)
}

function clampWaitTimeout(timeoutMs?: number): number {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) {
    return DEFAULT_WAIT_TIMEOUT_MS
  }

  return Math.max(1_000, Math.min(MAX_WAIT_TIMEOUT_MS, Math.floor(timeoutMs)))
}

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function applyRunFilters(
  runs: SerializedSubagentRun[],
  options?: { includeCompleted?: boolean; limit?: number }
): SerializedSubagentRun[] {
  const includeCompleted = options?.includeCompleted ?? true
  const limit = options?.limit ?? runs.length

  return runs
    .filter((run) => includeCompleted || !isTerminalStatus(run.status))
    .sort(sortRuns)
    .slice(0, Math.max(1, limit))
    .map((run) => ({ ...run }))
}

export function initializeGatewaySubagentRuntime(): void {
  initializeLegacySubagentRuntime()
}

export function getGatewaySubagentRuntimeStatus(): HostedSubagentRuntimeStatus {
  return getLegacySubagentRuntimeStatus()
}

export function acknowledgeGatewaySubagentRuns(runIds: string[]): void {
  acknowledgeLegacySubagentRuns(runIds)
}

export function getGatewaySubagentRun(runId: string): SerializedSubagentRun | null {
  if (!shouldReadObservedSubagentRuns()) {
    return getLegacySubagentRun(runId)
  }

  return listPersistedSubagentRuns().find((run) => run.runId === runId) || null
}

export function listGatewaySubagentRunsForConversation(
  parentConversationId: string,
  options?: { includeCompleted?: boolean; limit?: number }
): SerializedSubagentRun[] {
  if (!shouldReadObservedSubagentRuns()) {
    return listLegacySubagentRunsForConversation(parentConversationId, options)
  }

  const matched = listPersistedSubagentRuns()
    .filter((run) => run.parentConversationId === parentConversationId)

  return applyRunFilters(matched, options)
}

export function listGatewaySubagentRunsBySessionKey(
  sessionKey: string,
  options?: { includeCompleted?: boolean; limit?: number }
): SerializedSubagentRun[] {
  if (!shouldReadObservedSubagentRuns()) {
    return listLegacySubagentRunsBySessionKey(sessionKey, options)
  }

  const matched = listPersistedSubagentRuns()
    .filter((run) => {
      const parentSession = findPreferredGatewaySessionByConversationId(run.parentConversationId, {
        workspaceId: run.parentSpaceId
      })
      if (parentSession?.sessionKey === sessionKey || parentSession?.mainSessionKey === sessionKey) {
        return true
      }

      const route = resolveSubagentGatewayRoute(run)
      return route.sessionKey === sessionKey || route.mainSessionKey === sessionKey
    })

  return applyRunFilters(matched, options)
}

export async function waitForGatewaySubagentRun(
  runId: string,
  timeoutMs?: number
): Promise<SerializedSubagentRun> {
  if (!shouldReadObservedSubagentRuns()) {
    return await waitForLegacySubagentRun(runId, timeoutMs)
  }

  const effectiveTimeout = clampWaitTimeout(timeoutMs)
  const deadline = Date.now() + effectiveTimeout

  while (Date.now() <= deadline) {
    const run = getGatewaySubagentRun(runId)
    if (!run) {
      throw new Error(`Subagent run not found: ${runId}`)
    }

    if (isTerminalStatus(run.status)) {
      return run
    }

    await waitFor(Math.min(WAIT_POLL_INTERVAL_MS, Math.max(50, deadline - Date.now())))
  }

  throw new Error(`Timed out waiting for subagent ${runId}`)
}

export async function waitForGatewayConversationSubagents(
  parentConversationId: string,
  timeoutMs?: number
): Promise<SerializedSubagentRun[]> {
  if (!shouldReadObservedSubagentRuns()) {
    return await waitForLegacyConversationSubagents(parentConversationId, timeoutMs)
  }

  const activeRuns = listGatewaySubagentRunsForConversation(parentConversationId, {
    includeCompleted: false
  })

  if (activeRuns.length === 0) {
    return listGatewaySubagentRunsForConversation(parentConversationId)
  }

  const effectiveTimeout = clampWaitTimeout(timeoutMs)
  const startedAt = Date.now()
  const results: SerializedSubagentRun[] = []

  for (const run of activeRuns) {
    const remaining = Math.max(1_000, effectiveTimeout - (Date.now() - startedAt))
    results.push(await waitForGatewaySubagentRun(run.runId, remaining))
  }

  return results
}

export async function killGatewaySubagentRun(runId: string): Promise<SerializedSubagentRun> {
  const localRun = getLegacySubagentRun(runId)
  if (localRun) {
    return killLegacySubagentRun(runId)
  }

  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('subagent.kill', { runId })
  }

  return killLegacySubagentRun(runId)
}

export function shutdownGatewaySubagentRuntime(): void {
  shutdownLegacySubagentRuntime()
}
