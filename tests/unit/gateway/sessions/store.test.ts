import { beforeEach, describe, expect, it } from 'vitest'

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  createGatewaySession,
  deleteGatewaySession,
  findGatewaySessionsByConversationId,
  findPreferredGatewaySessionByConversationId,
  getGatewaySession,
  getGatewaySessionCount,
  hasGatewaySession,
  listGatewaySessions,
  updateGatewaySession,
  upsertGatewaySession
} from '../../../../src/gateway/sessions'

describe('gateway session store', () => {
  beforeEach(() => {
    clearGatewaySessionStoreForTests()
  })

  it('creates and returns an isolated in-memory session state', () => {
    const route = resolveRoute({
      spaceId: 'space-a',
      conversationId: 'conv-1'
    })

    const session = createGatewaySession(route, {
      metadata: { source: 'electron' },
      now: '2026-03-11T09:00:00.000Z'
    })

    expect(session).toMatchObject({
      sessionKey: route.sessionKey,
      mainSessionKey: route.mainSessionKey,
      status: 'idle',
      conversationIds: ['conv-1'],
      metadata: { source: 'electron' }
    })

    session.conversationIds.push('mutated')
    expect(getGatewaySession(route.sessionKey)?.conversationIds).toEqual(['conv-1'])
    expect(getGatewaySessionCount()).toBe(1)
  })

  it('upserts an existing session by merging conversationIds and metadata while preserving createdAt', () => {
    const initialRoute = resolveRoute({
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'Bot 1',
      peerType: 'group',
      peerId: 'Team Sync',
      conversationId: 'conv-a'
    })

    createGatewaySession(initialRoute, {
      metadata: {
        source: 'feishu',
        priority: 'normal'
      },
      now: '2026-03-11T09:00:00.000Z'
    })

    const nextRoute = resolveRoute({
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'Bot 1',
      peerType: 'group',
      peerId: 'Team Sync',
      conversationId: 'conv-b'
    })

    const updated = upsertGatewaySession(nextRoute, {
      metadata: {
        priority: 'high'
      },
      now: '2026-03-11T09:05:00.000Z'
    })

    expect(updated.createdAt).toBe('2026-03-11T09:00:00.000Z')
    expect(updated.updatedAt).toBe('2026-03-11T09:05:00.000Z')
    expect(updated.conversationIds).toEqual(['conv-a', 'conv-b'])
    expect(updated.metadata).toEqual({
      source: 'feishu',
      priority: 'high'
    })
  })

  it('lists sessions with workspace, mainSessionKey, and conversation filters in updatedAt order', () => {
    const directRoute = resolveRoute({
      channel: 'electron',
      workspaceId: 'workspace-a',
      peerType: 'direct',
      peerId: 'alice',
      conversationId: 'conv-a'
    })
    const threadRoute = resolveRoute({
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'bot-2',
      peerType: 'thread',
      peerId: 'thread-1',
      parentPeerType: 'group',
      parentPeerId: 'room-1',
      conversationId: 'conv-thread'
    })
    const otherWorkspaceRoute = resolveRoute({
      channel: 'remote-web',
      workspaceId: 'workspace-b',
      peerType: 'direct',
      peerId: 'bob',
      conversationId: 'conv-b'
    })

    createGatewaySession(directRoute, { now: '2026-03-11T09:00:00.000Z' })
    createGatewaySession(threadRoute, { now: '2026-03-11T09:10:00.000Z' })
    createGatewaySession(otherWorkspaceRoute, { now: '2026-03-11T09:20:00.000Z' })

    expect(listGatewaySessions({ workspaceId: 'workspace-a' }).map((session) => session.sessionKey)).toEqual([
      threadRoute.sessionKey,
      directRoute.sessionKey
    ])
    expect(listGatewaySessions({ mainSessionKey: threadRoute.mainSessionKey }).map((session) => session.sessionKey)).toEqual([
      threadRoute.sessionKey
    ])
    expect(listGatewaySessions({ conversationId: 'conv-b' }).map((session) => session.sessionKey)).toEqual([
      otherWorkspaceRoute.sessionKey
    ])
  })

  it('resolves conversation lookups to all matching sessions and prefers active ones', () => {
    const idleRoute = resolveRoute({
      channel: 'electron',
      workspaceId: 'workspace-a',
      peerType: 'direct',
      peerId: 'alice',
      conversationId: 'conv-shared'
    })
    const activeRoute = resolveRoute({
      channel: 'feishu',
      workspaceId: 'workspace-a',
      accountId: 'bot-1',
      peerType: 'group',
      peerId: 'team-room',
      conversationId: 'conv-shared'
    })

    createGatewaySession(idleRoute, {
      status: 'idle',
      now: '2026-03-11T09:00:00.000Z'
    })
    createGatewaySession(activeRoute, {
      status: 'active',
      now: '2026-03-11T09:05:00.000Z'
    })

    expect(findGatewaySessionsByConversationId('conv-shared').map((session) => session.sessionKey)).toEqual([
      activeRoute.sessionKey,
      idleRoute.sessionKey
    ])
    expect(findPreferredGatewaySessionByConversationId('conv-shared')?.sessionKey).toBe(
      activeRoute.sessionKey
    )
  })

  it('moves a session when route updates change the session key and supports deletion', () => {
    const route = resolveRoute({
      workspaceId: 'workspace-a',
      peerType: 'direct',
      peerId: 'alice',
      conversationId: 'conv-a'
    })

    createGatewaySession(route, { now: '2026-03-11T09:00:00.000Z' })

    const nextRoute = resolveRoute({
      workspaceId: 'workspace-a',
      peerType: 'direct',
      peerId: 'alice-renamed',
      conversationId: 'conv-a'
    })

    const updated = updateGatewaySession(route.sessionKey, {
      route: nextRoute,
      status: 'active',
      now: '2026-03-11T09:03:00.000Z'
    })

    expect(updated).toMatchObject({
      sessionKey: nextRoute.sessionKey,
      status: 'active'
    })
    expect(hasGatewaySession(route.sessionKey)).toBe(false)
    expect(hasGatewaySession(nextRoute.sessionKey)).toBe(true)

    expect(deleteGatewaySession(nextRoute.sessionKey)).toBe(true)
    expect(getGatewaySession(nextRoute.sessionKey)).toBeNull()
  })
})
