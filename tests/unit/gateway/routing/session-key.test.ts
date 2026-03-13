import { describe, expect, it } from 'vitest'

import {
  buildMainSessionKey,
  buildSessionKey,
  normalizeSessionKeyPart
} from '../../../../src/gateway/routing/session-key'

describe('gateway session-key helpers', () => {
  it('normalizes session key parts into deterministic slugs', () => {
    expect(normalizeSessionKeyPart('  Feishu Bot | Team A  ')).toBe('feishu-bot-team-a')
    expect(normalizeSessionKeyPart('')).toBe('unknown')
  })

  it('builds a stable direct/group session key', () => {
    expect(buildSessionKey({
      agentId: 'Main Agent',
      workspaceId: 'Workspace A',
      accountId: 'Local User',
      peerType: 'group',
      peerId: 'Engineering Room'
    })).toBe(
      'agent=main-agent|workspace=workspace-a|account=local-user|peerType=group|peerId=engineering-room'
    )
  })

  it('builds a main session key that collapses thread routes to their parent peer', () => {
    expect(buildMainSessionKey({
      agentId: 'Main Agent',
      workspaceId: 'Workspace A',
      accountId: 'Bot 01',
      peerType: 'thread',
      peerId: 'Thread 9',
      parentPeerType: 'group',
      parentPeerId: 'Room 1'
    })).toBe(
      'agent=main-agent|workspace=workspace-a|account=bot-01|peerType=group|peerId=room-1'
    )
  })
})
