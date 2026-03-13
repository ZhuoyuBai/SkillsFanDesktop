import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'

export type GatewayProcessMode = 'embedded' | 'external'
export type GatewayProcessState =
  | 'inactive'
  | 'embedded-owner'
  | 'external-observed'
  | 'awaiting-external'

interface GatewayProcessRecord {
  version: 1
  pid: number
  mode: GatewayProcessMode
  owner: 'electron-main' | 'external-gateway'
  startedAt: string
  lastHeartbeatAt: string
}

export interface GatewayProcessStatus {
  configuredMode: GatewayProcessMode
  state: GatewayProcessState
  managedByCurrentProcess: boolean
  owner: 'electron-main' | 'external-gateway' | null
  filePath: string | null
  pid: number | null
  startedAt: string | null
  lastHeartbeatAt: string | null
  heartbeatAgeMs: number | null
  lastError: string | null
}

interface GatewayProcessRuntimeState {
  configuredMode: GatewayProcessMode
  filePath: string | null
  managedRecord: GatewayProcessRecord | null
  lastError: string | null
  heartbeatTimer: NodeJS.Timeout | null
}

const HEARTBEAT_INTERVAL_MS = 5000
const EXTERNAL_OBSERVED_HEARTBEAT_MAX_AGE_MS = 15000

let runtimeState: GatewayProcessRuntimeState = {
  configuredMode: 'embedded',
  filePath: null,
  managedRecord: null,
  lastError: null,
  heartbeatTimer: null
}

function clearHeartbeatTimer(): void {
  if (!runtimeState.heartbeatTimer) {
    return
  }

  clearInterval(runtimeState.heartbeatTimer)
  runtimeState.heartbeatTimer = null
}

function readPersistedRecord(): GatewayProcessRecord | null {
  if (!runtimeState.filePath || !existsSync(runtimeState.filePath)) {
    return null
  }

  const data = safeReadJsonSync<GatewayProcessRecord | null>(runtimeState.filePath, null)
  if (!data || typeof data !== 'object') {
    return null
  }

  if (
    data.version !== 1
    || typeof data.pid !== 'number'
    || (data.mode !== 'embedded' && data.mode !== 'external')
    || (data.owner !== 'electron-main' && data.owner !== 'external-gateway')
    || typeof data.startedAt !== 'string'
    || typeof data.lastHeartbeatAt !== 'string'
  ) {
    return null
  }

  return data
}

function persistManagedRecord(): void {
  if (!runtimeState.filePath || !runtimeState.managedRecord) {
    return
  }

  mkdirSync(dirname(runtimeState.filePath), { recursive: true })
  atomicWriteJsonSync(runtimeState.filePath, runtimeState.managedRecord, { backup: true })
}

function updateManagedHeartbeat(): void {
  if (!runtimeState.managedRecord) {
    return
  }

  runtimeState.managedRecord = {
    ...runtimeState.managedRecord,
    lastHeartbeatAt: new Date().toISOString()
  }

  try {
    persistManagedRecord()
    runtimeState.lastError = null
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }
}

function toStatus(record: GatewayProcessRecord | null): GatewayProcessStatus {
  const now = Date.now()
  const heartbeatAgeMs = record ? Math.max(0, now - Date.parse(record.lastHeartbeatAt)) : null
  const hasFreshObservedExternalProcess = Boolean(
    record
    && heartbeatAgeMs !== null
    && heartbeatAgeMs <= EXTERNAL_OBSERVED_HEARTBEAT_MAX_AGE_MS
  )

  let state: GatewayProcessState = 'inactive'
  let managedByCurrentProcess = false

  if (runtimeState.managedRecord) {
    state = runtimeState.managedRecord.mode === 'external' ? 'external-observed' : 'embedded-owner'
    managedByCurrentProcess = true
  } else if (runtimeState.configuredMode === 'external') {
    state = record && hasFreshObservedExternalProcess ? 'external-observed' : 'awaiting-external'
  } else if (record) {
    state = 'external-observed'
  }

  return {
    configuredMode: runtimeState.configuredMode,
    state,
    managedByCurrentProcess,
    owner: record?.owner ?? null,
    filePath: runtimeState.filePath,
    pid: record?.pid ?? null,
    startedAt: record?.startedAt ?? null,
    lastHeartbeatAt: record?.lastHeartbeatAt ?? null,
    heartbeatAgeMs,
    lastError: runtimeState.lastError
  }
}

export function initializeGatewayProcessRuntime(options: {
  filePath: string
  mode: GatewayProcessMode
  manageCurrentProcess?: boolean
  owner?: 'electron-main' | 'external-gateway'
}): GatewayProcessStatus {
  clearHeartbeatTimer()

  runtimeState.filePath = options.filePath
  runtimeState.configuredMode = options.mode
  runtimeState.managedRecord = null
  runtimeState.lastError = null

  if (options.manageCurrentProcess ?? options.mode === 'embedded') {
    const now = new Date().toISOString()
    runtimeState.managedRecord = {
      version: 1,
      pid: process.pid,
      mode: options.mode,
      owner: options.owner || (options.mode === 'external' ? 'external-gateway' : 'electron-main'),
      startedAt: now,
      lastHeartbeatAt: now
    }

    try {
      persistManagedRecord()
      runtimeState.heartbeatTimer = setInterval(() => {
        updateManagedHeartbeat()
      }, HEARTBEAT_INTERVAL_MS)
      runtimeState.heartbeatTimer.unref?.()
    } catch (error) {
      runtimeState.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return getGatewayProcessStatus()
}

export function shutdownGatewayProcessRuntime(): void {
  clearHeartbeatTimer()

  if (runtimeState.managedRecord && runtimeState.filePath) {
    try {
      rmSync(runtimeState.filePath, { force: true })
      rmSync(runtimeState.filePath + '.bak', { force: true })
      rmSync(runtimeState.filePath + '.tmp', { force: true })
    } catch (error) {
      runtimeState.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  runtimeState.managedRecord = null
}

export function getGatewayProcessStatus(): GatewayProcessStatus {
  const record = runtimeState.managedRecord || readPersistedRecord()
  return toStatus(record)
}

export function clearGatewayObservedProcessRecord(): GatewayProcessStatus {
  if (runtimeState.managedRecord) {
    runtimeState.lastError = 'Cannot clear gateway process metadata owned by the current process.'
    return getGatewayProcessStatus()
  }

  if (!runtimeState.filePath) {
    runtimeState.lastError = 'Gateway process file path is not configured.'
    return getGatewayProcessStatus()
  }

  try {
    rmSync(runtimeState.filePath, { force: true })
    rmSync(runtimeState.filePath + '.bak', { force: true })
    rmSync(runtimeState.filePath + '.tmp', { force: true })
    runtimeState.lastError = null
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }

  return getGatewayProcessStatus()
}

export function hasFreshObservedExternalGatewayProcess(
  status: GatewayProcessStatus = getGatewayProcessStatus()
): boolean {
  return (
    status.configuredMode === 'external'
    && !status.managedByCurrentProcess
    && status.pid !== null
    && status.heartbeatAgeMs !== null
    && status.heartbeatAgeMs <= EXTERNAL_OBSERVED_HEARTBEAT_MAX_AGE_MS
  )
}

export function resetGatewayProcessRuntimeForTests(): void {
  clearHeartbeatTimer()
  runtimeState = {
    configuredMode: 'embedded',
    filePath: null,
    managedRecord: null,
    lastError: null,
    heartbeatTimer: null
  }
}
