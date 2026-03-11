export interface StepArtifactRef {
  kind: 'screenshot' | 'snapshot' | 'log' | 'file'
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

export interface HostEnvironmentStatus {
  platform: NodeJS.Platform
  browser: HostSurfaceStatus & {
    backend: 'connected' | 'automated'
    toolCount: number
  }
  desktop: HostSurfaceStatus
  permissions: {
    accessibility: HostPermissionStatus
    screenRecording: HostPermissionStatus
  }
}
