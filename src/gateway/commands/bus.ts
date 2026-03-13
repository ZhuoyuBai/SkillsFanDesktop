import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentRequest,
  AgentRouteHint,
  Attachment,
  ImageAttachment
} from '../../main/services/agent/types'
import type { RalphTask, UserStory } from '../../main/services/ralph/types'
import type {
  CreateLoopTaskConfig,
  LoopTask,
  UserStory as LoopTaskUserStory
} from '../../shared/types/loop-task'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'
import type { SerializedSubagentRun } from '../../main/services/agent/subagent/types'
import { getGatewayProcessStatus } from '../process'

export type GatewayCommandName =
  | 'subagent.kill'
  | 'agent.stop'
  | 'agent.rewind-files'
  | 'agent.send-message'
  | 'agent.ensure-session-warm'
  | 'agent.interrupt-inject'
  | 'agent.tool-approval'
  | 'agent.question-answer'
  | 'loop-task.retry-story'
  | 'loop-task.retry-failed'
  | 'loop-task.reset-all'
  | 'loop-task.delete'
  | 'loop-task.create'
  | 'loop-task.update'
  | 'loop-task.rename'
  | 'loop-task.add-story'
  | 'loop-task.update-story'
  | 'loop-task.remove-story'
  | 'loop-task.reorder-stories'
  | 'ralph.create-task'
  | 'ralph.get-task'
  | 'ralph.get-current'
  | 'ralph.start'
  | 'ralph.stop'
  | 'ralph.generate-stories'
  | 'ralph.import-prd-file'

export interface GatewayInterruptInjectRequest {
  spaceId: string
  conversationId: string
  message: string
  images?: ImageAttachment[]
  attachments?: Attachment[]
}

export interface GatewayCommandPayloadMap {
  'subagent.kill': {
    runId: string
  }
  'agent.stop': {
    conversationId?: string
  }
  'agent.rewind-files': {
    conversationId: string
    userMessageUuid: string
  }
  'agent.send-message': {
    request: AgentRequest
  }
  'agent.ensure-session-warm': {
    spaceId: string
    conversationId: string
    routeHint?: AgentRouteHint
  }
  'agent.interrupt-inject': {
    request: GatewayInterruptInjectRequest
  }
  'agent.tool-approval': {
    conversationId: string
    approved: boolean
  }
  'agent.question-answer': {
    conversationId: string
    answers: Record<string, string>
  }
  'loop-task.retry-story': {
    spaceId: string
    taskId: string
    storyId: string
  }
  'loop-task.retry-failed': {
    spaceId: string
    taskId: string
  }
  'loop-task.reset-all': {
    spaceId: string
    taskId: string
  }
  'loop-task.delete': {
    spaceId: string
    taskId: string
  }
  'loop-task.create': {
    spaceId: string
    config: CreateLoopTaskConfig
  }
  'loop-task.update': {
    spaceId: string
    taskId: string
    updates: Partial<LoopTask>
  }
  'loop-task.rename': {
    spaceId: string
    taskId: string
    name: string
  }
  'loop-task.add-story': {
    spaceId: string
    taskId: string
    story: Omit<LoopTaskUserStory, 'id' | 'status'>
  }
  'loop-task.update-story': {
    spaceId: string
    taskId: string
    storyId: string
    updates: Partial<LoopTaskUserStory>
  }
  'loop-task.remove-story': {
    spaceId: string
    taskId: string
    storyId: string
  }
  'loop-task.reorder-stories': {
    spaceId: string
    taskId: string
    fromIndex: number
    toIndex: number
  }
  'ralph.create-task': {
    config: import('../../main/services/ralph/types').CreateTaskConfig
  }
  'ralph.get-task': {
    taskId: string
  }
  'ralph.get-current': Record<string, never>
  'ralph.start': {
    spaceId: string | null
    taskId: string
  }
  'ralph.stop': {
    taskId: string
  }
  'ralph.generate-stories': {
    config: import('../../main/services/ralph/types').GenerateStoriesConfig
  }
  'ralph.import-prd-file': {
    filePath: string
  }
}

