import type { LoopTask, TaskStatus } from '../../shared/types/loop-task'
import type { SubagentRun, SubagentRunStatus } from '../../main/services/agent/subagent/types'
import { resolveRoute } from '../routing'
import {
  deleteGatewaySession,
  findPreferredGatewaySessionByConversationId,
  upsertGatewaySession
} from './store'
import type {
  GatewayMainPeerType,
  GatewaySessionLifecycle,
  GatewaySessionState,
  ResolvedRoute
} from './types'

const AUTOMATION_CHANNEL = 'automation'
const AUTOMATION_ACCOUNT_ID = 'automation-system'

type GatewayAutomationReason =
  | 'loop_task_create'
  | 'loop_task_update'
  | 'loop_task_restore'
  | 'subagent_spawn'
  | 'subagent_update'
  | 'subagent_restore'

interface AutomationParentDescriptor {
  workspaceId: string
  channel: string
  accountId: string
  parentPeerType: GatewayMainPeerType
  parentPeerId: string
  parentSession: GatewaySessionState | null
}

function mapLoopTaskStatus(status: TaskStatus): GatewaySessionLifecycle {
  switch (status) {
    case 'running':
      return 'active'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'closed'
    case 'failed':
      return 'paused'
    case 'idle':
    default:
      return 'idle'
  }
}

function mapSubagentStatus(status: SubagentRunStatus): GatewaySessionLifecycle {
  switch (status) {
    case 'queued':
    case 'running':
    case 'waiting_announce':
      return 'active'
    case 'completed':
    case 'failed':
    case 'killed':
    case 'timeout':
    default:
      return 'closed'
  }
}

function resolveAutomationParentDescriptor(
  parentConversationId: string,
  parentSpaceId: string
): AutomationParentDescriptor {
  const parentSession = findPreferredGatewaySessionByConversationId(parentConversationId, {
    workspaceId: parentSpaceId
  })

  if (!parentSession) {
    return {
      workspaceId: parentSpaceId,
      channel: AUTOMATION_CHANNEL,
      accountId: AUTOMATION_ACCOUNT_ID,
      parentPeerType: 'direct',
      parentPeerId: parentConversationId,
      parentSession: null
    }
  }

  if (parentSession.route.peerType === 'thread') {
    return {
      workspaceId: parentSession.route.workspaceId,
      channel: parentSession.route.channel,
      accountId: parentSession.route.accountId,
      parentPeerType: parentSession.route.parentPeerType || 'direct',
      parentPeerId: parentSession.route.parentPeerId || parentConversationId,
      parentSession
    }
  }

  return {
    workspaceId: parentSession.route.workspaceId,
    channel: parentSession.route.channel,
    accountId: parentSession.route.accountId,
    parentPeerType: parentSession.route.peerType,
    parentPeerId: parentSession.route.peerId,
    parentSession
  }
}

export function resolveLoopTaskGatewayRoute(spaceId: string, taskId: string): ResolvedRoute {
  return resolveRoute({
    agentId: 'loop-task',
    channel: AUTOMATION_CHANNEL,
    workspaceId: spaceId,
    accountId: AUTOMATION_ACCOUNT_ID,
    peerType: 'direct',
    peerId: taskId
  })
}

export function syncLoopTaskGatewaySession(
  task: LoopTask,
  reason: GatewayAutomationReason = 'loop_task_update'
): GatewaySessionState {
  return upsertGatewaySession(resolveLoopTaskGatewayRoute(task.spaceId, task.id), {
    status: mapLoopTaskStatus(task.status),
    metadata: {
      automationKind: 'loop-task',
      lastReason: reason,
      taskId: task.id,
      taskName: task.name,
      taskStatus: task.status,
      storyCount: task.stories.length,
      completedCount: task.completedCount,
      projectDir: task.projectDir,
      model: task.model,
      modelSource: task.modelSource
    }
  })
}

export function deleteLoopTaskGatewaySession(spaceId: string, taskId: string): boolean {
  return deleteGatewaySession(resolveLoopTaskGatewayRoute(spaceId, taskId).sessionKey)
}

export function resolveSubagentGatewayRoute(run: SubagentRun): ResolvedRoute {
  const parent = resolveAutomationParentDescriptor(run.parentConversationId, run.parentSpaceId)

  return resolveRoute({
    agentId: 'subagent',
    channel: parent.channel,
    workspaceId: parent.workspaceId,
    accountId: parent.accountId,
    peerType: 'thread',
    peerId: run.childConversationId,
    parentPeerType: parent.parentPeerType,
    parentPeerId: parent.parentPeerId,
    conversationId: run.childConversationId
  })
}

export function syncSubagentGatewaySession(
  run: SubagentRun,
  reason: GatewayAutomationReason = 'subagent_update'
): GatewaySessionState {
  const parent = resolveAutomationParentDescriptor(run.parentConversationId, run.parentSpaceId)

  return upsertGatewaySession(resolveSubagentGatewayRoute(run), {
    status: mapSubagentStatus(run.status),
    metadata: {
      automationKind: 'subagent',
      lastReason: reason,
      runId: run.runId,
      parentConversationId: run.parentConversationId,
      childConversationId: run.childConversationId,
      subagentStatus: run.status,
      task: run.task,
      label: run.label,
      toolUseId: run.toolUseId,
      model: run.model,
      modelSource: run.modelSource,
      latestSummary: run.latestSummary,
      resultSummary: run.resultSummary,
      error: run.error,
      announcedAt: run.announcedAt,
      parentSessionKey: parent.parentSession?.sessionKey,
      parentMainSessionKey: parent.parentSession?.mainSessionKey
    }
  })
}
