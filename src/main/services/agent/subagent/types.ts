import type { ThinkingEffort } from '../../../../shared/utils/openai-models'

export type SubagentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_announce'
  | 'completed'
  | 'failed'
  | 'killed'
  | 'timeout'

export interface SubagentRun {
  runId: string
  parentConversationId: string
  parentSpaceId: string
  childConversationId: string
  status: SubagentRunStatus
  task: string
  label?: string
  model?: string
  modelSource?: string
  thinkingEffort?: ThinkingEffort
  spawnedAt: string
  startedAt?: string
  endedAt?: string
  latestSummary?: string
  resultSummary?: string
  error?: string
  announcedAt?: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalCostUsd?: number
  }
  toolUseId?: string
}

export interface SerializedSubagentRun extends SubagentRun {
  durationMs?: number
}

export interface SubagentSpawnParams {
  parentSpaceId: string
  parentConversationId: string
  workDir: string
  task: string
  label?: string
  model?: string
  modelSource?: string
  thinkingEffort?: ThinkingEffort
  timeoutMs?: number
  toolUseId?: string
}

export interface SubagentSpawnToolInput {
  task: string
  label?: string
  model?: string
  modelSource?: string
  thinkingEffort?: ThinkingEffort
  timeoutMs?: number
}

export interface SubagentsToolInput {
  action: 'list' | 'info' | 'wait' | 'kill'
  runId?: string
  limit?: number
  includeCompleted?: boolean
  timeoutMs?: number
}
