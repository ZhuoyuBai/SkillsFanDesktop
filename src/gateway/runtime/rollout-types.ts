export type NativeRolloutScopeId =
  | 'chat-simple'
  | 'browser-simple'
  | 'terminal-simple'
  | 'skills'
  | 'agent-team'
  | 'long-workflow'
  | 'pdf-text-attachments'

export type NativeRolloutValidationId = 'chat-simple' | 'browser-simple' | 'terminal-simple'
export type NativeRolloutValidationState = 'ready' | 'held' | 'blocked'
export type NativeRolloutValidationBlockerCode =
  | 'mode_locked'
  | 'native_not_ready'
  | 'permissions_missing'
  | 'workflow_missing'
  | 'smoke_failed'

export type NativeRolloutTrialState = 'running' | 'passed' | 'failed'

export interface NativeRolloutTrialCheckResult {
  id: string
  state: Exclude<NativeRolloutTrialState, 'running'>
  summary: string
  error?: string | null
}

export interface NativeRolloutTrialResult {
  id: NativeRolloutValidationId
  state: NativeRolloutTrialState
  startedAt: string
  finishedAt?: string
  durationMs?: number
  summary: string
  error?: string | null
  checks: NativeRolloutTrialCheckResult[]
}