export interface GatewayCommandResultMap {
  'subagent.kill': SerializedSubagentRun
  'agent.stop': {
    stopped: true
    conversationId: string | null
  }
  'agent.rewind-files': {
    success: boolean
    error?: string
  }
  'agent.send-message': {
    accepted: true
    conversationId: string
  }
  'agent.ensure-session-warm': {
    warmed: true
    conversationId: string
  }
  'agent.interrupt-inject': {
    accepted: true
    conversationId: string
  }
  'agent.tool-approval': {
    accepted: true
    conversationId: string
  }
  'agent.question-answer': {
    accepted: true
    conversationId: string
  }
  'loop-task.retry-story': LoopTask
  'loop-task.retry-failed': LoopTask
  'loop-task.reset-all': LoopTask
  'loop-task.delete': {
    deleted: true
    taskId: string
  }
  'loop-task.create': LoopTask
  'loop-task.update': LoopTask
  'loop-task.rename': LoopTask
  'loop-task.add-story': LoopTaskUserStory
  'loop-task.update-story': {
    updated: true
    storyId: string
    taskId: string
  }
  'loop-task.remove-story': {
    removed: true
    storyId: string
    taskId: string
  }
  'loop-task.reorder-stories': {
    reordered: true
    taskId: string
    fromIndex: number
    toIndex: number
  }
  'ralph.create-task': RalphTask
  'ralph.get-task': RalphTask | null
  'ralph.get-current': RalphTask | null
  'ralph.start': {
    started: true
    taskId: string
    task: RalphTask | null
  }
  'ralph.stop': {
    stopped: true
    taskId: string
  }
  'ralph.generate-stories': UserStory[]
  'ralph.import-prd-file': {
    description: string
    branchName: string
    stories: UserStory[]
  }
}

interface GatewayCommandEnvelope<K extends GatewayCommandName = GatewayCommandName> {
  version: 1
  id: string
  name: K
  payload: GatewayCommandPayloadMap[K]
  createdAt: string
}

interface GatewayCommandResultEnvelope<K extends GatewayCommandName = GatewayCommandName> {
  version: 1
  id: string
  name: K
  ok: boolean
  data?: GatewayCommandResultMap[K]
  error?: string
  respondedAt: string
}

const COMMAND_REQUEST_POLL_INTERVAL_MS = 100
const COMMAND_REQUEST_TIMEOUT_MS = 15_000

let commandBusDir: string | null = null

function getRequestsDir(): string | null {
  return commandBusDir ? join(commandBusDir, 'requests') : null
}

function getResponsesDir(): string | null {
  return commandBusDir ? join(commandBusDir, 'responses') : null
}

function getCommandRequestPath(id: string): string | null {
  const dir = getRequestsDir()
  return dir ? join(dir, `${id}.json`) : null
}

function getCommandResponsePath(id: string): string | null {
  const dir = getResponsesDir()
  return dir ? join(dir, `${id}.json`) : null
}

function isGatewayCommandName(value: unknown): value is GatewayCommandName {
  return value === 'subagent.kill'
    || value === 'agent.stop'
    || value === 'agent.rewind-files'
    || value === 'agent.send-message'
    || value === 'agent.ensure-session-warm'
    || value === 'agent.interrupt-inject'
    || value === 'agent.tool-approval'
    || value === 'agent.question-answer'
    || value === 'loop-task.retry-story'
    || value === 'loop-task.retry-failed'
    || value === 'loop-task.reset-all'
    || value === 'loop-task.delete'
    || value === 'loop-task.create'
    || value === 'loop-task.update'
    || value === 'loop-task.rename'
    || value === 'loop-task.add-story'
    || value === 'loop-task.update-story'
    || value === 'loop-task.remove-story'
    || value === 'loop-task.reorder-stories'
    || value === 'ralph.create-task'
    || value === 'ralph.get-task'
    || value === 'ralph.get-current'
    || value === 'ralph.start'
    || value === 'ralph.stop'
    || value === 'ralph.generate-stories'
    || value === 'ralph.import-prd-file'
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeCommandEnvelope(
  value: GatewayCommandEnvelope | null
): GatewayCommandEnvelope | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if (
    value.version !== 1
    || typeof value.id !== 'string'
    || !isGatewayCommandName(value.name)
    || typeof value.createdAt !== 'string'
    || !value.payload
    || typeof value.payload !== 'object'
  ) {
    return null
  }

  return value
}

