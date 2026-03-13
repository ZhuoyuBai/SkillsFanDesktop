import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'
import type { GatewaySessionState } from './types'

interface GatewaySessionStoreSnapshot {
  version: 1
  savedAt: string
  sessions: GatewaySessionState[]
}

export interface GatewaySessionStorePersistenceStatus {
  enabled: boolean
  filePath: string | null
  hydrated: boolean
  sessionCount: number
  snapshotSavedAt: string | null
  fileExists: boolean
  backupExists: boolean
  lastLoadedAt: string | null
  lastSavedAt: string | null
  lastLoadError: string | null
  lastSaveError: string | null
}

const DEFAULT_SNAPSHOT: GatewaySessionStoreSnapshot = {
  version: 1,
  savedAt: '',
  sessions: []
}

let persistenceStatus: GatewaySessionStorePersistenceStatus = {
  enabled: false,
  filePath: null,
  hydrated: false,
  sessionCount: 0,
  snapshotSavedAt: null,
  fileExists: false,
  backupExists: false,
  lastLoadedAt: null,
  lastSavedAt: null,
  lastLoadError: null,
  lastSaveError: null
}

function cloneSession(session: GatewaySessionState): GatewaySessionState {
  return {
    ...session,
    route: { ...session.route },
    conversationIds: [...session.conversationIds],
    metadata: session.metadata ? { ...session.metadata } : undefined
  }
}

function normalizeSnapshot(data: GatewaySessionStoreSnapshot | null): GatewaySessionState[] {
  if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.sessions)) {
    return []
  }

  return data.sessions
    .filter((session) => (
      session
      && typeof session.sessionKey === 'string'
      && typeof session.mainSessionKey === 'string'
      && session.route
      && typeof session.route.sessionKey === 'string'
      && Array.isArray(session.conversationIds)
    ))
    .map((session) => cloneSession(session))
}

export function configureGatewaySessionPersistence(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  persistenceStatus = {
    ...persistenceStatus,
    enabled: true,
    filePath
  }
}

export function loadGatewaySessionSnapshot(): GatewaySessionState[] {
  if (!persistenceStatus.enabled || !persistenceStatus.filePath || !existsSync(persistenceStatus.filePath)) {
    persistenceStatus = {
      ...persistenceStatus,
      hydrated: true,
      sessionCount: 0,
      snapshotSavedAt: null,
      fileExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath)),
      backupExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath + '.bak')),
      lastLoadedAt: new Date().toISOString(),
      lastLoadError: null
    }
    return []
  }

  try {
    const snapshot = safeReadJsonSync<GatewaySessionStoreSnapshot | null>(
      persistenceStatus.filePath,
      DEFAULT_SNAPSHOT
    )
    const sessions = normalizeSnapshot(snapshot)
    persistenceStatus = {
      ...persistenceStatus,
      hydrated: true,
      sessionCount: sessions.length,
      snapshotSavedAt: snapshot?.savedAt || null,
      fileExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath)),
      backupExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath + '.bak')),
      lastLoadedAt: new Date().toISOString(),
      lastLoadError: null
    }
    return sessions
  } catch (error) {
    persistenceStatus = {
      ...persistenceStatus,
      hydrated: true,
      sessionCount: 0,
      snapshotSavedAt: null,
      fileExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath)),
      backupExists: Boolean(persistenceStatus.filePath && existsSync(persistenceStatus.filePath + '.bak')),
      lastLoadedAt: new Date().toISOString(),
      lastLoadError: error instanceof Error ? error.message : String(error)
    }
    return []
  }
}

export function persistGatewaySessionSnapshot(sessions: GatewaySessionState[]): void {
  if (!persistenceStatus.enabled || !persistenceStatus.filePath) {
    return
  }

  const snapshot: GatewaySessionStoreSnapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    sessions: sessions.map(cloneSession)
  }

  try {
    atomicWriteJsonSync(persistenceStatus.filePath, snapshot, { backup: true })
    persistenceStatus = {
      ...persistenceStatus,
      sessionCount: snapshot.sessions.length,
      snapshotSavedAt: snapshot.savedAt,
      fileExists: existsSync(persistenceStatus.filePath),
      backupExists: existsSync(persistenceStatus.filePath + '.bak'),
      lastSavedAt: snapshot.savedAt,
      lastSaveError: null
    }
  } catch (error) {
    persistenceStatus = {
      ...persistenceStatus,
      lastSaveError: error instanceof Error ? error.message : String(error)
    }
  }
}

export function getGatewaySessionPersistenceStatus(): GatewaySessionStorePersistenceStatus {
  return { ...persistenceStatus }
}

export function resetGatewaySessionPersistenceForTests(): void {
  persistenceStatus = {
    enabled: false,
    filePath: null,
    hydrated: false,
    sessionCount: 0,
    snapshotSavedAt: null,
    fileExists: false,
    backupExists: false,
    lastLoadedAt: null,
    lastSavedAt: null,
    lastLoadError: null,
    lastSaveError: null
  }
}
