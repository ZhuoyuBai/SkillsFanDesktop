import type { RuntimeRouteInfo } from '../../../shared/types'
import type {
  AgentRouteHint,
  RuntimeTaskHint
} from '../../../main/services/agent/types'
import type { ThinkingEffort } from '../../../shared/utils/openai-models'

export type NativeActiveRunAbortReason = 'stop' | 'inject'

export interface NativeActiveRunRequestContext {
  aiBrowserEnabled?: boolean
  thinkingEnabled?: boolean
  thinkingEffort?: ThinkingEffort
  model?: string
  modelSource?: string
  routeHint?: AgentRouteHint
  runtimeTaskHint?: RuntimeTaskHint
}

export interface NativeActiveRunSnapshot {
  spaceId: string
  conversationId: string
  runtimeRoute: RuntimeRouteInfo
  startedAt: number
  abortController: AbortController
  abortReason?: NativeActiveRunAbortReason
  latestContent?: string
  requestContext?: NativeActiveRunRequestContext
}

const activeNativeRuns = new Map<string, NativeActiveRunSnapshot>()

export function registerNativeActiveRun(snapshot: NativeActiveRunSnapshot): void {
  activeNativeRuns.set(snapshot.conversationId, snapshot)
}

export function clearNativeActiveRun(conversationId: string): void {
  activeNativeRuns.delete(conversationId)
}

export function getNativeActiveRun(conversationId: string): NativeActiveRunSnapshot | null {
  return activeNativeRuns.get(conversationId) || null
}

export function listNativeActiveRuns(): NativeActiveRunSnapshot[] {
  return Array.from(activeNativeRuns.values())
}

export function updateNativeActiveRunContent(conversationId: string, latestContent: string): void {
  const run = activeNativeRuns.get(conversationId)
  if (!run) {
    return
  }

  run.latestContent = latestContent
}

export function abortNativeActiveRun(
  conversationId: string,
  reason: NativeActiveRunAbortReason = 'stop'
): boolean {
  const run = activeNativeRuns.get(conversationId)
  if (!run) {
    return false
  }

  run.abortReason = reason
  if (!run.abortController.signal.aborted) {
    run.abortController.abort(reason)
  }
  return true
}

export function clearAllNativeActiveRunsForTests(): void {
  activeNativeRuns.clear()
}
