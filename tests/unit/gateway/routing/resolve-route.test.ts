import { describe, expect, it } from 'vitest'

import { resolveRoute } from '../../../../src/gateway/routing/resolve-route'

describe('gateway route resolution', () => {
  it('derives a compatible local route from spaceId + conversationId defaults', () => {
    const route = resolveRoute({
      spaceId: 'space-a',
      conversationId: 'Conversation 001'
    })

    expect(route).toEqual({
      agentId: 'main',
      channel: 'electron',
      accountId: 'local-user',
      peerType: 'direct',
      peerId: 'conversation-001',
      sessionKey: 'agent=main|workspace=space-a|account=local-user|peerType=direct|peerId=conversation-001',
      mainSessionKey: 'agent=main|workspace=space-a|account=local-user|peerType=direct|peerId=conversation-001',
      workspaceId: 'space-a',
      conversationId: 'Conversation 001',
      parentPeerType: undefined,
      parentPeerId: undefined
    })
  })

  it('resolves explicit multi-channel routes without depending on conversation ids', () => {
    const route = resolveRoute({
      agentId: 'Planner',
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'Bot 42',
      peerType: 'group',
      peerId: 'Team Sync'
    })

    expect(route.sessionKey).toBe(
      'agent=planner|workspace=workspace-a|account=bot-42|peerType=group|peerId=team-sync'
    )
    expect(route.mainSessionKey).toBe(route.sessionKey)
    expect(route.channel).toBe('feishu')
  })

  it('keeps thread-specific session keys while pointing mainSessionKey at the parent peer', () => {
    const route = resolveRoute({
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'Bot 42',
      peerType: 'thread',
      peerId: 'Thread 9',
      parentPeerType: 'group',
      parentPeerId: 'Team Sync'
    })

    expect(route.sessionKey).toBe(
      'agent=main|workspace=workspace-a|account=bot-42|peerType=thread|peerId=thread-9'
    )
    expect(route.mainSessionKey).toBe(
      'agent=main|workspace=workspace-a|account=bot-42|peerType=group|peerId=team-sync'
    )
  })
})
