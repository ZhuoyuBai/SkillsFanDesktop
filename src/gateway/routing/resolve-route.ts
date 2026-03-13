import type {
  GatewayMainPeerType,
  GatewayPeerType,
  GatewayRouteInput,
  ResolvedRoute
} from '../sessions'
import {
  buildMainSessionKey,
  buildSessionKey,
  normalizeSessionKeyPart
} from './session-key'

const DEFAULT_AGENT_ID = 'main'
const DEFAULT_CHANNEL = 'electron'
const DEFAULT_WORKSPACE_ID = 'skillsfan-temp'
const DEFAULT_LOCAL_ACCOUNT_ID = 'local-user'

function resolveChannel(channel?: string): string {
  return normalizeSessionKeyPart(channel, DEFAULT_CHANNEL)
}

function resolveWorkspaceId(input: GatewayRouteInput): string {
  return normalizeSessionKeyPart(input.workspaceId || input.spaceId, DEFAULT_WORKSPACE_ID)
}

function resolveAccountId(channel: string, accountId?: string): string {
  if (accountId) {
    return normalizeSessionKeyPart(accountId)
  }

  if (channel === 'electron' || channel === 'remote-web') {
    return DEFAULT_LOCAL_ACCOUNT_ID
  }

  return `${channel}-account`
}

function resolvePeerType(input: GatewayRouteInput): GatewayPeerType {
  if (input.peerType) {
    return input.peerType
  }

  return input.parentPeerId ? 'thread' : 'direct'
}

function resolvePeerId(
  input: GatewayRouteInput,
  peerType: GatewayPeerType,
  channel: string,
  workspaceId: string
): string {
  if (input.peerId) {
    return normalizeSessionKeyPart(input.peerId)
  }

  if (input.conversationId) {
    return normalizeSessionKeyPart(input.conversationId)
  }

  return normalizeSessionKeyPart(`${channel}-${peerType}-${workspaceId}`)
}

function resolveParentPeerType(input: GatewayRouteInput): GatewayMainPeerType | undefined {
  return input.parentPeerType ? normalizeSessionKeyPart(input.parentPeerType) as GatewayMainPeerType : undefined
}

function resolveParentPeerId(input: GatewayRouteInput): string | undefined {
  return input.parentPeerId ? normalizeSessionKeyPart(input.parentPeerId) : undefined
}

export function resolveRoute(input: GatewayRouteInput): ResolvedRoute {
  const channel = resolveChannel(input.channel)
  const agentId = normalizeSessionKeyPart(input.agentId, DEFAULT_AGENT_ID)
  const workspaceId = resolveWorkspaceId(input)
  const accountId = resolveAccountId(channel, input.accountId)
  const peerType = resolvePeerType(input)
  const peerId = resolvePeerId(input, peerType, channel, workspaceId)
  const parentPeerType = resolveParentPeerType(input)
  const parentPeerId = resolveParentPeerId(input)

  const sessionKey = buildSessionKey({
    agentId,
    workspaceId,
    accountId,
    peerType,
    peerId,
    parentPeerType,
    parentPeerId
  })

  const mainSessionKey = buildMainSessionKey({
    agentId,
    workspaceId,
    accountId,
    peerType,
    peerId,
    parentPeerType,
    parentPeerId
  })

  return {
    agentId,
    channel,
    accountId,
    peerType,
    peerId,
    sessionKey,
    mainSessionKey,
    workspaceId,
    conversationId: input.conversationId,
    parentPeerType,
    parentPeerId
  }
}
