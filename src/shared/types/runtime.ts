export type RuntimeRouteKind = 'claude-sdk' | 'native'

export interface NativeRuntimeRolloutPolicy {
  sourceAllowlist?: string[]
  sourceBlocklist?: string[]
  modelAllowlistBySource?: Record<string, string[]>
  modelBlocklistBySource?: Record<string, string[]>
}

export type RuntimeRouteExperience = 'new-route' | 'existing-route'

export type RuntimeRouteNoteId =
  | 'new-route-simple-task'
  | 'new-route-forced'
  | 'existing-route-fixed'
  | 'existing-route-complex-task'
  | 'existing-route-not-ready'
  | 'existing-route-outside-scope'

export interface RuntimeRouteInfo {
  selectedKind: RuntimeRouteKind
  preferredKind: RuntimeRouteKind
  experience: RuntimeRouteExperience
  noteId: RuntimeRouteNoteId
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  taskComplexity: 'lightweight' | 'complex'
  fallbackFrom?: RuntimeRouteKind
}
