export type GatewayPeerType = 'direct' | 'group' | 'thread'
export type GatewayMainPeerType = Exclude<GatewayPeerType, 'thread'>

export interface SessionKeyParts {
  agentId: string
  workspaceId: string
  accountId: string
  peerType: GatewayPeerType
  peerId: string
  parentPeerType?: GatewayMainPeerType
  parentPeerId?: string
}

export interface GatewayRouteInput {
  agentId?: string
  channel?: string
  workspaceId?: string
  spaceId?: string
  accountId?: string
  peerType?: GatewayPeerType
  peerId?: string
  parentPeerType?: GatewayMainPeerType
  parentPeerId?: string
  conversationId?: string
}

export interface ResolvedRoute {
  agentId: string
  channel: string
  accountId: string
  peerType: GatewayPeerType
  peerId: string
  sessionKey: string
  mainSessionKey: string
  workspaceId: string
  conversationId?: string
  parentPeerType?: GatewayMainPeerType
  parentPeerId?: string
}

export type GatewaySessionLifecycle = 'idle' | 'active' | 'paused' | 'closed'

export interface GatewaySessionState {
  sessionKey: string
  mainSessionKey: string
  route: ResolvedRoute
  status: GatewaySessionLifecycle
  createdAt: string
  updatedAt: string
  conversationIds: string[]
  metadata?: Record<string, unknown>
}
