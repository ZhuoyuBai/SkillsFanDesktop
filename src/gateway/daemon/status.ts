import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'

export type GatewayDaemonManager =
  | 'launch-agent'
  | 'systemd'
  | 'task-scheduler'
  | 'manual'

export type GatewayDaemonState =
  | 'manual-only'
  | 'available'
  | 'registered'
  | 'error'

export type GatewayDaemonLockState =
  | 'inactive'
  | 'owned'
  | 'observed'
  | 'stale'
  | 'error'

interface GatewayDaemonRegistrationRecord {
  version: 1
  manager: GatewayDaemonManager
  desiredMode: 'manual' | 'daemon'
  registeredAt: string
  updatedAt: string
  autoStartEnabled: boolean
}

interface GatewayDaemonLockRecord {
  version: 1
  pid: number
  owner: 'desktop-app' | 'external-gateway'
  acquiredAt: string
  lastHeartbeatAt: string
}

export interface GatewayDaemonStatus {
  supported: boolean
  manager: GatewayDaemonManager
  state: GatewayDaemonState
  desiredMode: 'manual' | 'daemon'
  installable: boolean
  registered: boolean
  autoStartEnabled: boolean
  statusFilePath: string | null
  lockFilePath: string | null
  statusFileExists: boolean
  lockFileExists: boolean
  registeredAt: string | null
  updatedAt: string | null
  lockState: GatewayDaemonLockState
  lockOwner: 'desktop-app' | 'external-gateway' | null
  lockPid: number | null
  lockAcquiredAt: string | null
  lockLastHeartbeatAt: string | null
  lockHeartbeatAgeMs: number | null
  note: string
  lastError: string | null
}

interface GatewayDaemonRuntimeState {
  desiredMode: 'manual' | 'daemon'
  statusFilePath: string | null
  lockFilePath: string | null
  lastError: string | null
  lockHeartbeatTimer: NodeJS.Timeout | null
  managedLockRecord: GatewayDaemonLockRecord | null
}

const LOCK_HEARTBEAT_INTERVAL_MS = 5000
const STALE_LOCK_AGE_MS = 15000

let runtimeState: GatewayDaemonRuntimeState = {
  desiredMode: 'manual',
  statusFilePath: null,
  lockFilePath: null,
  lastError: null,
  lockHeartbeatTimer: null,
  managedLockRecord: null
}

function resolveDaemonManager(): GatewayDaemonManager {
  switch (process.platform) {
    case 'darwin':
      return 'launch-agent'
    case 'linux':
      return 'systemd'
    case 'win32':
      return 'task-scheduler'
    default:
      return 'manual'
  }
}

function isDaemonManagerSupported(manager: GatewayDaemonManager): boolean {
  return manager !== 'manual'
}

function clearLockHeartbeatTimer(): void {
  if (!runtimeState.lockHeartbeatTimer) {
    return
  }

  clearInterval(runtimeState.lockHeartbeatTimer)
  runtimeState.lockHeartbeatTimer = null
}

function readRegistrationRecord(): GatewayDaemonRegistrationRecord | null {
  if (!runtimeState.statusFilePath || !existsSync(runtimeState.statusFilePath)) {
    return null
  }

  const data = safeReadJsonSync<GatewayDaemonRegistrationRecord | null>(runtimeState.statusFilePath, null)
  if (!data || typeof data !== 'object') {
    return null
  }

  if (
    data.version !== 1
    || typeof data.manager !== 'string'
    || (data.desiredMode !== 'manual' && data.desiredMode !== 'daemon')
    || typeof data.registeredAt !== 'string'
    || typeof data.updatedAt !== 'string'
    || typeof data.autoStartEnabled !== 'boolean'
  ) {
    return null
  }

  return data
}

function persistRegistrationRecord(record: GatewayDaemonRegistrationRecord): void {
  if (!runtimeState.statusFilePath) {
    throw new Error('Gateway daemon status file path is not configured.')
  }

  mkdirSync(dirname(runtimeState.statusFilePath), { recursive: true })
  atomicWriteJsonSync(runtimeState.statusFilePath, record, { backup: true })
}

