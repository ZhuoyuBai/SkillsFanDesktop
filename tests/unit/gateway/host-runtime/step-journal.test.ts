import { beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  createGatewaySession
} from '../../../../src/gateway/sessions'
import {
  getGatewaySessionStepJournal,
  getGatewayStepJournalTask,
  stepReporterRuntime
} from '../../../../src/gateway/host-runtime'

describe('gateway step journal query', () => {
  const persistenceDir = join(tmpdir(), `skillsfan-host-steps-${process.pid}`)

  beforeEach(() => {
    rmSync(persistenceDir, { recursive: true, force: true })
    mkdirSync(persistenceDir, { recursive: true })
    clearGatewaySessionStoreForTests()
    stepReporterRuntime.clearAll()
    stepReporterRuntime.setPersistenceDir(persistenceDir)
  })

  it('aggregates step journal entries by gateway session', () => {
    const route = resolveRoute({
      workspaceId: 'space-1',
      conversationId: 'conv-1'
    })
    const session = createGatewaySession(route, { status: 'active' })

    stepReporterRuntime.recordStep({
      taskId: 'conv-1',
      category: 'browser',
      action: 'browser_snapshot',
      summary: 'Snapshot'
    })
    stepReporterRuntime.recordStep({
      taskId: 'conv-1',
      category: 'desktop',
      action: 'desktop_click',
      summary: 'Click'
    })

    const journal = getGatewaySessionStepJournal(session.sessionKey)
    expect(journal.sessionKey).toBe(session.sessionKey)
    expect(journal.totalStepCount).toBe(2)
    expect(journal.recoverySource).toBe('mixed')
    expect(journal.tasks).toHaveLength(1)
    expect(journal.tasks[0]).toMatchObject({
      taskId: 'conv-1',
      relation: 'primary',
      stepCount: 2,
      source: 'mixed'
    })
    expect(journal.tasks[0].categories).toEqual(expect.arrayContaining(['browser', 'desktop']))
  })

  it('includes related session task journals when requested', () => {
    const parentRoute = resolveRoute({
      workspaceId: 'space-1',
      accountId: 'user-1',
      peerType: 'direct',
      peerId: 'conv-1',
      conversationId: 'conv-1'
    })
    const childRoute = resolveRoute({
      workspaceId: 'space-1',
      accountId: 'user-1',
      peerType: 'thread',
      peerId: 'sub-1',
      parentPeerType: 'direct',
      parentPeerId: 'conv-1',
      conversationId: 'sub-1'
    })
    const parentSession = createGatewaySession(parentRoute, { status: 'active' })
    createGatewaySession(childRoute, { status: 'active' })

    stepReporterRuntime.recordStep({
      taskId: 'conv-1',
      category: 'browser',
      action: 'browser_snapshot'
    })
    stepReporterRuntime.recordStep({
      taskId: 'sub-1',
      category: 'desktop',
      action: 'desktop_click'
    })

    const journal = getGatewaySessionStepJournal(parentSession.sessionKey, {
      includeRelatedSessions: true
    })
    expect(journal.relatedConversationIds).toEqual(['sub-1'])
    expect(journal.tasks).toHaveLength(2)
    expect(journal.tasks.map((task) => task.relation).sort()).toEqual(['primary', 'related'])
  })

  it('returns unscoped task details for direct task lookups', () => {
    stepReporterRuntime.recordStep({
      taskId: 'browser:connected',
      category: 'browser',
      action: 'browser_list_pages'
    })

    const task = getGatewayStepJournalTask('browser:connected')
    expect(task).toMatchObject({
      taskId: 'browser:connected',
      relation: 'unscoped',
      source: 'mixed',
      stepCount: 1
    })
  })
})
