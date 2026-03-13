import { beforeEach, describe, expect, it } from 'vitest'

import {
  bridgeGatewaySessionFromRequest,
  bridgeGatewayWarmSession
} from '../../../../src/gateway/runtime/session-bridge'
import {
  clearGatewaySessionStoreForTests,
  getGatewaySession,
  listGatewaySessions
} from '../../../../src/gateway/sessions'

describe('gateway runtime session bridge', () => {
  beforeEach(() => {
    clearGatewaySessionStoreForTests()
  })

  it('creates an active gateway session from a legacy conversation request', () => {
    const result = bridgeGatewaySessionFromRequest({
      spaceId: 'space-a',
      conversationId: 'conv-1',
      message: 'hello'
    } as any)

    expect(result.route.channel).toBe('electron')
    expect(result.session.status).toBe('active')
    expect(result.session.conversationIds).toEqual(['conv-1'])
    expect(result.session.metadata).toEqual({
      lastReason: 'send_message'
    })
    expect(getGatewaySession(result.route.sessionKey)?.route.sessionKey).toBe(result.route.sessionKey)
  })

  it('uses route hints to create distinct multi-channel platform sessions', () => {
    bridgeGatewaySessionFromRequest({
      spaceId: 'space-a',
      conversationId: 'conv-feishu',
      message: 'hello',
      routeHint: {
        channel: 'feishu',
        accountId: 'open-user-1',
        peerType: 'group',
        peerId: 'chat-1'
      }
    } as any)

    bridgeGatewaySessionFromRequest({
      spaceId: 'space-a',
      conversationId: 'conv-remote',
      message: 'hello',
      routeHint: {
        channel: 'remote-web',
        peerType: 'direct',
        peerId: 'browser-tab-1'
      }
    } as any)

    expect(listGatewaySessions().map((session) => session.route.channel).sort()).toEqual([
      'feishu',
      'remote-web'
    ])
  })

  it('records warm-session calls as idle sessions on the same route model', () => {
    const warmed = bridgeGatewayWarmSession('space-a', 'conv-2', {
      channel: 'electron'
    })

    expect(warmed.session.status).toBe('idle')
    expect(warmed.session.metadata).toEqual({
      lastReason: 'ensure_session_warm'
    })
  })
})
