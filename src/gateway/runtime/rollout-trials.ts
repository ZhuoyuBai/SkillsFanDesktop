import type {
  NativeRolloutTrialResult,
  NativeRolloutValidationId
} from './rollout-types'

const rolloutTrialRuns = new Map<NativeRolloutValidationId, NativeRolloutTrialResult>()

function cloneTrial<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getNativeRolloutTrialSnapshot(
  id: NativeRolloutValidationId
): NativeRolloutTrialResult | null {
  const value = rolloutTrialRuns.get(id)
  return value ? cloneTrial(value) : null
}

export function setNativeRolloutTrialSnapshot(
  result: NativeRolloutTrialResult
): NativeRolloutTrialResult {
  const cloned = cloneTrial(result)
  rolloutTrialRuns.set(result.id, cloned)
  return cloneTrial(cloned)
}

export function clearNativeRolloutTrialSnapshotsForTests(): void {
  rolloutTrialRuns.clear()
}