function normalizeCommandResultEnvelope<K extends GatewayCommandName>(
  value: GatewayCommandResultEnvelope<K> | null,
  name: K,
  id: string
): GatewayCommandResultEnvelope<K> | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if (
    value.version !== 1
    || value.id !== id
    || value.name !== name
    || typeof value.ok !== 'boolean'
    || typeof value.respondedAt !== 'string'
  ) {
    return null
  }

  return value
}

export function configureGatewayCommandBus(dir: string): void {
  commandBusDir = dir
  mkdirSync(join(dir, 'requests'), { recursive: true })
  mkdirSync(join(dir, 'responses'), { recursive: true })
}

export function canDelegateGatewayCommands(): boolean {
  const processStatus = getGatewayProcessStatus()
  return processStatus.configuredMode === 'external' && !processStatus.managedByCurrentProcess
}

export function enqueueGatewayCommand<K extends GatewayCommandName>(
  name: K,
  payload: GatewayCommandPayloadMap[K]
): GatewayCommandEnvelope<K> {
  const id = randomUUID()
  const filePath = getCommandRequestPath(id)
  if (!filePath) {
    throw new Error('Gateway command bus is not configured.')
  }

  const command: GatewayCommandEnvelope<K> = {
    version: 1,
    id,
    name,
    payload,
    createdAt: new Date().toISOString()
  }

  atomicWriteJsonSync(filePath, command, { backup: true })
  return command
}

export function listPendingGatewayCommands(): GatewayCommandEnvelope[] {
  const dir = getRequestsDir()
  if (!dir || !existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => {
      const envelope = safeReadJsonSync<GatewayCommandEnvelope | null>(join(dir, fileName), null)
      return normalizeCommandEnvelope(envelope)
    })
    .filter((envelope): envelope is GatewayCommandEnvelope => Boolean(envelope))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

export function writeGatewayCommandResult<K extends GatewayCommandName>(
  command: GatewayCommandEnvelope<K>,
  result: { ok: true; data: GatewayCommandResultMap[K] } | { ok: false; error: string }
): void {
  const filePath = getCommandResponsePath(command.id)
  if (!filePath) {
    return
  }

  const envelope: GatewayCommandResultEnvelope<K> = {
    version: 1,
    id: command.id,
    name: command.name,
    ok: result.ok,
    respondedAt: new Date().toISOString(),
    ...(result.ok ? { data: result.data } : { error: result.error })
  }

  atomicWriteJsonSync(filePath, envelope, { backup: true })
}

export function removeGatewayCommandRequest(id: string): void {
  const filePath = getCommandRequestPath(id)
  if (!filePath) {
    return
  }

  rmSync(filePath, { force: true })
  rmSync(filePath + '.bak', { force: true })
  rmSync(filePath + '.tmp', { force: true })
}

export function removeGatewayCommandResponse(id: string): void {
  const filePath = getCommandResponsePath(id)
  if (!filePath) {
    return
  }

  rmSync(filePath, { force: true })
  rmSync(filePath + '.bak', { force: true })
  rmSync(filePath + '.tmp', { force: true })
}

export async function executeGatewayCommand<K extends GatewayCommandName>(
  name: K,
  payload: GatewayCommandPayloadMap[K],
  options?: { timeoutMs?: number }
): Promise<GatewayCommandResultMap[K]> {
  const timeoutMs = options?.timeoutMs ?? COMMAND_REQUEST_TIMEOUT_MS
  const command = enqueueGatewayCommand(name, payload)
  const deadline = Date.now() + timeoutMs

  try {
    while (Date.now() <= deadline) {
      const responsePath = getCommandResponsePath(command.id)
      if (responsePath && existsSync(responsePath)) {
        const envelope = normalizeCommandResultEnvelope(
          safeReadJsonSync<GatewayCommandResultEnvelope<K> | null>(responsePath, null),
          name,
          command.id
        )

        if (envelope) {
          removeGatewayCommandRequest(command.id)
          removeGatewayCommandResponse(command.id)

          if (!envelope.ok) {
            throw new Error(envelope.error || `Gateway command failed: ${name}`)
          }

          return envelope.data as GatewayCommandResultMap[K]
        }
      }

      await waitFor(COMMAND_REQUEST_POLL_INTERVAL_MS)
    }
  } finally {
    removeGatewayCommandRequest(command.id)
  }

  throw new Error(`Timed out waiting for gateway command: ${name}`)
}

export function resetGatewayCommandBusForTests(): void {
  commandBusDir = null
}
