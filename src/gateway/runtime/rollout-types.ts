export type NativeRolloutScopeId =
  | 'chat-simple'
  | 'browser-simple'
  | 'terminal-simple'
  | 'finder-simple'
  | 'skillsfan-simple'
  | 'skills'
  | 'agent-team'
  | 'long-workflow'
  | 'pdf-text-attachments'
  | 'provider-model-policy'

export type NativeRolloutValidationId =
  | 'chat-simple'
  | 'browser-simple'
  | 'terminal-simple'
  | 'finder-simple'
  | 'skillsfan-simple'
export type NativeRolloutValidationState = 'ready' | 'held' | 'blocked'
export type NativeRolloutValidationBlockerCode =
  | 'mode_locked'
  | 'policy_held'
  | 'native_not_ready'
  | 'compat_no_endpoint'
  | 'compat_requires_responses'
  | 'compat_adapter_unavailable'
  | 'shared_tools_missing'
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
