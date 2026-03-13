import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  configureGatewaySessionStorePersistence,
  createGatewaySession,
  hydrateGatewaySessionStoreFromDisk,
  resetGatewaySessionPersistenceForTests,
  syncLoopTaskGatewaySession,
  syncSubagentGatewaySession
} from '../../../../src/gateway/sessions'
import { getAutomationDiagnostics } from '../../../../src/gateway/automation/diagnostics'
import { getLoopTasksBySessionKey } from '../../../../src/gateway/automation/loop-task'
import { stepReporterRuntime } from '../../../../src/gateway/host-runtime'

function makeLoopTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    spaceId: 'space-1',
    name: 'Daily deploy',
    projectDir: '/tmp/proj',
    status: 'running' as const,
    storyCount: 3,
    completedCount: 1,
    createdAt: '2026-03-11T00:00:00.000Z',
    updatedAt: '2026-03-11T01:00:00.000Z',
    branchName: 'ralph/daily-deploy',
    description: 'Deploy automation',
    source: 'manual' as const,
    stories: [],
    currentStoryIndex: 0,
    iteration: 1,
    maxIterations: 5,
    ...overrides
  }
}

describe('gateway automation diagnostics', () => {
  const tempRoot = join(tmpdir(), `skillsfan-automation-diagnostics-${process.pid}`)

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
    mkdirSync(tempRoot, { recursive: true })
    clearGatewaySessionStoreForTests()
    resetGatewaySessionPersistenceForTests()
    configureGatewaySessionStorePersistence(join(tempRoot, 'session-store.json'))
    hydrateGatewaySessionStoreFromDisk()
    stepReporterRuntime.clearAll()
    stepReporterRuntime.setPersistenceDir(join(tempRoot, 'host-steps'))
  })

  describe('getLoopTasksBySessionKey', () => {
    it('returns loop task diagnostic entry when matching by sessionKey', () => {
      const task = makeLoopTask()
      const session = syncLoopTaskGatewaySession(task, 'loop_task_create')

      const results = getLoopTasksBySessionKey(session.sessionKey)
      expect(results).toHaveLength(1)
      expect(results[0].taskId).toBe('task-1')
      expect(results[0].taskName).toBe('Daily deploy')
      expect(results[0].taskStatus).toBe('running')
      expect(results[0].session.sessionKey).toBe(session.sessionKey)
    })

    it('returns empty array when sessionKey does not match', () => {
      syncLoopTaskGatewaySession(makeLoopTask(), 'loop_task_create')

      const results = getLoopTasksBySessionKey('nonexistent-key')
      expect(results).toHaveLength(0)
    })

    it('returns loop tasks matching by mainSessionKey', () => {
      const session = syncLoopTaskGatewaySession(makeLoopTask(), 'loop_task_create')

      const results = getLoopTasksBySessionKey(session.mainSessionKey)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((r) => r.taskId === 'task-1')).toBe(true)
    })
  })

  describe('getAutomationDiagnostics', () => {
    it('returns session and empty arrays when no automation data exists', () => {
      const route = resolveRoute({
        channel: 'electron',
        workspaceId: 'space-1',
        conversationId: 'conv-1'
      })
      const session = createGatewaySession(route, { status: 'active' })

      const diag = getAutomationDiagnostics(session.sessionKey)
      expect(diag.sessionKey).toBe(session.sessionKey)
      expect(diag.session).toBeTruthy()
      expect(diag.loopTasks).toHaveLength(0)
      expect(diag.subagentSessions).toHaveLength(0)
      expect(diag.stepJournal.totalStepCount).toBe(0)
      expect(diag.recovery.source).toBe('session-store')
    })

    it('returns null session for unknown sessionKey', () => {
      const diag = getAutomationDiagnostics('unknown-key')
      expect(diag.session).toBeNull()
      expect(diag.relatedSessions).toHaveLength(0)
      expect(diag.recovery.source).toBe('none')
    })

    it('aggregates subagent sessions under a parent session', () => {
      const parentRoute = resolveRoute({
        channel: 'electron',
        workspaceId: 'space-1',
        accountId: 'user-1',
        peerType: 'direct',
        peerId: 'conv-1',
        conversationId: 'conv-1'
      })
      const parentSession = createGatewaySession(parentRoute, { status: 'active' })

      syncSubagentGatewaySession({
        runId: 'run-1',
        parentConversationId: 'conv-1',
        parentSpaceId: 'space-1',
        childConversationId: 'subagent-run-1',
        status: 'running',
        task: 'Research task',
        spawnedAt: '2026-03-11T10:00:00.000Z'
      }, 'subagent_spawn')

      const diag = getAutomationDiagnostics(parentSession.sessionKey)
      expect(diag.subagentSessions).toHaveLength(1)
      expect(diag.subagentSessions[0].metadata?.runId).toBe('run-1')
    })

    it('aggregates loop task diagnostics', () => {
      const task = makeLoopTask()
      const session = syncLoopTaskGatewaySession(task, 'loop_task_create')

      const diag = getAutomationDiagnostics(session.sessionKey)
      expect(diag.loopTasks).toHaveLength(1)
      expect(diag.loopTasks[0].taskId).toBe('task-1')
    })

    it('includes step journal recovery state for matched session tasks', () => {
      const route = resolveRoute({
        channel: 'electron',
        workspaceId: 'space-1',
        conversationId: 'conv-1'
      })
      const session = createGatewaySession(route, { status: 'active' })

      stepReporterRuntime.recordStep({
        taskId: 'conv-1',
        category: 'browser',
        action: 'browser_snapshot'
      })

      const diag = getAutomationDiagnostics(session.sessionKey)
      expect(diag.stepJournal.totalStepCount).toBe(1)
      expect(diag.stepJournal.tasks[0]).toMatchObject({
        taskId: 'conv-1',
        relation: 'primary'
      })
      expect(diag.recovery).toEqual(expect.objectContaining({
        matchedTaskCount: 1,
        persistedTaskCount: 1,
        source: 'session-store+step-journal'
      }))
    })
  })
})
