import type {
  GatewaySessionLifecycle,
  GatewaySessionState,
  ResolvedRoute
} from './types'

export interface CreateGatewaySessionStateOptions {
  status?: GatewaySessionLifecycle
  metadata?: Record<string, unknown>
  conversationId?: string
  conversationIds?: string[]
  now?: string
}

export interface UpdateGatewaySessionStateOptions extends CreateGatewaySessionStateOptions {
  route?: ResolvedRoute
}

function normalizeConversationIds(values: Array<string | undefined>): string[] {
  const unique = new Set<string>()

  for (const value of values) {
    if (!value) {
      continue
    }

    const normalized = value.trim()
    if (!normalized) {
      continue
    }

    unique.add(normalized)
  }

  return Array.from(unique)
}

function resolveNow(now?: string): string {
  return now || new Date().toISOString()
}

export function cloneGatewaySessionState(state: GatewaySessionState): GatewaySessionState {
  return {
    ...state,
    route: { ...state.route },
    conversationIds: [...state.conversationIds],
    metadata: state.metadata ? { ...state.metadata } : undefined
  }
}

export function createGatewaySessionState(
  route: ResolvedRoute,
  options: CreateGatewaySessionStateOptions = {}
): GatewaySessionState {
  const now = resolveNow(options.now)

  return {
    sessionKey: route.sessionKey,
    mainSessionKey: route.mainSessionKey,
    route: { ...route },
    status: options.status || 'idle',
    createdAt: now,
    updatedAt: now,
    conversationIds: normalizeConversationIds([
      route.conversationId,
      options.conversationId,
      ...(options.conversationIds || [])
    ]),
    metadata: options.metadata ? { ...options.metadata } : undefined
  }
}

export function updateGatewaySessionState(
  current: GatewaySessionState,
  options: UpdateGatewaySessionStateOptions = {}
): GatewaySessionState {
  const route = options.route ? { ...options.route } : { ...current.route }
  const metadata = options.metadata
    ? {
        ...(current.metadata || {}),
        ...options.metadata
      }
    : current.metadata

  return {
    ...current,
    sessionKey: route.sessionKey,
    mainSessionKey: route.mainSessionKey,
    route,
    status: options.status || current.status,
    updatedAt: resolveNow(options.now),
    conversationIds: normalizeConversationIds([
      ...current.conversationIds,
      route.conversationId,
      options.conversationId,
      ...(options.conversationIds || [])
    ]),
    metadata: metadata ? { ...metadata } : undefined
  }
}
