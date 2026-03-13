import { getGatewaySession, listGatewaySessions } from '../../sessions'
import type { GatewaySessionState } from '../../sessions'
import type { StepReport } from '../types'
import { stepReporterRuntime } from './runtime'

export type GatewayStepJournalTaskSource = 'memory' | 'persisted' | 'mixed'
export type GatewayStepJournalTaskRelation = 'primary' | 'related' | 'unscoped'

export interface GatewayStepJournalTaskEntry {
  taskId: string
  stepCount: number
  firstTimestamp: number | null
  lastTimestamp: number | null
  lastAction?: string
  source: GatewayStepJournalTaskSource
  relation: GatewayStepJournalTaskRelation
  sessionKey?: string
  mainSessionKey?: string
  conversationIds: string[]
  categories: Array<StepReport['category']>
  steps: StepReport[]
}

export interface GatewaySessionStepJournal {
  sessionKey: string
  mainSessionKey: string
  directConversationIds: string[]
  relatedConversationIds: string[]
  matchedTaskIds: string[]
  totalStepCount: number
  recoverySource: 'none' | 'memory' | 'persisted' | 'mixed'
  tasks: GatewayStepJournalTaskEntry[]
  steps: StepReport[]
}

function resolveTaskSource(taskId: string): GatewayStepJournalTaskSource | null {
  const inMemory = stepReporterRuntime.hasInMemoryTask(taskId)
  const persisted = stepReporterRuntime.hasPersistedTask(taskId)

  if (inMemory && persisted) {
    return 'mixed'
  }

  if (persisted) {
    return 'persisted'
  }

  if (inMemory) {
    return 'memory'
  }

  return null
}

function sortSteps(left: StepReport, right: StepReport): number {
  return left.timestamp - right.timestamp || left.stepId.localeCompare(right.stepId)
}

function resolveTaskSession(taskId: string): GatewaySessionState | null {
  return listGatewaySessions({ conversationId: taskId })[0] || null
}

function buildTaskEntry(
  taskId: string,
  relation: GatewayStepJournalTaskRelation
): GatewayStepJournalTaskEntry | null {
  const source = resolveTaskSource(taskId)
  if (!source) {
    return null
  }

  const steps = stepReporterRuntime.listSteps(taskId).sort(sortSteps)
  const session = resolveTaskSession(taskId)

  return {
    taskId,
    stepCount: steps.length,
    firstTimestamp: steps[0]?.timestamp ?? null,
    lastTimestamp: steps[steps.length - 1]?.timestamp ?? null,
    lastAction: steps[steps.length - 1]?.action,
    source,
    relation,
    sessionKey: session?.sessionKey,
    mainSessionKey: session?.mainSessionKey,
    conversationIds: session?.conversationIds || [],
    categories: Array.from(new Set(steps.map((step) => step.category))),
    steps
  }
}

function mergeRecoverySource(
  entries: GatewayStepJournalTaskEntry[]
): GatewaySessionStepJournal['recoverySource'] {
  if (entries.length === 0) {
    return 'none'
  }

  const sources = new Set(entries.map((entry) => entry.source))
  if (sources.size === 1) {
    return entries[0].source
  }

  return 'mixed'
}

export function getGatewaySessionStepJournal(
  sessionKey: string,
  options?: { includeRelatedSessions?: boolean }
): GatewaySessionStepJournal {
  const session = getGatewaySession(sessionKey)

  if (!session) {
    return {
      sessionKey,
      mainSessionKey: sessionKey,
      directConversationIds: [],
      relatedConversationIds: [],
      matchedTaskIds: [],
      totalStepCount: 0,
      recoverySource: 'none',
      tasks: [],
      steps: []
    }
  }

  const includeRelatedSessions = options?.includeRelatedSessions ?? false
  const relatedSessions = includeRelatedSessions
    ? listGatewaySessions({ mainSessionKey: session.mainSessionKey })
      .filter((candidate) => candidate.sessionKey !== session.sessionKey)
    : []

  const directConversationIds = Array.from(new Set(session.conversationIds))
  const relatedConversationIds = Array.from(new Set(
    relatedSessions.flatMap((candidate) => candidate.conversationIds)
  ))
  const directSet = new Set(directConversationIds)
  const relatedSet = new Set(relatedConversationIds)
  const matchedTaskIds = stepReporterRuntime.listTaskIds()
    .filter((taskId) => directSet.has(taskId) || relatedSet.has(taskId))

  const tasks = matchedTaskIds
    .map((taskId) => buildTaskEntry(taskId, directSet.has(taskId) ? 'primary' : 'related'))
    .filter((entry): entry is GatewayStepJournalTaskEntry => Boolean(entry))
    .sort((left, right) => (
      (right.lastTimestamp || 0) - (left.lastTimestamp || 0)
      || left.taskId.localeCompare(right.taskId)
    ))

  const steps = tasks
    .flatMap((entry) => entry.steps)
    .sort(sortSteps)

  return {
    sessionKey: session.sessionKey,
    mainSessionKey: session.mainSessionKey,
    directConversationIds,
    relatedConversationIds,
    matchedTaskIds,
    totalStepCount: steps.length,
    recoverySource: mergeRecoverySource(tasks),
    tasks,
    steps
  }
}

export function getGatewayStepJournalTask(taskId: string): GatewayStepJournalTaskEntry | null {
  return buildTaskEntry(taskId, 'unscoped')
}