function readLockRecord(): GatewayDaemonLockRecord | null {
  if (!runtimeState.lockFilePath || !existsSync(runtimeState.lockFilePath)) {
    return null
  }

  const data = safeReadJsonSync<GatewayDaemonLockRecord | null>(runtimeState.lockFilePath, null)
  if (!data || typeof data !== 'object') {
    return null
  }

  if (
    data.version !== 1
    || typeof data.pid !== 'number'
    || (data.owner !== 'desktop-app' && data.owner !== 'external-gateway')
    || typeof data.acquiredAt !== 'string'
    || typeof data.lastHeartbeatAt !== 'string'
  ) {
    return null
  }

  return data
}

function persistManagedLockRecord(): void {
  if (!runtimeState.lockFilePath || !runtimeState.managedLockRecord) {
    return
  }

  mkdirSync(dirname(runtimeState.lockFilePath), { recursive: true })
  atomicWriteJsonSync(runtimeState.lockFilePath, runtimeState.managedLockRecord, { backup: true })
}

function updateManagedLockHeartbeat(): void {
  if (!runtimeState.managedLockRecord) {
    return
  }

  runtimeState.managedLockRecord = {
    ...runtimeState.managedLockRecord,
    lastHeartbeatAt: new Date().toISOString()
  }

  try {
    persistManagedLockRecord()
    runtimeState.lastError = null
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }
}

export function configureGatewayDaemonStatus(options: {
  desiredMode?: 'manual' | 'daemon'
  statusFilePath?: string
  lockFilePath?: string
}): GatewayDaemonStatus {
  runtimeState = {
    ...runtimeState,
    ...(options.desiredMode ? { desiredMode: options.desiredMode } : {}),
    ...(options.statusFilePath ? { statusFilePath: options.statusFilePath } : {}),
    ...(options.lockFilePath ? { lockFilePath: options.lockFilePath } : {})
  }

  return getGatewayDaemonStatus()
}

export function setGatewayDaemonError(message: string | null): void {
  runtimeState.lastError = message
}

export function registerGatewayDaemon(options?: { autoStartEnabled?: boolean }): GatewayDaemonStatus {
  const manager = resolveDaemonManager()

  if (!runtimeState.statusFilePath) {
    setGatewayDaemonError('Gateway daemon status file path is not configured.')
    return getGatewayDaemonStatus()
  }

  const now = new Date().toISOString()
  const current = readRegistrationRecord()
  const record: GatewayDaemonRegistrationRecord = {
    version: 1,
    manager,
    desiredMode: 'daemon',
    registeredAt: current?.registeredAt || now,
    updatedAt: now,
    autoStartEnabled: options?.autoStartEnabled ?? true
  }

  try {
    runtimeState.desiredMode = 'daemon'
    persistRegistrationRecord(record)
    runtimeState.lastError = null
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }

  return getGatewayDaemonStatus()
}

