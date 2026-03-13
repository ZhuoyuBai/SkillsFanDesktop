export interface StepArtifactRef {
  kind: 'screenshot' | 'snapshot' | 'log' | 'file'
  role?: 'before' | 'after' | 'primary'
  label?: string
  path?: string
  mimeType?: string
  previewImageData?: string
  previewText?: string
  metadata?: Record<string, unknown>
}

export interface HostStep {
  taskId: string
  stepId: string
  timestamp: number
  category: 'browser' | 'desktop' | 'perception' | 'system'
  action: string
  summary?: string
  artifacts?: StepArtifactRef[]
  metadata?: Record<string, unknown>
}

export interface HostStepInput {
  taskId: string
  stepId?: string
  timestamp?: number
  category: HostStep['category']
  action: string
  summary?: string
  artifacts?: StepArtifactRef[]
  metadata?: Record<string, unknown>
}

export type StepReport = HostStep
export type StepReportInput = HostStepInput

export type HostPermissionState = 'granted' | 'needs_permission' | 'unsupported' | 'unknown'
export type HostSurfaceState = 'ready' | 'unsupported' | 'unknown'

export interface HostPermissionStatus {
  state: HostPermissionState
}

export interface HostSurfaceStatus {
  state: HostSurfaceState
}

export interface HostDesktopActionStatus {
  id: string
  supported: boolean
  requiresAccessibilityPermission?: boolean
  blockedByPermission?: boolean
  notes?: string
}

export interface HostDesktopAdapterStatus {
  id: string
  displayName?: string
  supported: boolean
  stage?: 'active' | 'planned'
  applicationNames?: string[]
  actions?: string[]
  methods?: Array<{
    id: string
    displayName?: string
    action: string
    supported: boolean
    stage?: 'active' | 'scaffolded' | 'planned'
    notes?: string
  }>
  workflows?: Array<{
    id: string
    displayName?: string
    supported: boolean
    stage?: 'active' | 'planned'
    methodIds: string[]
    blockedByPermission?: boolean
    blockedMethodIds?: string[]
    recoveryHint?: string
    notes?: string
  }>
  smokeFlows?: Array<{
    id: string
    displayName?: string
    supported: boolean
    stage?: 'active' | 'planned'
    methodIds: string[]
    blockedByPermission?: boolean
    blockedMethodIds?: string[]
    verification?: string
    recoveryHint?: string
    lastRun?: {
      state: 'running' | 'passed' | 'failed'
      startedAt: string
      finishedAt?: string
      durationMs?: number
      summary: string
      error?: string | null
    }
    notes?: string
  }>
  notes?: string
}

export interface HostDesktopSurfaceStatus extends HostSurfaceStatus {
  backend?: string
  actions: HostDesktopActionStatus[]
  adapters: HostDesktopAdapterStatus[]
  errorCodes: string[]
}

export interface HostEnvironmentStatus {
  platform: NodeJS.Platform
  browser: HostSurfaceStatus & {
    backend: 'connected' | 'automated'
    toolCount: number
  }
  desktop: HostDesktopSurfaceStatus
  permissions: {
    accessibility: HostPermissionStatus
    screenRecording: HostPermissionStatus
  }
}
