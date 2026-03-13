import type {
  GatewayMainPeerType,
  GatewayPeerType,
  SessionKeyParts
} from '../sessions'

const DEFAULT_SEGMENT_FALLBACK = 'unknown'

export function normalizeSessionKeyPart(
  value: string | null | undefined,
  fallback = DEFAULT_SEGMENT_FALLBACK
): string {
  const normalized = (value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[|=]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || fallback
}

function serializeSessionKey(
  agentId: string,
  workspaceId: string,
  accountId: string,
  peerType: GatewayPeerType,
  peerId: string
): string {
  return [
    `agent=${normalizeSessionKeyPart(agentId)}`,
    `workspace=${normalizeSessionKeyPart(workspaceId)}`,
    `account=${normalizeSessionKeyPart(accountId)}`,
    `peerType=${normalizeSessionKeyPart(peerType)}`,
    `peerId=${normalizeSessionKeyPart(peerId)}`
  ].join('|')
}

function resolveMainPeerType(parts: SessionKeyParts): GatewayMainPeerType | GatewayPeerType {
  if (parts.peerType !== 'thread') {
    return parts.peerType
  }

  return parts.parentPeerType || parts.peerType
}

function resolveMainPeerId(parts: SessionKeyParts): string {
  if (parts.peerType !== 'thread') {
    return parts.peerId
  }

  return parts.parentPeerId || parts.peerId
}

export function buildSessionKey(parts: SessionKeyParts): string {
  return serializeSessionKey(
    parts.agentId,
    parts.workspaceId,
    parts.accountId,
    parts.peerType,
    parts.peerId
  )
}

export function buildMainSessionKey(parts: SessionKeyParts): string {
  return serializeSessionKey(
    parts.agentId,
    parts.workspaceId,
    parts.accountId,
    resolveMainPeerType(parts),
    resolveMainPeerId(parts)
  )
}
