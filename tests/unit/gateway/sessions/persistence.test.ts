import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  configureGatewaySessionStorePersistence,
  createGatewaySession,
  getGatewaySessionStorePersistenceStatus,
  getGatewaySessionCount,
  hydrateGatewaySessionStoreFromDisk,
  resetGatewaySessionPersistenceForTests
} from '../../../../src/gateway/sessions'

describe('gateway session persistence', () => {
  const testDir = join(tmpdir(), `skillsfan-session-store-${process.pid}`)
  const filePath = join(testDir, 'session-store.json')

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    clearGatewaySessionStoreForTests()
    resetGatewaySessionPersistenceForTests()
    configureGatewaySessionStorePersistence(filePath)
  })

  it('persists the session store after writes and hydrates it back on restart', () => {
    const route = resolveRoute({
      spaceId: 'space-a',
      conversationId: 'conv-1'
    })

    createGatewaySession(route, {
      metadata: { source: 'electron' },
      now: '2026-03-12T09:00:00.000Z'
    })

    expect(existsSync(filePath)).toBe(true)
    expect(getGatewaySessionStorePersistenceStatus()).toEqual(expect.objectContaining({
      sessionCount: 1,
      fileExists: true
    }))
    expect(getGatewaySessionStorePersistenceStatus().snapshotSavedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )

    const snapshot = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]).toMatchObject({
      sessionKey: route.sessionKey,
      conversationIds: ['conv-1']
    })

    clearGatewaySessionStoreForTests()
    expect(getGatewaySessionCount()).toBe(0)

    const restored = hydrateGatewaySessionStoreFromDisk()
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      sessionKey: route.sessionKey,
      conversationIds: ['conv-1']
    })
    expect(getGatewaySessionCount()).toBe(1)
    expect(getGatewaySessionStorePersistenceStatus()).toEqual(expect.objectContaining({
      hydrated: true,
      fileExists: true
    }))
    expect(getGatewaySessionStorePersistenceStatus().snapshotSavedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })
})
