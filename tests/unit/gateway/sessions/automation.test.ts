import { beforeEach, describe, expect, it } from 'vitest'

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  createGatewaySession,
  getGatewaySession,
  syncLoopTaskGatewaySession,
  syncSubagentGatewaySession,
  resolveLoopTaskGatewayRoute,
  resolveSubagentGatewayRoute
} from '../../../../src/gateway/sessions'

describe('gateway automation session bridge', () => {
  beforeEach(() => {
    clearGatewaySessionStoreForTests()
  })

  it('syncs loop tasks into automation-scoped gateway sessions', () => {
    const session = syncLoopTaskGatewaySession({
      id: 'task-1',
      spaceId: 'space-1',
      name: 'Nightly build',
      projectDir: '/tmp/project',
      status: 'running',
      storyCount: 2,
      completedCount: 1,
      createdAt: '2026-03-11T09:00:00.000Z',
      updatedAt: '2026-03-11T09:05:00.000Z',
      branchName: 'ralph/nightly-build',
      description: 'Run nightly build automation',
      source: 'manual',
      stories: [
        {
          id: 'US-001',
          title: 'Story 1',
          description: 'Desc 1',
          acceptanceCriteria: ['AC1'],
          priority: 1,
          status: 'completed',
          notes: ''
        },
        {
          id: 'US-002',
          title: 'Story 2',
          description: 'Desc 2',
          acceptanceCriteria: ['AC2'],
          priority: 2,
          status: 'running',
          notes: ''
        }
      ],
      currentStoryIndex: 1,
      iteration: 2,
      maxIterations: 10,
      model: 'gpt-5',
      modelSource: 'openai'
    }, 'loop_task_create')

    expect(session).toMatchObject({
      status: 'active',
      route: {
        agentId: 'loop-task',
        channel: 'automation',
        workspaceId: 'space-1',
        accountId: 'automation-system',
        peerType: 'direct',
        peerId: 'task-1'
      },
      metadata: {
        automationKind: 'loop-task',
        lastReason: 'loop_task_create',
        taskId: 'task-1',
        taskName: 'Nightly build',
        taskStatus: 'running',
        projectDir: '/tmp/project'
      }
    })

    expect(getGatewaySession(resolveLoopTaskGatewayRoute('space-1', 'task-1').sessionKey)).toEqual(session)
  })

  it('inherits the parent route when syncing hosted subagent sessions', () => {
    const parentRoute = resolveRoute({
      channel: 'feishu',
      workspaceId: 'space-1',
      accountId: 'bot-1',
      peerType: 'group',
      peerId: 'chat-1',
      conversationId: 'parent-conv'
    })
    const parentSession = createGatewaySession(parentRoute, { status: 'active' })

    const session = syncSubagentGatewaySession({
      runId: 'run-1',
      parentConversationId: 'parent-conv',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-run-1',
      status: 'running',
      task: 'Inspect repository state',
      label: 'Repo audit',
      spawnedAt: '2026-03-11T09:10:00.000Z',
      toolUseId: 'tool-1'
    }, 'subagent_spawn')

    expect(session).toMatchObject({
      status: 'active',
      route: {
        agentId: 'subagent',
        channel: 'feishu',
        workspaceId: 'space-1',
        accountId: 'bot-1',
        peerType: 'thread',
        peerId: 'subagent-run-1',
        parentPeerType: 'group',
        parentPeerId: 'chat-1'
      },
      conversationIds: ['subagent-run-1'],
      metadata: {
        automationKind: 'subagent',
        lastReason: 'subagent_spawn',
        runId: 'run-1',
        parentConversationId: 'parent-conv',
        childConversationId: 'subagent-run-1',
        parentSessionKey: parentSession.sessionKey,
        parentMainSessionKey: parentSession.mainSessionKey
      }
    })
  })

  it('falls back to automation routes when no parent session exists', () => {
    const route = resolveSubagentGatewayRoute({
      runId: 'run-2',
      parentConversationId: 'missing-parent',
      parentSpaceId: 'space-2',
      childConversationId: 'subagent-run-2',
      status: 'completed',
      task: 'Background cleanup',
      spawnedAt: '2026-03-11T09:15:00.000Z'
    })

    const session = syncSubagentGatewaySession({
      runId: 'run-2',
      parentConversationId: 'missing-parent',
      parentSpaceId: 'space-2',
      childConversationId: 'subagent-run-2',
      status: 'completed',
      task: 'Background cleanup',
      spawnedAt: '2026-03-11T09:15:00.000Z',
      resultSummary: 'Cleanup finished'
    }, 'subagent_restore')

    expect(route).toMatchObject({
      channel: 'automation',
      workspaceId: 'space-2',
      accountId: 'automation-system',
      peerType: 'thread',
      peerId: 'subagent-run-2',
      parentPeerType: 'direct',
      parentPeerId: 'missing-parent'
    })
    expect(session.status).toBe('closed')
    expect(session.metadata).toMatchObject({
      automationKind: 'subagent',
      resultSummary: 'Cleanup finished'
    })
  })
})
