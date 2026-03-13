import type { BrowserWindow } from 'electron'
import type {
  MacOSAutomationErrorCode,
  MacOSAutomationResult
} from '../../main/services/local-tools/macos-ui'
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

export interface ActivateDesktopApplicationInput {
  workDir: string
  application: string
  timeoutMs?: number
}

export type DesktopKeyModifier = 'command' | 'control' | 'option' | 'shift'

export interface PressDesktopKeyInput {
  workDir: string
  key: string
  modifiers?: DesktopKeyModifier[]
  timeoutMs?: number
}

export interface TypeDesktopTextInput {
  workDir: string
  text: string
  timeoutMs?: number
}

export type DesktopMouseButton = 'left' | 'right'

export interface ClickDesktopAtCoordinateInput {
  workDir: string
  x: number
  y: number
  button?: DesktopMouseButton
  clickCount?: number
  timeoutMs?: number
}

export interface MoveDesktopMouseInput {
  workDir: string
  x: number
  y: number
  timeoutMs?: number
}

export interface ScrollDesktopInput {
  workDir: string
  x: number
  y: number
  deltaX?: number
  deltaY?: number
  timeoutMs?: number
}

export interface ListDesktopWindowsInput {
  workDir: string
  application?: string
  timeoutMs?: number
}

export interface FocusDesktopWindowInput {
  workDir: string
  application: string
  windowName?: string
  windowIndex?: number
  timeoutMs?: number
}

export interface DesktopWindowInfo {
  application: string
  name: string
  index: number
  position: { x: number; y: number } | null
  size: { width: number; height: number } | null
  minimized: boolean
}

export interface DesktopWindowListResult {
  windows: DesktopWindowInfo[]
}

export type DesktopHostAction =
  | 'open_application'
  | 'run_applescript'
  | 'activate_application'
  | 'press_key'
  | 'type_text'
  | 'click'
  | 'move_mouse'
  | 'scroll'
  | 'list_windows'
  | 'focus_window'

export interface DesktopActionCapability {
  id: DesktopHostAction
  supported: boolean
  requiresAccessibilityPermission?: boolean
  notes?: string
}

export interface DesktopAdapterMethodCapability {
  id: string
  displayName?: string
  action: DesktopHostAction
  supported: boolean
  stage?: 'active' | 'scaffolded' | 'planned'
  notes?: string
}

export interface DesktopAdapterWorkflowCapability {
  id: string
  displayName?: string
  supported: boolean
  stage?: 'active' | 'planned'
  methodIds: string[]
  notes?: string
}

export interface DesktopAdapterSmokeFlowCapability {
  id: string
  displayName?: string
  supported: boolean
  stage?: 'active' | 'planned'
  methodIds: string[]
  verification?: string
  notes?: string
}

export type DesktopSmokeFlowRunState = 'running' | 'passed' | 'failed'

export interface DesktopSmokeFlowExecutionStep {
  methodId: string
  success: boolean
  summary: string
  errorCode?: MacOSAutomationErrorCode
  errorMessage?: string
  data?: unknown
}

export interface DesktopSmokeFlowExecutionResult {
  id: string
  adapterId: string
  displayName?: string
  verification?: string
  state: DesktopSmokeFlowRunState
  startedAt: string
  finishedAt?: string
  durationMs?: number
  summary: string
  error?: string | null
  steps: DesktopSmokeFlowExecutionStep[]
}

export interface DesktopAdapterCapability {
  id: string
  displayName?: string
  supported: boolean
  stage?: 'active' | 'planned'
  applicationNames?: string[]
  actions?: DesktopHostAction[]
  methods?: DesktopAdapterMethodCapability[]
  workflows?: DesktopAdapterWorkflowCapability[]
  smokeFlows?: DesktopAdapterSmokeFlowCapability[]
  notes?: string
}

export interface DesktopHostCapabilities {
  platform: NodeJS.Platform
  backend: 'generic-macos' | 'unsupported'
  supportsOpenApplication: boolean
  supportsAppleScript: boolean
  supportsActivateApplication: boolean
  supportsPressKey: boolean
  supportsTypeText: boolean
  supportsClick: boolean
  supportsScroll: boolean
  supportsWindowManagement: boolean
  actions: DesktopActionCapability[]
  adapters: DesktopAdapterCapability[]
  errorCodes: MacOSAutomationErrorCode[]
}

export interface DesktopHostRuntime {
  getCapabilities(): DesktopHostCapabilities
  openApplication(args: OpenDesktopApplicationInput): Promise<MacOSAutomationResult>
  runAppleScript(args: RunAppleScriptInput): Promise<MacOSAutomationResult>
  activateApplication(args: ActivateDesktopApplicationInput): Promise<MacOSAutomationResult>
  pressKey(args: PressDesktopKeyInput): Promise<MacOSAutomationResult>
  typeText(args: TypeDesktopTextInput): Promise<MacOSAutomationResult>
  clickAtCoordinate(args: ClickDesktopAtCoordinateInput): Promise<MacOSAutomationResult>
  moveMouse(args: MoveDesktopMouseInput): Promise<MacOSAutomationResult>
  scroll(args: ScrollDesktopInput): Promise<MacOSAutomationResult>
  listWindows(args: ListDesktopWindowsInput): Promise<DesktopWindowListResult>
  focusWindow(args: FocusDesktopWindowInput): Promise<MacOSAutomationResult>
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
