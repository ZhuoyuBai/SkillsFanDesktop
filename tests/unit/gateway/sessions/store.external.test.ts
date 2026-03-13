import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initializeGatewayProcessRuntime, resetGatewayProcessRuntimeForTests, shutdownGatewayProcessRuntime } from '../../../../src/gateway/process'
import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  configureGatewaySessionStorePersistence,
  createGatewaySession,
  getGatewaySession,
  getGatewaySessionCount,
  listGatewaySessions
} from '../../../../src/gateway/sessions'
import { resetGatewaySessionPersistenceForTests } from '../../../../src/gateway/sessions/persistence'

describe('gateway session store external observer reads', () => {
  const testDir = join(tmpdir(), `skillsfan-gateway-session-observer-${process.pid}`)
  const processFilePath = join(testDir, 'process.json')
  const snapshotFilePath = join(testDir, 'session-store.json')

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    clearGatewaySessionStoreForTests()
    resetGatewaySessionPersistenceForTests()
    resetGatewayProcessRuntimeForTests()
  })

  afterEach(() => {
    shutdownGatewayProcessRuntime()
    resetGatewayProcessRuntimeForTests()
    resetGatewaySessionPersistenceForTests()
    clearGatewaySessionStoreForTests()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('reads sessions from the persisted snapshot when observing an external gateway process', () => {
    configureGatewaySessionStorePersistence(snapshotFilePath)

    const route = resolveRoute({
      channel: 'electron',
      workspaceId: 'space-1',
      peerType: 'direct',
      peerId: 'conv-1',
      conversationId: 'conv-1'
    })

    createGatewaySession(route, {
      status: 'active',
      now: '2026-03-12T08:00:00.000Z'
    })

    clearGatewaySessionStoreForTests()
    initializeGatewayProcessRuntime({
      filePath: processFilePath,
      mode: 'external'
    })

    expect(getGatewaySessionCount()).toBe(1)
    expect(getGatewaySession(route.sessionKey)).toMatchObject({
      sessionKey: route.sessionKey,
      status: 'active',
      conversationIds: ['conv-1']
    })
    expect(listGatewaySessions({ workspaceId: 'space-1' })).toEqual([
      expect.objectContaining({
        sessionKey: route.sessionKey
      })
    ])
  })
})
