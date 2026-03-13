import {
  cloneGatewaySessionState,
  createGatewaySessionState,
  updateGatewaySessionState,
  type CreateGatewaySessionStateOptions,
  type UpdateGatewaySessionStateOptions
} from './state'
import {
  configureGatewaySessionPersistence,
  getGatewaySessionPersistenceStatus,
  loadGatewaySessionSnapshot,
  persistGatewaySessionSnapshot
} from './persistence'
import { getGatewayProcessStatus } from '../process'
import type {
  GatewaySessionLifecycle,
  GatewaySessionState,
  ResolvedRoute
} from './types'

export interface ListGatewaySessionsOptions {
  workspaceId?: string
  mainSessionKey?: string
  agentId?: string
  accountId?: string
  channel?: string
  status?: GatewaySessionLifecycle
  conversationId?: string
}

const sessions = new Map<string, GatewaySessionState>()

function persistStore(): void {
  persistGatewaySessionSnapshot(Array.from(sessions.values()))
}

function sortSessions(left: GatewaySessionState, right: GatewaySessionState): number {
  return right.updatedAt.localeCompare(left.updatedAt) || left.sessionKey.localeCompare(right.sessionKey)
}

function getPreferredSession(
  candidates: GatewaySessionState[]
): GatewaySessionState | null {
  if (candidates.length === 0) {
    return null
  }

  const active = candidates.find((session) => session.status === 'active')
  return active || candidates[0]
}

function shouldReadObservedGatewaySessions(): boolean {
  const processStatus = getGatewayProcessStatus()
  return processStatus.configuredMode === 'external' && !processStatus.managedByCurrentProcess
}

function getReadableSessions(): GatewaySessionState[] {
  if (shouldReadObservedGatewaySessions() && getGatewaySessionPersistenceStatus().enabled) {
    return loadGatewaySessionSnapshot()
      .sort(sortSessions)
      .map(cloneGatewaySessionState)
  }

  return Array.from(sessions.values())
    .sort(sortSessions)
    .map(cloneGatewaySessionState)
}

function matchesFilters(
  session: GatewaySessionState,
  filters: ListGatewaySessionsOptions
): boolean {
  if (filters.workspaceId && session.route.workspaceId !== filters.workspaceId) return false
  if (filters.mainSessionKey && session.mainSessionKey !== filters.mainSessionKey) return false
  if (filters.agentId && session.route.agentId !== filters.agentId) return false
  if (filters.accountId && session.route.accountId !== filters.accountId) return false
  if (filters.channel && session.route.channel !== filters.channel) return false
  if (filters.status && session.status !== filters.status) return false
  if (filters.conversationId && !session.conversationIds.includes(filters.conversationId)) return false

  return true
}

export function createGatewaySession(
  route: ResolvedRoute,
  options: CreateGatewaySessionStateOptions = {}
): GatewaySessionState {
  if (sessions.has(route.sessionKey)) {
    throw new Error(`Gateway session already exists: ${route.sessionKey}`)
  }

  const state = createGatewaySessionState(route, options)
  sessions.set(route.sessionKey, state)
  persistStore()
  return cloneGatewaySessionState(state)
}

export function getGatewaySession(sessionKey: string): GatewaySessionState | null {
  return getReadableSessions().find((session) => session.sessionKey === sessionKey) || null
}

export function hasGatewaySession(sessionKey: string): boolean {
  return Boolean(getGatewaySession(sessionKey))
}

export function upsertGatewaySession(
  route: ResolvedRoute,
  options: UpdateGatewaySessionStateOptions = {}
): GatewaySessionState {
  const existing = sessions.get(route.sessionKey)
  if (!existing) {
    return createGatewaySession(route, options)
  }

  const next = updateGatewaySessionState(existing, {
    ...options,
    route
  })
  sessions.set(route.sessionKey, next)
  persistStore()
  return cloneGatewaySessionState(next)
}

export function updateGatewaySession(
  sessionKey: string,
  options: UpdateGatewaySessionStateOptions = {}
): GatewaySessionState | null {
  const current = sessions.get(sessionKey)
  if (!current) {
    return null
  }

  const next = updateGatewaySessionState(current, options)

  if (next.sessionKey !== sessionKey) {
    sessions.delete(sessionKey)
  }

  sessions.set(next.sessionKey, next)
  persistStore()
  return cloneGatewaySessionState(next)
}

export function listGatewaySessions(filters: ListGatewaySessionsOptions = {}): GatewaySessionState[] {
  return getReadableSessions()
    .filter((session) => matchesFilters(session, filters))
}

export function findGatewaySessionsByConversationId(
  conversationId: string,
  filters: Omit<ListGatewaySessionsOptions, 'conversationId'> = {}
): GatewaySessionState[] {
  return listGatewaySessions({
    ...filters,
    conversationId
  })
}

export function findPreferredGatewaySessionByConversationId(
  conversationId: string,
  filters: Omit<ListGatewaySessionsOptions, 'conversationId'> = {}
): GatewaySessionState | null {
  return getPreferredSession(findGatewaySessionsByConversationId(conversationId, filters))
}

export function deleteGatewaySession(sessionKey: string): boolean {
  const deleted = sessions.delete(sessionKey)
  if (deleted) {
    persistStore()
  }
  return deleted
}

export function getGatewaySessionCount(): number {
  return getReadableSessions().length
}

export function clearGatewaySessionStoreForTests(): void {
  sessions.clear()
}

export function configureGatewaySessionStorePersistence(filePath: string): void {
  configureGatewaySessionPersistence(filePath)
}

export function hydrateGatewaySessionStoreFromDisk(): GatewaySessionState[] {
  sessions.clear()

  const restored = loadGatewaySessionSnapshot()
  for (const session of restored) {
    sessions.set(session.sessionKey, cloneGatewaySessionState(session))
  }

  return restored.map(cloneGatewaySessionState)
}

export function getGatewaySessionStorePersistenceStatus() {
  return getGatewaySessionPersistenceStatus()
}