export function unregisterGatewayDaemon(): GatewayDaemonStatus {
  runtimeState.desiredMode = 'manual'

  if (runtimeState.statusFilePath) {
    try {
      rmSync(runtimeState.statusFilePath, { force: true })
      rmSync(`${runtimeState.statusFilePath}.bak`, { force: true })
      rmSync(`${runtimeState.statusFilePath}.tmp`, { force: true })
      runtimeState.lastError = null
    } catch (error) {
      runtimeState.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return getGatewayDaemonStatus()
}

export function clearGatewayDaemonObservedLock(): GatewayDaemonStatus {
  if (runtimeState.managedLockRecord) {
    runtimeState.lastError = 'Cannot clear a gateway daemon lock owned by the current process.'
    return getGatewayDaemonStatus()
  }

  if (!runtimeState.lockFilePath) {
    runtimeState.lastError = 'Gateway daemon lock file path is not configured.'
    return getGatewayDaemonStatus()
  }

  try {
    rmSync(runtimeState.lockFilePath, { force: true })
    rmSync(`${runtimeState.lockFilePath}.bak`, { force: true })
    rmSync(`${runtimeState.lockFilePath}.tmp`, { force: true })
    runtimeState.lastError = null
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }

  return getGatewayDaemonStatus()
}

export function initializeGatewayDaemonLockRuntime(options?: {
  processRole?: 'desktop-app' | 'external-gateway'
}): GatewayDaemonStatus {
  clearLockHeartbeatTimer()

  if (!runtimeState.lockFilePath) {
    setGatewayDaemonError('Gateway daemon lock file path is not configured.')
    return getGatewayDaemonStatus()
  }

  const now = new Date().toISOString()
  runtimeState.managedLockRecord = {
    version: 1,
    pid: process.pid,
    owner: options?.processRole || 'desktop-app',
    acquiredAt: now,
    lastHeartbeatAt: now
  }

  try {
    persistManagedLockRecord()
    runtimeState.lastError = null
    runtimeState.lockHeartbeatTimer = setInterval(() => {
      updateManagedLockHeartbeat()
    }, LOCK_HEARTBEAT_INTERVAL_MS)
    runtimeState.lockHeartbeatTimer.unref?.()
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
  }

  return getGatewayDaemonStatus()
}

export function shutdownGatewayDaemonLockRuntime(): void {
  clearLockHeartbeatTimer()

  if (runtimeState.managedLockRecord && runtimeState.lockFilePath) {
    try {
      rmSync(runtimeState.lockFilePath, { force: true })
      rmSync(`${runtimeState.lockFilePath}.bak`, { force: true })
      rmSync(`${runtimeState.lockFilePath}.tmp`, { force: true })
      runtimeState.lastError = null
    } catch (error) {
      runtimeState.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  runtimeState.managedLockRecord = null
}

export function getGatewayDaemonStatus(): GatewayDaemonStatus {
  const manager = resolveDaemonManager()
  const supported = isDaemonManagerSupported(manager)
  const registrationRecord = readRegistrationRecord()
  const lockRecord = runtimeState.managedLockRecord || readLockRecord()
  const registered = Boolean(registrationRecord)
  const statusFileExists = Boolean(runtimeState.statusFilePath && existsSync(runtimeState.statusFilePath))
  const lockFileExists = Boolean(runtimeState.lockFilePath && existsSync(runtimeState.lockFilePath))
  const lockHeartbeatAgeMs = lockRecord
    ? Math.max(0, Date.now() - Date.parse(lockRecord.lastHeartbeatAt))
    : null
  const installable = supported

  let state: GatewayDaemonState = 'manual-only'
  if (runtimeState.lastError) {
    state = 'error'
  } else if (registered) {
    state = 'registered'
  } else if (runtimeState.desiredMode === 'daemon' && supported) {
    state = 'available'
  }

  const note = runtimeState.lastError
    ? 'Gateway daemon integration reported an error.'
    : runtimeState.desiredMode === 'daemon' && supported
      ? `Gateway daemon integration can use ${manager}.`
      : supported
        ? `Gateway daemon integration is available via ${manager}, but manual mode is active.`
        : 'Gateway daemon integration is not available on this platform.'

  const lockState: GatewayDaemonLockState = runtimeState.lastError
    ? 'error'
    : runtimeState.managedLockRecord
      ? 'owned'
      : !lockRecord
        ? 'inactive'
        : lockHeartbeatAgeMs != null && lockHeartbeatAgeMs > STALE_LOCK_AGE_MS
          ? 'stale'
          : 'observed'

  return {
    supported,
    manager,
    state,
    desiredMode: runtimeState.desiredMode,
    installable,
    registered,
    autoStartEnabled: registrationRecord?.autoStartEnabled || false,
    statusFilePath: runtimeState.statusFilePath,
    lockFilePath: runtimeState.lockFilePath,
    statusFileExists,
    lockFileExists,
    registeredAt: registrationRecord?.registeredAt || null,
    updatedAt: registrationRecord?.updatedAt || null,
    lockState,
    lockOwner: lockRecord?.owner ?? null,
    lockPid: lockRecord?.pid ?? null,
    lockAcquiredAt: lockRecord?.acquiredAt ?? null,
    lockLastHeartbeatAt: lockRecord?.lastHeartbeatAt ?? null,
    lockHeartbeatAgeMs,
    note,
    lastError: runtimeState.lastError
  }
}

export function resetGatewayDaemonStatusForTests(): void {
  clearLockHeartbeatTimer()
  runtimeState = {
    desiredMode: 'manual',
    statusFilePath: null,
    lockFilePath: null,
    lastError: null,
    lockHeartbeatTimer: null,
    managedLockRecord: null
  }
}
