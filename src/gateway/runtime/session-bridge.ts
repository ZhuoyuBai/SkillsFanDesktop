import type { AgentRequest, AgentRouteHint } from '../../main/services/agent/types'
import { resolveRoute } from '../routing'
import {
  type GatewaySessionState,
  type ResolvedRoute,
  upsertGatewaySession
} from '../sessions'

type GatewaySessionBridgeReason = 'send_message' | 'ensure_session_warm'

export interface GatewaySessionBridgeResult {
  route: ResolvedRoute
  session: GatewaySessionState
}

function resolveRouteFromConversation(
  spaceId: string,
  conversationId: string,
  routeHint?: AgentRouteHint
): ResolvedRoute {
  return resolveRoute({
    spaceId,
    conversationId,
    agentId: routeHint?.agentId,
    channel: routeHint?.channel,
    workspaceId: routeHint?.workspaceId,
    accountId: routeHint?.accountId,
    peerType: routeHint?.peerType,
    peerId: routeHint?.peerId,
    parentPeerType: routeHint?.parentPeerType,
    parentPeerId: routeHint?.parentPeerId
  })
}

function upsertRouteSession(
  route: ResolvedRoute,
  reason: GatewaySessionBridgeReason,
  status: GatewaySessionState['status']
): GatewaySessionBridgeResult {
  const session = upsertGatewaySession(route, {
    status,
    metadata: {
      lastReason: reason
    }
  })

  return {
    route,
    session
  }
}

export function bridgeGatewaySessionFromRequest(request: AgentRequest): GatewaySessionBridgeResult {
  const route = resolveRouteFromConversation(
    request.spaceId,
    request.conversationId,
    request.routeHint
  )

  return upsertRouteSession(route, 'send_message', 'active')
}

export function bridgeGatewayWarmSession(
  spaceId: string,
  conversationId: string,
  routeHint?: AgentRouteHint
): GatewaySessionBridgeResult {
  const route = resolveRouteFromConversation(spaceId, conversationId, routeHint)
  return upsertRouteSession(route, 'ensure_session_warm', 'idle')
}
