import type { BrowserWindow } from 'electron'
import type { MacOSAutomationResult } from '../../main/services/local-tools/macos-ui'
import type {
  HostEnvironmentStatus,
  HostStep,
  HostStepInput,
  StepArtifactRef
} from '../../shared/types/host-runtime'

export type BrowserAutomationBackend = 'connected' | 'automated'

export interface BrowserMcpServerContext {
  spaceId?: string
  conversationId?: string
}

export interface BrowserHostCapabilities {
  backend: BrowserAutomationBackend
  toolNames: string[]
  supportsStructuredSnapshot: boolean
  supportsScreenshots: boolean
  supportsMultiPage: boolean
}

export interface BrowserHostRuntime {
  initialize(mainWindow: BrowserWindow): void
  cleanup(): void
  createMcpServer(backend?: BrowserAutomationBackend, context?: BrowserMcpServerContext): unknown
  getToolNames(backend?: BrowserAutomationBackend): string[]
  getCapabilities(backend?: BrowserAutomationBackend): BrowserHostCapabilities
}

export interface OpenDesktopApplicationInput {
  workDir: string
  application: string
  target?: string
  activate?: boolean
  timeoutMs?: number
}

export interface RunAppleScriptInput {
  workDir: string
  script: string
  timeoutMs?: number
}

export interface DesktopHostCapabilities {
  platform: NodeJS.Platform
  supportsOpenApplication: boolean
  supportsAppleScript: boolean
}

export interface DesktopHostRuntime {
  getCapabilities(): DesktopHostCapabilities
  openApplication(args: OpenDesktopApplicationInput): Promise<MacOSAutomationResult>
  runAppleScript(args: RunAppleScriptInput): Promise<MacOSAutomationResult>
}

export interface PerceptionSourceDescriptor {
  kind: 'browser_snapshot' | 'browser_screenshot' | 'desktop_screenshot' | 'desktop_ui_tree'
  available: boolean
  backend: BrowserAutomationBackend | 'desktop'
  toolName?: string
  notes?: string
}

export interface PerceptionCapabilities {
  browserSnapshot: boolean
  browserScreenshot: boolean
  desktopScreenshot: boolean
  desktopUiTree: boolean
}

export interface BrowserSnapshotInput {
  backend?: BrowserAutomationBackend
  verbose?: boolean
  filePath?: string
  taskId?: string
  stepId?: string
}

export interface BrowserSnapshotResult {
  backend: BrowserAutomationBackend
  title: string
  url: string
  text: string
  elementCount: number
  filePath?: string
}

export interface BrowserScreenshotInput {
  backend?: BrowserAutomationBackend
  format?: 'png' | 'jpeg' | 'webp'
  quality?: number
  fullPage?: boolean
  uid?: string
  filePath?: string
  taskId?: string
  stepId?: string
}

export interface BrowserScreenshotResult {
  backend: BrowserAutomationBackend
  mimeType: string
  data?: string
  filePath?: string
}

export interface DesktopScreenshotInput {
  workDir: string
  filePath?: string
  timeoutMs?: number
  taskId?: string
  stepId?: string
}

export interface DesktopScreenshotResult {
  mimeType: string
  data?: string
  filePath: string
}

export interface DesktopUiTreeInput {
  workDir: string
  application?: string
  filePath?: string
  maxElements?: number
  maxChildrenPerElement?: number
  timeoutMs?: number
  taskId?: string
  stepId?: string
}

export interface DesktopUiTreeResult {
  text: string
  filePath?: string
}

export interface PerceptionHostRuntime {
  getCapabilities(): PerceptionCapabilities
  listSources(): PerceptionSourceDescriptor[]
  captureBrowserSnapshot(args?: BrowserSnapshotInput): Promise<BrowserSnapshotResult>
  captureBrowserScreenshot(args?: BrowserScreenshotInput): Promise<BrowserScreenshotResult>
  captureDesktopScreenshot(args: DesktopScreenshotInput): Promise<DesktopScreenshotResult>
  readDesktopUiTree(args: DesktopUiTreeInput): Promise<DesktopUiTreeResult>
}

export type StepReport = HostStep
export type StepReportInput = HostStepInput

export interface StepReporterRuntime {
  recordStep(input: StepReportInput): StepReport
  listSteps(taskId: string): StepReport[]
  clearTask(taskId: string): void
  clearAll(): void
}

export interface HostStatusRuntime {
  getEnvironmentStatus(): Promise<HostEnvironmentStatus>
}

export interface HostRuntime {
  browser: BrowserHostRuntime
  desktop: DesktopHostRuntime
  perception: PerceptionHostRuntime
  stepReporter: StepReporterRuntime
  status: HostStatusRuntime
}
