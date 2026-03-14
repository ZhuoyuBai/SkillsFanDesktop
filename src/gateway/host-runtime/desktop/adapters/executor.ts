import type {
  MacOSAutomationErrorCode,
  MacOSAutomationResult
} from '../../../../main/services/local-tools/macos-ui'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { normalizeLocalFilePath } from '../../../../main/services/local-tools/path-utils'
import type { DesktopHostRuntime } from '../../types'
import {
  buildChromeCloseActiveTabShortcut,
  buildChromeGetActiveTabScript,
  buildChromeListTabsScript,
  buildChromeFocusTabScript,
  buildChromeFocusTabByUrlScript,
  buildChromeOpenUrlInNewTabScript,
  buildChromeNewTabShortcut,
  buildChromeOpenUrlTarget,
  buildChromeReloadActiveTabShortcut
} from './chrome'
import {
  buildFinderNewWindowShortcut,
  buildFinderOpenFolderTarget,
  buildFinderOpenHomeFolderTarget,
  buildFinderSearchScript,
  buildFinderRevealPathScript
} from './finder'
import { listDesktopAppAdapters } from './registry'
import { buildSkillsFanOpenSettingsShortcut } from './skillsfan'
import {
  TERMINAL_COMMAND_RESULT_MARKER_PREFIX,
  TERMINAL_COMMAND_START_MARKER_PREFIX,
  buildITermProbeScript,
  buildTerminalInterruptShortcut,
  buildTerminalGetPaneLayoutScript,
  buildTerminalGetSessionStateScript,
  buildTerminalListPanesScript,
  buildTerminalListSessionsScript,
  buildTerminalNewTabRunCommandScript,
  buildTerminalNewWindowRunCommandScript,
  TERMINAL_EXIT_STATUS_MARKER_PREFIX,
  buildTerminalFocusSessionScript,
  buildTerminalReadOutputScript,
  buildTerminalRunCommandInDirectoryScript,
  buildTerminalRunCommandScript,
  buildTerminalSplitPaneRunCommandScript,
  type TerminalApplication,
  type TerminalSplitDirection,
  type TerminalSessionTarget
} from './terminal'

export interface DesktopAdapterMethodExecutionInput {
  workDir: string
  adapterId: string
  methodId: string
  application?: string
  target?: string
  command?: string
  expectedText?: string
  query?: string
  direction?: TerminalSplitDirection
  field?: 'title' | 'url' | 'either' | 'domain'
  idleMs?: number
  maxChars?: number
  limit?: number
  pollIntervalMs?: number
  timeoutMs?: number
  activate?: boolean
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}

export interface DesktopAdapterMethodExecution {
  adapterId: string
  methodId: string
  stage?: 'active' | 'scaffolded' | 'planned'
  result: MacOSAutomationResult
  successText: string
  data?: unknown
}

export type TerminalCompletionState =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'idle_without_exit_status'
  | 'unknown'

export interface TerminalRecoveryMetadata {
  completionState: TerminalCompletionState
  recoveryHint: string | null
  recoverySuggestions: string[]
}

export interface TerminalOutputObservation extends TerminalRecoveryMetadata {
  application: TerminalApplication
  output: string
  totalChars: number
  returnedChars: number
  truncated: boolean
  completed: boolean
  exitStatus: number | null
  exitMarkerCount: number
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}

export interface TerminalSessionObservation {
  application: TerminalApplication
  windowIndex: number
  tabIndex: number
  sessionIndex: number
  paneIndex?: number
  active: boolean
  busy: boolean
  title: string
  tty: string
}

export interface TerminalSessionListObservation {
  application: TerminalApplication
  sessions: TerminalSessionObservation[]
  totalSessions: number
  returnedSessions: number
  truncated: boolean
}

export interface TerminalPaneListObservation {
  application: TerminalApplication
  panes: TerminalSessionObservation[]
  totalPanes: number
  returnedPanes: number
  truncated: boolean
  windowIndex?: number
  tabIndex?: number
}

export interface TerminalPaneLayoutPaneObservation extends TerminalSessionObservation {
  columns: number | null
  rows: number | null
}

export interface TerminalPaneLayoutHierarchyNode {
  type: 'group' | 'pane'
  splitDirection?: TerminalSplitDirection | 'unknown'
  paneIndex?: number
  sessionIndex?: number
  active?: boolean
  busy?: boolean
  title?: string
  tty?: string
  columns?: number | null
  rows?: number | null
  children?: TerminalPaneLayoutHierarchyNode[]
}

export interface TerminalPaneLayoutObservation {
  application: TerminalApplication
  panes: TerminalPaneLayoutPaneObservation[]
  totalPanes: number
  activePaneIndex: number | null
  supportedSplitDirections: TerminalSplitDirection[]
  hierarchySource: 'synthetic_flat'
  splitHierarchy: TerminalPaneLayoutHierarchyNode
  windowIndex?: number
  tabIndex?: number
}

export interface TerminalSessionStateObservation extends TerminalSessionObservation {
  completed: boolean
  exitStatus: number | null
  exitMarkerCount: number
  completionState: TerminalCompletionState
  recoveryHint: string | null
  recoverySuggestions: string[]
}

export interface TerminalLastCommandResultObservation extends TerminalRecoveryMetadata {
  application: TerminalApplication
  commandId: string | null
  completed: boolean
  exitStatus: number | null
  exitMarkerCount: number
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}

export interface FinderSearchObservation {
  query: string
  directory: string
  results: string[]
  totalResults: number
  returnedResults: number
  truncated: boolean
}

export interface TerminalWaitForOutputObservation extends TerminalOutputObservation {
  expectedText: string
  matched: boolean
  attempts: number
  elapsedMs: number
}

export interface TerminalIdleObservation extends TerminalOutputObservation {
  idleMs: number
  stable: boolean
  checks: number
  elapsedMs: number
}

export interface TerminalBusyWaitObservation extends TerminalSessionStateObservation {
  busy: boolean
  attempts: number
  elapsedMs: number
}

export interface TerminalCommandCompletionObservation extends TerminalOutputObservation {
  commandId?: string
  attempts: number
  elapsedMs: number
}

export interface TerminalSplitPaneObservation extends TerminalSessionStateObservation {
  commandId?: string
  direction: TerminalSplitDirection
  created: boolean
}

export interface ChromeTabObservation {
  windowIndex: number
  tabIndex: number
  active: boolean
  title: string
  url: string
}

export interface ChromeTabListObservation {
  application: string
  tabs: ChromeTabObservation[]
  totalTabs: number
  returnedTabs: number
  truncated: boolean
}

export interface ChromeActiveTabObservation {
  application: string
  windowIndex: number
  tabIndex: number
  title: string
  url: string
}

export interface ChromeWaitForTabObservation extends ChromeTabMatchObservation {
  matched: boolean
  attempts: number
  elapsedMs: number
}

export interface ChromeWaitForActiveTabObservation extends ChromeActiveTabObservation {
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  matched: boolean
  attempts: number
  elapsedMs: number
}

export interface ChromeTabMatchObservation {
  application: string
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  tabs: ChromeTabObservation[]
  totalMatches: number
  returnedMatches: number
  truncated: boolean
}

export interface ChromeCloseTabsObservation {
  application: string
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  closedTabs: ChromeTabObservation[]
  requestedMatches: number
  closedCount: number
  remainingMatches: number
}

type DesktopAdapterExecutionError = Error & { code?: MacOSAutomationErrorCode }

function createDesktopAdapterExecutionError(
  code: MacOSAutomationErrorCode,
  message: string
): DesktopAdapterExecutionError {
  const error = new Error(message) as DesktopAdapterExecutionError
  error.code = code
  return error
}

function getMethodStage(adapterId: string, methodId: string, platform: NodeJS.Platform) {
  return listDesktopAppAdapters(platform)
    .find((adapter) => adapter.id === adapterId)
    ?.methods
    ?.find((method) => method.id === methodId)
    ?.stage
}

function requireNonEmptyValue(
  value: string | undefined,
  fieldName: string
): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw createDesktopAdapterExecutionError('invalid_input', `${fieldName} cannot be empty.`)
  }

  return normalized
}

function requireHttpUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }

    return url.toString()
  } catch {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      'Chrome open_url requires an http or https URL.'
    )
  }
}

function isExistingDirectory(targetPath: string, workDir: string): boolean {
  const normalizedPath = normalizeLocalFilePath(targetPath, workDir)
  if (!normalizedPath || !existsSync(normalizedPath)) {
    return false
  }

  try {
    return statSync(normalizedPath).isDirectory()
  } catch {
    return false
  }
}

function normalizeTerminalApplication(application?: string): TerminalApplication {
  return application === 'iTerm' || application === 'iTerm2' ? application : 'Terminal'
}

function getTerminalApplicationAttempts(application: TerminalApplication): TerminalApplication[] {
  if (application === 'iTerm') {
    return ['iTerm', 'iTerm2']
  }

  return [application]
}

async function runTerminalAppleScriptWithFallback(args: {
  runtime: DesktopHostRuntime
  workDir: string
  application: TerminalApplication
  timeoutMs?: number
  buildScript: (application: TerminalApplication) => string
}): Promise<MacOSAutomationResult> {
  if (args.application === 'Terminal' || args.application === 'iTerm2') {
    return await args.runtime.runAppleScript({
      workDir: args.workDir,
      script: args.buildScript(args.application),
      timeoutMs: args.timeoutMs
    })
  }

  const attempts = getTerminalApplicationAttempts(args.application)
  let lastProbeResult: MacOSAutomationResult | null = null

  for (const candidateApplication of attempts) {
    const probeResult = await args.runtime.runAppleScript({
      workDir: args.workDir,
      script: buildITermProbeScript(candidateApplication),
      timeoutMs: args.timeoutMs
    })
    lastProbeResult = probeResult

    if (probeResult.returnCode !== 0 || probeResult.timedOut) {
      continue
    }

    return await args.runtime.runAppleScript({
      workDir: args.workDir,
      script: args.buildScript(candidateApplication),
      timeoutMs: args.timeoutMs
    })
  }

  return lastProbeResult as MacOSAutomationResult
}

function normalizeTerminalTargetIndex(
  value: number | undefined,
  fieldName: 'Window index' | 'Tab index' | 'Session index' | 'Pane index'
): number | undefined {
  if (value == null) {
    return undefined
  }

  const numericValue = Number(value)
  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw createDesktopAdapterExecutionError('invalid_input', `${fieldName} must be a positive integer.`)
  }

  return numericValue
}

function resolveTerminalSessionTarget(args: {
  application: TerminalApplication
  input: Pick<DesktopAdapterMethodExecutionInput, 'windowIndex' | 'tabIndex' | 'sessionIndex' | 'paneIndex'>
}): TerminalSessionTarget | undefined {
  const windowIndex = normalizeTerminalTargetIndex(args.input.windowIndex, 'Window index')
  const tabIndex = normalizeTerminalTargetIndex(args.input.tabIndex, 'Tab index')
  const sessionIndex = normalizeTerminalTargetIndex(args.input.sessionIndex, 'Session index')
  const paneIndex = normalizeTerminalTargetIndex(args.input.paneIndex, 'Pane index')

  if (args.application === 'Terminal' && sessionIndex && sessionIndex !== 1) {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      'Terminal only supports sessionIndex = 1 because each tab maps to a single session.'
    )
  }

  if (args.application === 'Terminal' && paneIndex != null) {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      'paneIndex is only supported for iTerm and iTerm2.'
    )
  }

  if (args.application !== 'Terminal' && paneIndex != null && sessionIndex != null && paneIndex !== sessionIndex) {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      'paneIndex must match sessionIndex when both are provided for iTerm.'
    )
  }

  if (windowIndex == null && tabIndex == null && sessionIndex == null && paneIndex == null) {
    return undefined
  }

  const resolvedSessionIndex = paneIndex ?? sessionIndex

  return {
    windowIndex,
    tabIndex,
    sessionIndex: resolvedSessionIndex,
    paneIndex: args.application === 'Terminal' ? undefined : (paneIndex ?? resolvedSessionIndex)
  }
}

function resolveTerminalPaneListTarget(args: {
  application: TerminalApplication
  input: Pick<DesktopAdapterMethodExecutionInput, 'windowIndex' | 'tabIndex' | 'sessionIndex' | 'paneIndex'>
}): Pick<TerminalSessionTarget, 'windowIndex' | 'tabIndex'> | undefined {
  if (args.input.sessionIndex != null || args.input.paneIndex != null) {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      'List panes only supports windowIndex and tabIndex.'
    )
  }

  const target = resolveTerminalSessionTarget({
    application: args.application,
    input: {
      windowIndex: args.input.windowIndex,
      tabIndex: args.input.tabIndex
    }
  })

  if (!target) {
    return undefined
  }

  return {
    windowIndex: target.windowIndex,
    tabIndex: target.tabIndex
  }
}

function requireITermApplication(application: TerminalApplication, methodName: string): void {
  if (application === 'Terminal') {
    throw createDesktopAdapterExecutionError(
      'invalid_input',
      `${methodName} is only supported for iTerm and iTerm2.`
    )
  }
}

function applyTerminalTarget<T extends {
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}>(args: {
  observation: T
  target?: TerminalSessionTarget
}): T {
  if (!args.target) {
    return args.observation
  }

  return {
    ...args.observation,
    windowIndex: args.target.windowIndex,
    tabIndex: args.target.tabIndex,
    sessionIndex: args.target.sessionIndex,
    paneIndex: args.target.paneIndex
  }
}

function normalizeTextOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+$/u, '')
}

function createTerminalCommandId(): string {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function parseTerminalOutput(normalizedOutput: string): {
  output: string
  completed: boolean
  exitStatus: number | null
  exitMarkerCount: number
  lastCommandId: string | null
  lastCommandCompleted: boolean
  lastCommandExitStatus: number | null
} {
  if (!normalizedOutput) {
    return {
      output: '',
      completed: false,
      exitStatus: null,
      exitMarkerCount: 0,
      lastCommandId: null,
      lastCommandCompleted: false,
      lastCommandExitStatus: null
    }
  }

  const lines = normalizedOutput.split('\n')
  const outputLines: string[] = []
  let exitStatus: number | null = null
  let exitMarkerCount = 0
  let lastCommandId: string | null = null
  let lastCommandCompleted = false
  let lastCommandExitStatus: number | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith(TERMINAL_COMMAND_START_MARKER_PREFIX)) {
      const rawCommandId = trimmedLine.slice(TERMINAL_COMMAND_START_MARKER_PREFIX.length).trim()
      if (rawCommandId) {
        lastCommandId = rawCommandId
        lastCommandCompleted = false
        lastCommandExitStatus = null
      }
      continue
    }

    if (trimmedLine.startsWith(TERMINAL_COMMAND_RESULT_MARKER_PREFIX)) {
      const rawPayload = trimmedLine.slice(TERMINAL_COMMAND_RESULT_MARKER_PREFIX.length).trim()
      const [rawCommandId = '', rawExitStatus = ''] = rawPayload.split('\t')
      if (rawCommandId.trim()) {
        lastCommandId = rawCommandId.trim()
      }
      const parsedExitStatus = Number(rawExitStatus.trim())
      if (Number.isInteger(parsedExitStatus)) {
        lastCommandCompleted = true
        lastCommandExitStatus = parsedExitStatus
      }
      continue
    }

    if (trimmedLine.startsWith(TERMINAL_EXIT_STATUS_MARKER_PREFIX)) {
      exitMarkerCount += 1
      const rawExitStatus = trimmedLine.slice(TERMINAL_EXIT_STATUS_MARKER_PREFIX.length).trim()
      const parsedExitStatus = Number(rawExitStatus)
      if (Number.isInteger(parsedExitStatus)) {
        exitStatus = parsedExitStatus
      }
      continue
    }

    outputLines.push(line)
  }

  return {
    output: normalizeTextOutput(outputLines.join('\n')),
    completed: exitStatus !== null,
    exitStatus,
    exitMarkerCount,
    lastCommandId,
    lastCommandCompleted,
    lastCommandExitStatus
  }
}

function buildTerminalRecoveryMetadata(args: {
  application: TerminalApplication
  completed: boolean
  exitStatus: number | null
  busy?: boolean
  timedOut?: boolean
  expectedText?: string
  matched?: boolean
}): TerminalRecoveryMetadata {
  const suggestions: string[] = []
  let completionState: TerminalCompletionState
  let recoveryHint: string | null

  if (args.completed && args.exitStatus === 0) {
    completionState = 'succeeded'
    recoveryHint = `${args.application} command finished successfully.`
  } else if (args.completed && args.exitStatus !== null) {
    completionState = 'failed'
    recoveryHint = `${args.application} command exited with status ${args.exitStatus}.`
    suggestions.push('Use `terminal_read_output` to inspect the latest output tail.')
    suggestions.push('Fix the command or environment, then retry with `terminal_run_command_and_wait`.')
  } else if (args.timedOut || args.busy) {
    completionState = 'running'
    recoveryHint = args.timedOut
      ? `${args.application} is still busy and did not finish before the timeout.`
      : `${args.application} is still busy.`
    suggestions.push('Use `terminal_read_output` to inspect current progress.')
    suggestions.push('Use `terminal_wait_until_not_busy` to keep waiting for completion.')
    suggestions.push('If the process appears stuck, use `terminal_interrupt_process` before retrying.')
  } else {
    completionState = 'idle_without_exit_status'
    recoveryHint = `${args.application} is idle, but no structured exit status was observed yet.`
    suggestions.push('Use `terminal_run_command_and_wait` if you need a reliable exit status.')
    suggestions.push('Use `terminal_read_output` to inspect the final lines before continuing.')
  }

  if (args.expectedText && args.matched === false) {
    recoveryHint = `Expected text "${args.expectedText}" was not observed yet.`
    suggestions.unshift('Verify the expected text, or use `terminal_read_output` to inspect the latest output.')
  }

  return {
    completionState,
    recoveryHint,
    recoverySuggestions: Array.from(new Set(suggestions))
  }
}

function buildTerminalOutputObservation(args: {
  normalizedOutput: string
  application: TerminalApplication
  maxChars?: number
}): TerminalOutputObservation {
  const parsedOutput = parseTerminalOutput(args.normalizedOutput)
  const maxChars = Number.isFinite(args.maxChars) ? Math.max(1, Math.floor(Number(args.maxChars))) : 4000
  const truncated = parsedOutput.output.length > maxChars
  const output = truncated ? parsedOutput.output.slice(-maxChars) : parsedOutput.output

  return {
    ...buildTerminalRecoveryMetadata({
      application: args.application,
      completed: parsedOutput.completed,
      exitStatus: parsedOutput.exitStatus
    }),
    application: args.application,
    output,
    totalChars: parsedOutput.output.length,
    returnedChars: output.length,
    truncated,
    completed: parsedOutput.completed,
    exitStatus: parsedOutput.exitStatus,
    exitMarkerCount: parsedOutput.exitMarkerCount
  }
}

function parseTerminalOutputObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  maxChars?: number
}): TerminalOutputObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  return buildTerminalOutputObservation({
    normalizedOutput,
    application: args.application,
    maxChars: args.maxChars
  })
}

function buildTerminalLastCommandResultObservation(args: {
  normalizedOutput: string
  application: TerminalApplication
}): TerminalLastCommandResultObservation {
  const parsedOutput = parseTerminalOutput(args.normalizedOutput)
  const completed = parsedOutput.lastCommandCompleted || parsedOutput.completed
  const exitStatus = parsedOutput.lastCommandCompleted
    ? parsedOutput.lastCommandExitStatus
    : parsedOutput.exitStatus

  return {
    ...buildTerminalRecoveryMetadata({
      application: args.application,
      completed,
      exitStatus,
      busy: parsedOutput.lastCommandId != null && !completed
    }),
    application: args.application,
    commandId: parsedOutput.lastCommandId,
    completed,
    exitStatus,
    exitMarkerCount: parsedOutput.exitMarkerCount
  }
}

function parseTerminalLastCommandResultObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  target?: TerminalSessionTarget
}): TerminalLastCommandResultObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  return applyTerminalTarget({
    observation: buildTerminalLastCommandResultObservation({
      normalizedOutput,
      application: args.application
    }),
    target: args.target
  })
}

function parseTerminalSessionRows(args: {
  normalizedOutput: string
  application: TerminalApplication
}): TerminalSessionObservation[] {
  return args.normalizedOutput
    ? args.normalizedOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          windowIndex = '',
          tabIndex = '',
          sessionIndex = '',
          active = '',
          busy = '',
          title = '',
          tty = ''
        ] = line.split('\t')

        return {
          application: args.application,
          windowIndex: Number(windowIndex) || 0,
          tabIndex: Number(tabIndex) || 0,
          sessionIndex: Number(sessionIndex) || 0,
          paneIndex: args.application === 'Terminal' ? undefined : (Number(sessionIndex) || 0),
          active: active === 'true',
          busy: busy === 'true',
          title,
          tty
        } satisfies TerminalSessionObservation
      })
    : []
}

function parseTerminalSessionListObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  limit?: number
}): TerminalSessionListObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const allSessions = parseTerminalSessionRows({
    normalizedOutput,
    application: args.application
  })
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(Number(args.limit))) : allSessions.length
  const sessions = allSessions.slice(0, limit)

  return {
    application: args.application,
    sessions,
    totalSessions: allSessions.length,
    returnedSessions: sessions.length,
    truncated: sessions.length < allSessions.length
  }
}

function parseTerminalPaneListObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  target?: Pick<TerminalSessionTarget, 'windowIndex' | 'tabIndex'>
  limit?: number
}): TerminalPaneListObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const allPanes = parseTerminalSessionRows({
    normalizedOutput,
    application: args.application
  })
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(Number(args.limit))) : allPanes.length
  const panes = allPanes.slice(0, limit)

  return {
    application: args.application,
    panes,
    totalPanes: allPanes.length,
    returnedPanes: panes.length,
    truncated: panes.length < allPanes.length,
    windowIndex: args.target?.windowIndex,
    tabIndex: args.target?.tabIndex
  }
}

function parseTerminalPaneLayoutRows(args: {
  normalizedOutput: string
  application: TerminalApplication
}): TerminalPaneLayoutPaneObservation[] {
  return args.normalizedOutput
    ? args.normalizedOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          recordType = '',
          windowIndex = '',
          tabIndex = '',
          sessionIndex = '',
          active = '',
          busy = '',
          title = '',
          tty = '',
          columns = '',
          rows = ''
        ] = line.split('\t')

        if (recordType !== '__PANE__') {
          return null
        }

        const numericSessionIndex = Number(sessionIndex) || 0
        const numericColumns = Number(columns) || 0
        const numericRows = Number(rows) || 0

        return {
          application: args.application,
          windowIndex: Number(windowIndex) || 0,
          tabIndex: Number(tabIndex) || 0,
          sessionIndex: numericSessionIndex,
          paneIndex: args.application === 'Terminal' ? undefined : numericSessionIndex,
          active: active === 'true',
          busy: busy === 'true',
          title,
          tty,
          columns: numericColumns > 0 ? numericColumns : null,
          rows: numericRows > 0 ? numericRows : null
        } satisfies TerminalPaneLayoutPaneObservation
      })
      .filter((pane): pane is TerminalPaneLayoutPaneObservation => pane != null)
    : []
}

function buildSyntheticTerminalPaneHierarchy(
  panes: TerminalPaneLayoutPaneObservation[]
): TerminalPaneLayoutHierarchyNode {
  return {
    type: 'group',
    splitDirection: 'unknown',
    children: panes.map((pane) => ({
      type: 'pane' as const,
      paneIndex: pane.paneIndex,
      sessionIndex: pane.sessionIndex,
      active: pane.active,
      busy: pane.busy,
      title: pane.title,
      tty: pane.tty,
      columns: pane.columns,
      rows: pane.rows
    }))
  }
}

function parseTerminalPaneLayoutObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  target?: Pick<TerminalSessionTarget, 'windowIndex' | 'tabIndex'>
}): TerminalPaneLayoutObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const panes = parseTerminalPaneLayoutRows({
    normalizedOutput,
    application: args.application
  })
  const activePaneIndex = panes.find((pane) => pane.active)?.paneIndex ?? null

  return {
    application: args.application,
    panes,
    totalPanes: panes.length,
    activePaneIndex,
    supportedSplitDirections: ['horizontal', 'vertical'],
    hierarchySource: 'synthetic_flat',
    splitHierarchy: buildSyntheticTerminalPaneHierarchy(panes),
    windowIndex: args.target?.windowIndex ?? panes[0]?.windowIndex,
    tabIndex: args.target?.tabIndex ?? panes[0]?.tabIndex
  }
}

function parseTerminalSessionStateObservation(args: {
  result: MacOSAutomationResult
  application: TerminalApplication
  target?: TerminalSessionTarget
}): TerminalSessionStateObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const session = parseTerminalSessionRows({
    normalizedOutput,
    application: args.application
  })[0]

  const baseSession: TerminalSessionObservation = session ?? {
    application: args.application,
    windowIndex: args.target?.windowIndex ?? 0,
    tabIndex: args.target?.tabIndex ?? 0,
    sessionIndex: args.target?.sessionIndex ?? (args.application === 'Terminal' ? 1 : 0),
    paneIndex: args.target?.paneIndex ?? (args.application === 'Terminal' ? undefined : (args.target?.sessionIndex ?? 0)),
    active: false,
    busy: false,
    title: '',
    tty: ''
  }

  return {
    ...baseSession,
    completed: false,
    exitStatus: null,
    exitMarkerCount: 0,
    ...buildTerminalRecoveryMetadata({
      application: args.application,
      completed: false,
      exitStatus: null,
      busy: baseSession.busy
    })
  }
}

function parseChromeTabRows(normalizedOutput: string): ChromeTabObservation[] {
  return normalizedOutput
    ? normalizedOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [windowIndex = '', tabIndex = '', active = '', title = '', url = ''] = line.split('\t')
        return {
          windowIndex: Number(windowIndex) || 0,
          tabIndex: Number(tabIndex) || 0,
          active: active === 'true',
          title,
          url
        } satisfies ChromeTabObservation
      })
    : []
}

function parseChromeTabListObservation(args: {
  result: MacOSAutomationResult
  application: string
  limit?: number
}): ChromeTabListObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const allTabs = parseChromeTabRows(normalizedOutput)
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(Number(args.limit))) : allTabs.length
  const tabs = allTabs.slice(0, limit)

  return {
    application: args.application,
    tabs,
    totalTabs: allTabs.length,
    returnedTabs: tabs.length,
    truncated: tabs.length < allTabs.length
  }
}

function normalizePollingInterval(pollIntervalMs?: number): number {
  return Number.isFinite(pollIntervalMs)
    ? Math.max(100, Math.floor(Number(pollIntervalMs)))
    : 500
}

function normalizeIdleWindowMs(idleMs?: number): number {
  return Number.isFinite(idleMs)
    ? Math.max(100, Math.floor(Number(idleMs)))
    : 1_500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createTimeoutResult(args: {
  workDir: string
  timeoutMs: number
  stdout?: string
  runner?: string
  message: string
}): MacOSAutomationResult {
  return {
    runner: args.runner ?? 'osascript',
    cwd: args.workDir,
    returnCode: 124,
    stdout: args.stdout ?? '',
    stderr: args.message,
    timedOut: true,
    timeoutMs: args.timeoutMs,
    ok: false,
    errorCode: 'timeout',
    errorMessage: args.message
  }
}

function resolveFinderSearchDirectory(target: string | undefined, workDir: string): string {
  if (!target?.trim()) {
    return homedir()
  }

  return normalizeLocalFilePath(target, workDir) || target.trim()
}

function parseFinderSearchObservation(args: {
  result: MacOSAutomationResult
  query: string
  directory: string
}): FinderSearchObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const lines = normalizedOutput
    ? normalizedOutput.split('\n').map((line) => line.trim()).filter(Boolean)
    : []
  const countLine = lines.find((line) => line.startsWith('__COUNT__:'))
  const totalResults = countLine ? Number(countLine.replace('__COUNT__:', '')) || 0 : lines.length
  const results = lines.filter((line) => !line.startsWith('__COUNT__:'))

  return {
    query: args.query,
    directory: args.directory,
    results,
    totalResults,
    returnedResults: results.length,
    truncated: results.length < totalResults
  }
}

function parseChromeActiveTabObservation(args: {
  result: MacOSAutomationResult
  application: string
}): ChromeActiveTabObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const [windowIndex = '', tabIndex = '', title = '', url = ''] = normalizedOutput.split('\t')

  return {
    application: args.application,
    windowIndex: Number(windowIndex) || 0,
    tabIndex: Number(tabIndex) || 0,
    title,
    url
  }
}

function matchChromeTab(args: {
  tab: ChromeTabObservation
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
}): boolean {
  const normalizedQuery = args.query.trim().toLowerCase()
  const title = args.tab.title.toLowerCase()
  const url = args.tab.url.toLowerCase()

  switch (args.field) {
    case 'title':
      return title.includes(normalizedQuery)
    case 'url':
      return url.includes(normalizedQuery)
    case 'domain': {
      try {
        return new URL(args.tab.url).hostname.toLowerCase().includes(normalizedQuery)
      } catch {
        return url.includes(normalizedQuery)
      }
    }
    case 'either':
    default:
      return title.includes(normalizedQuery) || url.includes(normalizedQuery)
  }
}

function parseChromeTabMatchObservation(args: {
  result: MacOSAutomationResult
  application: string
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  limit?: number
}): ChromeTabMatchObservation {
  const normalizedOutput = normalizeTextOutput(args.result.stdout)
  const matchedTabs = parseChromeTabRows(normalizedOutput).filter((tab) => matchChromeTab({
    tab,
    query: args.query,
    field: args.field
  }))
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(Number(args.limit))) : matchedTabs.length
  const tabs = matchedTabs.slice(0, limit)

  return {
    application: args.application,
    query: args.query,
    field: args.field,
    tabs,
    totalMatches: matchedTabs.length,
    returnedMatches: tabs.length,
    truncated: tabs.length < matchedTabs.length
  }
}

function buildChromeTabFocusScript(args: {
  application: string
  tab: ChromeTabObservation
}): string {
  if (args.tab.url.trim()) {
    return buildChromeFocusTabByUrlScript(args.tab.url, args.application)
  }

  return buildChromeFocusTabScript(args.tab.title, args.application)
}

async function waitForChromeTabMatch(args: {
  runtime: DesktopHostRuntime
  workDir: string
  application: string
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  limit?: number
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<{
  result: MacOSAutomationResult
  observation: ChromeWaitForTabObservation
}> {
  const overallTimeoutMs = Number.isFinite(args.timeoutMs)
    ? Math.max(1_000, Math.floor(Number(args.timeoutMs)))
    : 20_000
  const pollIntervalMs = normalizePollingInterval(args.pollIntervalMs)
  const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
  const startedAt = Date.now()
  let attempts = 0
  let lastResult: MacOSAutomationResult | null = null
  let lastObservation: ChromeTabMatchObservation | null = null

  while (Date.now() - startedAt <= overallTimeoutMs) {
    attempts += 1
    const result = await args.runtime.runAppleScript({
      workDir: args.workDir,
      script: buildChromeListTabsScript(args.application),
      timeoutMs: perAttemptTimeoutMs
    })
    if (result.returnCode !== 0 || result.timedOut) {
      return {
        result,
        observation: {
          ...(lastObservation ?? {
            application: args.application,
            query: args.query,
            field: args.field,
            tabs: [],
            totalMatches: 0,
            returnedMatches: 0,
            truncated: false
          }),
          matched: false,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const observation = parseChromeTabMatchObservation({
      result,
      application: args.application,
      query: args.query,
      field: args.field,
      limit: args.limit
    })
    lastResult = result
    lastObservation = observation

    if (observation.totalMatches > 0) {
      return {
        result,
        observation: {
          ...observation,
          matched: true,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      break
    }

    await sleep(Math.min(pollIntervalMs, remainingMs))
  }

  const timeoutMessage = `${args.application} did not expose a matching tab for "${args.query}" within ${overallTimeoutMs}ms.`
  return {
    result: createTimeoutResult({
      workDir: args.workDir,
      timeoutMs: overallTimeoutMs,
      stdout: lastResult?.stdout ?? '',
      runner: lastResult?.runner,
      message: timeoutMessage
    }),
    observation: {
      ...(lastObservation ?? {
        application: args.application,
        query: args.query,
        field: args.field,
        tabs: [],
        totalMatches: 0,
        returnedMatches: 0,
        truncated: false
      }),
      matched: false,
      attempts,
      elapsedMs: Date.now() - startedAt
    }
  }
}

async function waitForChromeActiveTabMatch(args: {
  runtime: DesktopHostRuntime
  workDir: string
  application: string
  query: string
  field: 'title' | 'url' | 'either' | 'domain'
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<{
  result: MacOSAutomationResult
  observation: ChromeWaitForActiveTabObservation
}> {
  const overallTimeoutMs = Number.isFinite(args.timeoutMs)
    ? Math.max(1_000, Math.floor(Number(args.timeoutMs)))
    : 20_000
  const pollIntervalMs = normalizePollingInterval(args.pollIntervalMs)
  const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
  const startedAt = Date.now()
  let attempts = 0
  let lastResult: MacOSAutomationResult | null = null
  let lastObservation: ChromeActiveTabObservation | null = null

  while (Date.now() - startedAt <= overallTimeoutMs) {
    attempts += 1
    const result = await args.runtime.runAppleScript({
      workDir: args.workDir,
      script: buildChromeGetActiveTabScript(args.application),
      timeoutMs: perAttemptTimeoutMs
    })
    if (result.returnCode !== 0 || result.timedOut) {
      return {
        result,
        observation: {
          ...(lastObservation ?? {
            application: args.application,
            windowIndex: 0,
            tabIndex: 0,
            title: '',
            url: ''
          }),
          query: args.query,
          field: args.field,
          matched: false,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const observation = parseChromeActiveTabObservation({
      result,
      application: args.application
    })
    lastResult = result
    lastObservation = observation

    if (matchChromeTab({
      tab: {
        windowIndex: observation.windowIndex,
        tabIndex: observation.tabIndex,
        active: true,
        title: observation.title,
        url: observation.url
      },
      query: args.query,
      field: args.field
    })) {
      return {
        result,
        observation: {
          ...observation,
          query: args.query,
          field: args.field,
          matched: true,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      break
    }

    await sleep(Math.min(pollIntervalMs, remainingMs))
  }

  const timeoutMessage = `${args.application} did not switch to an active tab matching "${args.query}" within ${overallTimeoutMs}ms.`
  return {
    result: createTimeoutResult({
      workDir: args.workDir,
      timeoutMs: overallTimeoutMs,
      stdout: lastResult?.stdout ?? '',
      runner: lastResult?.runner,
      message: timeoutMessage
    }),
    observation: {
      ...(lastObservation ?? {
        application: args.application,
        windowIndex: 0,
        tabIndex: 0,
        title: '',
        url: ''
      }),
      query: args.query,
      field: args.field,
      matched: false,
      attempts,
      elapsedMs: Date.now() - startedAt
    }
  }
}

async function waitForTerminalExitStatus(args: {
  runtime: DesktopHostRuntime
  workDir: string
  application: TerminalApplication
  target?: TerminalSessionTarget
  baselineExitMarkerCount: number
  timeoutMs?: number
  pollIntervalMs?: number
  maxChars?: number
}): Promise<{
  result: MacOSAutomationResult
  observation: TerminalCommandCompletionObservation
}> {
  const overallTimeoutMs = Number.isFinite(args.timeoutMs)
    ? Math.max(1_000, Math.floor(Number(args.timeoutMs)))
    : 20_000
  const pollIntervalMs = normalizePollingInterval(args.pollIntervalMs)
  const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
  const startedAt = Date.now()
  let attempts = 0
  let lastResult: MacOSAutomationResult | null = null
  let lastObservation: TerminalOutputObservation | null = null

  while (Date.now() - startedAt <= overallTimeoutMs) {
    attempts += 1
    const result = await runTerminalAppleScriptWithFallback({
      runtime: args.runtime,
      workDir: args.workDir,
      application: args.application,
      timeoutMs: perAttemptTimeoutMs,
      buildScript: (application) => buildTerminalReadOutputScript(application, args.target)
    })
    if (result.returnCode !== 0 || result.timedOut) {
      const observation = lastObservation ?? applyTerminalTarget({
        observation: buildTerminalOutputObservation({
          normalizedOutput: '',
          application: args.application,
          maxChars: args.maxChars
        }),
        target: args.target
      })
      return {
        result,
        observation: {
          ...observation,
          ...buildTerminalRecoveryMetadata({
            application: args.application,
            completed: observation.completed,
            exitStatus: observation.exitStatus,
            timedOut: result.timedOut
          }),
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const observation = buildTerminalOutputObservation({
      normalizedOutput: normalizeTextOutput(result.stdout),
      application: args.application,
      maxChars: args.maxChars
    })
    const targetedObservation = applyTerminalTarget({
      observation,
      target: args.target
    })
    lastResult = result
    lastObservation = targetedObservation

    if (targetedObservation.completed && targetedObservation.exitMarkerCount > args.baselineExitMarkerCount) {
      return {
        result,
        observation: {
          ...targetedObservation,
          ...buildTerminalRecoveryMetadata({
            application: args.application,
            completed: targetedObservation.completed,
            exitStatus: targetedObservation.exitStatus
          }),
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      break
    }

    await sleep(Math.min(pollIntervalMs, remainingMs))
  }

  const timeoutMessage = `${args.application} did not report an exit status within ${overallTimeoutMs}ms.`
  return {
    result: createTimeoutResult({
      workDir: args.workDir,
      timeoutMs: overallTimeoutMs,
      stdout: lastResult?.stdout ?? '',
      runner: lastResult?.runner,
      message: timeoutMessage
    }),
    observation: {
      ...(lastObservation ?? buildTerminalOutputObservation({
        normalizedOutput: '',
        application: args.application,
        maxChars: args.maxChars
      })),
      ...buildTerminalRecoveryMetadata({
        application: args.application,
        completed: lastObservation?.completed ?? false,
        exitStatus: lastObservation?.exitStatus ?? null,
        timedOut: true
      }),
      attempts,
      elapsedMs: Date.now() - startedAt
    }
  }
}

async function waitForTerminalSessionNotBusy(args: {
  runtime: DesktopHostRuntime
  workDir: string
  application: TerminalApplication
  target?: TerminalSessionTarget
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<{
  result: MacOSAutomationResult
  observation: TerminalBusyWaitObservation
}> {
  const overallTimeoutMs = Number.isFinite(args.timeoutMs)
    ? Math.max(1_000, Math.floor(Number(args.timeoutMs)))
    : 20_000
  const pollIntervalMs = normalizePollingInterval(args.pollIntervalMs)
  const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
  const startedAt = Date.now()
  let attempts = 0
  let lastResult: MacOSAutomationResult | null = null
  let lastObservation: TerminalSessionStateObservation | null = null

  while (Date.now() - startedAt <= overallTimeoutMs) {
    attempts += 1
    const result = await runTerminalAppleScriptWithFallback({
      runtime: args.runtime,
      workDir: args.workDir,
      application: args.application,
      timeoutMs: perAttemptTimeoutMs,
      buildScript: (application) => buildTerminalGetSessionStateScript(application, args.target)
    })
    if (result.returnCode !== 0 || result.timedOut) {
      const observation = lastObservation ?? parseTerminalSessionStateObservation({
        result: {
          ...result,
          stdout: ''
        },
        application: args.application,
        target: args.target
      })
      return {
        result,
        observation: {
          ...observation,
          ...buildTerminalRecoveryMetadata({
            application: args.application,
            completed: observation.completed,
            exitStatus: observation.exitStatus,
            busy: observation.busy,
            timedOut: result.timedOut
          }),
          busy: lastObservation?.busy ?? false,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const observation = parseTerminalSessionStateObservation({
      result,
      application: args.application,
      target: args.target
    })
    lastResult = result
    lastObservation = observation

    if (!observation.busy) {
      const outputResult = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.workDir,
        application: args.application,
        timeoutMs: perAttemptTimeoutMs,
        buildScript: (application) => buildTerminalReadOutputScript(application, args.target)
      })
      const outputObservation = outputResult.returnCode === 0 && !outputResult.timedOut
        ? applyTerminalTarget({
          observation: parseTerminalOutputObservation({
            result: outputResult,
            application: args.application
          }),
          target: args.target
        })
        : null

      return {
        result: outputResult.returnCode === 0 && !outputResult.timedOut ? outputResult : result,
        observation: {
          ...observation,
          completed: outputObservation?.completed ?? false,
          exitStatus: outputObservation?.exitStatus ?? null,
          exitMarkerCount: outputObservation?.exitMarkerCount ?? 0,
          ...buildTerminalRecoveryMetadata({
            application: args.application,
            completed: outputObservation?.completed ?? false,
            exitStatus: outputObservation?.exitStatus ?? null,
            busy: false,
            timedOut: outputResult.timedOut
          }),
          busy: false,
          attempts,
          elapsedMs: Date.now() - startedAt
        }
      }
    }

    const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      break
    }

    await sleep(Math.min(pollIntervalMs, remainingMs))
  }

  const timeoutMessage = `${args.application} session stayed busy longer than ${overallTimeoutMs}ms.`
  return {
    result: createTimeoutResult({
      workDir: args.workDir,
      timeoutMs: overallTimeoutMs,
      stdout: lastResult?.stdout ?? '',
      runner: lastResult?.runner,
      message: timeoutMessage
    }),
    observation: {
      ...(lastObservation ?? {
        application: args.application,
        windowIndex: args.target?.windowIndex ?? 0,
        tabIndex: args.target?.tabIndex ?? 0,
        sessionIndex: args.target?.sessionIndex ?? (args.application === 'Terminal' ? 1 : 0),
        paneIndex: args.target?.paneIndex ?? (args.application === 'Terminal' ? undefined : (args.target?.sessionIndex ?? 0)),
        active: false,
        busy: true,
        title: '',
        tty: '',
        completed: false,
        exitStatus: null,
        exitMarkerCount: 0,
        completionState: 'running',
        recoveryHint: null,
        recoverySuggestions: []
      }),
      ...buildTerminalRecoveryMetadata({
        application: args.application,
        completed: lastObservation?.completed ?? false,
        exitStatus: lastObservation?.exitStatus ?? null,
        busy: lastObservation?.busy ?? true,
        timedOut: true
      }),
      busy: lastObservation?.busy ?? true,
      attempts,
      elapsedMs: Date.now() - startedAt
    }
  }
}

export async function executeDesktopAdapterMethod(args: {
  runtime: DesktopHostRuntime
  platform: NodeJS.Platform
  input: DesktopAdapterMethodExecutionInput
}): Promise<DesktopAdapterMethodExecution> {
  const stage = getMethodStage(args.input.adapterId, args.input.methodId, args.platform)

  switch (args.input.methodId) {
    case 'finder.reveal_path': {
      const targetPath = requireNonEmptyValue(args.input.target, 'Target path')
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildFinderRevealPathScript(targetPath),
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Revealed ${targetPath} in Finder.`
      }
    }
    case 'finder.open_folder': {
      const targetPath = buildFinderOpenFolderTarget(requireNonEmptyValue(args.input.target, 'Target folder'))
      const result = await args.runtime.openApplication({
        workDir: args.input.workDir,
        application: args.input.application || 'Finder',
        target: targetPath,
        activate: args.input.activate,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened folder ${targetPath} in Finder.`
      }
    }
    case 'finder.open_home_folder': {
      const targetPath = buildFinderOpenHomeFolderTarget(homedir())
      const result = await args.runtime.openApplication({
        workDir: args.input.workDir,
        application: args.input.application || 'Finder',
        target: targetPath,
        activate: args.input.activate,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: 'Opened the home folder in Finder.'
      }
    }
    case 'finder.new_window': {
      const application = requireNonEmptyValue(args.input.application || 'Finder', 'Application')
      const shortcut = buildFinderNewWindowShortcut()
      const activateResult = await args.runtime.activateApplication({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })
      if (activateResult.returnCode !== 0 || activateResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activateResult,
          successText: 'Opened a new Finder window.'
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: 'Opened a new Finder window.'
      }
    }
    case 'finder.search': {
      const query = requireNonEmptyValue(args.input.command, 'Search query')
      const directory = resolveFinderSearchDirectory(args.input.target, args.input.workDir)
      const limit = Number.isFinite(args.input.limit) ? Math.max(1, Math.floor(Number(args.input.limit))) : 20
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildFinderSearchScript(query, directory, limit),
        timeoutMs: args.input.timeoutMs
      })
      const data = parseFinderSearchObservation({
        result,
        query,
        directory
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Found ${data.returnedResults} Finder search matches.`
      }
    }
    case 'terminal.list_sessions': {
      const application = normalizeTerminalApplication(args.input.application)
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalListSessionsScript(currentApplication)
      })
      const data = parseTerminalSessionListObservation({
        result,
        application,
        limit: args.input.limit
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Listed ${data.returnedSessions} ${application} sessions.`
      }
    }
    case 'terminal.list_panes': {
      const application = normalizeTerminalApplication(args.input.application)
      requireITermApplication(application, 'terminal.list_panes')
      const target = resolveTerminalPaneListTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalListPanesScript(currentApplication, target)
      })
      const data = parseTerminalPaneListObservation({
        result,
        application,
        target,
        limit: args.input.limit
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Listed ${data.returnedPanes} ${application} panes.`
      }
    }
    case 'terminal.get_pane_layout': {
      const application = normalizeTerminalApplication(args.input.application)
      requireITermApplication(application, 'terminal.get_pane_layout')
      const target = resolveTerminalPaneListTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalGetPaneLayoutScript(currentApplication, target)
      })
      const data = parseTerminalPaneLayoutObservation({
        result,
        application,
        target
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Read pane layout from ${application}.`
      }
    }
    case 'terminal.focus_session': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      if (!target) {
        throw createDesktopAdapterExecutionError(
          'invalid_input',
          'Focus session requires at least one of windowIndex, tabIndex, or sessionIndex.'
        )
      }

      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalFocusSessionScript(currentApplication, target)
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Focused ${application} session.`
      }
    }
    case 'terminal.run_command': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalRunCommandScript(command, currentApplication, target)
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Ran command in ${application}.`
      }
    }
    case 'terminal.run_command_and_wait': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const application = normalizeTerminalApplication(args.input.application)
      const commandId = createTerminalCommandId()
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const baselineResult = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
      })
      const baselineObservation = baselineResult.returnCode === 0 && !baselineResult.timedOut
        ? applyTerminalTarget({
          observation: buildTerminalOutputObservation({
            normalizedOutput: normalizeTextOutput(baselineResult.stdout),
            application,
            maxChars: args.input.maxChars
          }),
          target
        })
        : null
      const dispatchResult = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalRunCommandScript(command, currentApplication, target, commandId)
      })

      if (dispatchResult.returnCode !== 0 || dispatchResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: dispatchResult,
          data: { commandId },
          successText: `Completed command in ${application}.`
        }
      }

      const completion = await waitForTerminalExitStatus({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        target,
        baselineExitMarkerCount: baselineObservation?.exitMarkerCount ?? 0,
        timeoutMs: args.input.timeoutMs,
        pollIntervalMs: args.input.pollIntervalMs,
        maxChars: args.input.maxChars
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: completion.result,
        data: {
          ...completion.observation,
          commandId
        },
        successText: `Completed command in ${application}.`
      }
    }
    case 'terminal.new_tab_run_command': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const application = normalizeTerminalApplication(args.input.application)
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalNewTabRunCommandScript(command, currentApplication)
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened a new tab and ran command in ${application}.`
      }
    }
    case 'terminal.new_window_run_command': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const application = normalizeTerminalApplication(args.input.application)
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalNewWindowRunCommandScript(command, currentApplication)
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened a new window and ran command in ${application}.`
      }
    }
    case 'terminal.split_pane_run_command': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const application = normalizeTerminalApplication(args.input.application)
      requireITermApplication(application, 'terminal.split_pane_run_command')
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const direction: TerminalSplitDirection = args.input.direction === 'horizontal' ? 'horizontal' : 'vertical'
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalSplitPaneRunCommandScript(command, direction, currentApplication, target)
      })
      const data = result.returnCode === 0 && !result.timedOut
        ? {
          ...parseTerminalSessionStateObservation({
            result,
            application
          }),
          commandId: null,
          direction,
          created: true
        } satisfies TerminalSplitPaneObservation
        : { commandId: null }

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Split ${application} pane (${direction}) and ran command.`
      }
    }
    case 'terminal.run_command_in_directory': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const directory = requireNonEmptyValue(args.input.target, 'Directory')
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalRunCommandInDirectoryScript(command, directory, currentApplication, target)
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Ran command in ${application} at ${directory}.`
      }
    }
    case 'terminal.run_command_in_directory_and_wait': {
      const command = requireNonEmptyValue(args.input.command, 'Command')
      const directory = requireNonEmptyValue(args.input.target, 'Directory')
      const application = normalizeTerminalApplication(args.input.application)
      const commandId = createTerminalCommandId()
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const baselineResult = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
      })
      const baselineObservation = baselineResult.returnCode === 0 && !baselineResult.timedOut
        ? applyTerminalTarget({
          observation: buildTerminalOutputObservation({
            normalizedOutput: normalizeTextOutput(baselineResult.stdout),
            application,
            maxChars: args.input.maxChars
          }),
          target
        })
        : null
      const dispatchResult = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalRunCommandInDirectoryScript(command, directory, currentApplication, target, commandId)
      })

      if (dispatchResult.returnCode !== 0 || dispatchResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: dispatchResult,
          data: { commandId },
          successText: `Completed command in ${application} at ${directory}.`
        }
      }

      const completion = await waitForTerminalExitStatus({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        target,
        baselineExitMarkerCount: baselineObservation?.exitMarkerCount ?? 0,
        timeoutMs: args.input.timeoutMs,
        pollIntervalMs: args.input.pollIntervalMs,
        maxChars: args.input.maxChars
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: completion.result,
        data: {
          ...completion.observation,
          commandId
        },
        successText: `Completed command in ${application} at ${directory}.`
      }
    }
    case 'terminal.interrupt_process': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const shortcut = buildTerminalInterruptShortcut()
      const activationResult = target
        ? await runTerminalAppleScriptWithFallback({
          runtime: args.runtime,
          workDir: args.input.workDir,
          application,
          timeoutMs: args.input.timeoutMs,
          buildScript: (currentApplication) => buildTerminalFocusSessionScript(currentApplication, target)
        })
        : await args.runtime.activateApplication({
          workDir: args.input.workDir,
          application,
          timeoutMs: args.input.timeoutMs
        })
      if (activationResult.returnCode !== 0 || activationResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activationResult,
          successText: `Sent interrupt to ${application}.`
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Sent interrupt to ${application}.`
      }
    }
    case 'terminal.get_session_state': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalGetSessionStateScript(currentApplication, target)
      })
      const data = parseTerminalSessionStateObservation({
        result,
        application,
        target
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Read session state from ${application}.`
      }
    }
    case 'terminal.get_last_command_result': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
      })
      const data = parseTerminalLastCommandResultObservation({
        result,
        application,
        target
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Read last command result from ${application}.`
      }
    }
    case 'terminal.read_output': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const result = await runTerminalAppleScriptWithFallback({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs,
        buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
      })
      const data = applyTerminalTarget({
        observation: parseTerminalOutputObservation({
          result,
          application,
          maxChars: args.input.maxChars
        }),
        target
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Read output from ${application}.`
      }
    }
    case 'terminal.wait_for_output': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const expectedText = requireNonEmptyValue(args.input.expectedText, 'Expected text')
      const overallTimeoutMs = Number.isFinite(args.input.timeoutMs)
        ? Math.max(1_000, Math.floor(Number(args.input.timeoutMs)))
        : 20_000
      const pollIntervalMs = normalizePollingInterval(args.input.pollIntervalMs)
      const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
      const startedAt = Date.now()
      let attempts = 0
      let lastResult: MacOSAutomationResult | null = null
      let lastObservation: TerminalOutputObservation | null = null

      while (Date.now() - startedAt <= overallTimeoutMs) {
        attempts += 1
        const result = await runTerminalAppleScriptWithFallback({
          runtime: args.runtime,
          workDir: args.input.workDir,
          application,
          timeoutMs: perAttemptTimeoutMs,
          buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
        })
        if (result.returnCode !== 0 || result.timedOut) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result,
            successText: `Observed "${expectedText}" in ${application}.`
          }
        }

        const normalizedOutput = normalizeTextOutput(result.stdout)
        const observation = buildTerminalOutputObservation({
          normalizedOutput,
          application,
          maxChars: args.input.maxChars
        })
        const targetedObservation = applyTerminalTarget({
          observation,
          target
        })
        lastResult = result
        lastObservation = targetedObservation

        if (normalizedOutput.includes(expectedText)) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result,
            data: {
              ...targetedObservation,
              ...buildTerminalRecoveryMetadata({
                application,
                completed: targetedObservation.completed,
                exitStatus: targetedObservation.exitStatus,
                matched: true,
                expectedText
              }),
              expectedText,
              matched: true,
              attempts,
              elapsedMs: Date.now() - startedAt
            } satisfies TerminalWaitForOutputObservation,
            successText: `Observed "${expectedText}" in ${application}.`
          }
        }

        const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
        if (remainingMs <= 0) {
          break
        }

        await sleep(Math.min(pollIntervalMs, remainingMs))
      }

      const timeoutMessage = `Expected terminal output "${expectedText}" was not observed within ${overallTimeoutMs}ms.`
      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: createTimeoutResult({
          workDir: args.input.workDir,
          timeoutMs: overallTimeoutMs,
          stdout: lastResult?.stdout ?? '',
          runner: lastResult?.runner,
          message: timeoutMessage
        }),
        data: {
          ...(lastObservation ?? applyTerminalTarget({
            observation: buildTerminalOutputObservation({
              normalizedOutput: '',
              application,
              maxChars: args.input.maxChars
            }),
            target
          })),
          ...buildTerminalRecoveryMetadata({
            application,
            completed: lastObservation?.completed ?? false,
            exitStatus: lastObservation?.exitStatus ?? null,
            busy: false,
            timedOut: true,
            expectedText,
            matched: false
          }),
          expectedText,
          matched: false,
          attempts,
          elapsedMs: Date.now() - startedAt
        } satisfies TerminalWaitForOutputObservation,
        successText: `Observed "${expectedText}" in ${application}.`
      }
    }
    case 'terminal.wait_until_not_busy': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const wait = await waitForTerminalSessionNotBusy({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        target,
        timeoutMs: args.input.timeoutMs,
        pollIntervalMs: args.input.pollIntervalMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: wait.result,
        data: applyTerminalTarget({
          observation: wait.observation,
          target
        }),
        successText: `Observed ${application} session idle state.`
      }
    }
    case 'terminal.wait_until_idle': {
      const application = normalizeTerminalApplication(args.input.application)
      const target = resolveTerminalSessionTarget({
        application,
        input: args.input
      })
      const overallTimeoutMs = Number.isFinite(args.input.timeoutMs)
        ? Math.max(1_000, Math.floor(Number(args.input.timeoutMs)))
        : 20_000
      const pollIntervalMs = normalizePollingInterval(args.input.pollIntervalMs)
      const idleMs = normalizeIdleWindowMs(args.input.idleMs)
      const perAttemptTimeoutMs = Math.min(Math.max(1_000, pollIntervalMs), overallTimeoutMs)
      const startedAt = Date.now()
      let checks = 0
      let lastResult: MacOSAutomationResult | null = null
      let lastObservation: TerminalOutputObservation | null = null
      let previousOutput: string | null = null
      let lastChangeAt = Date.now()

      while (Date.now() - startedAt <= overallTimeoutMs) {
        checks += 1
        const result = await runTerminalAppleScriptWithFallback({
          runtime: args.runtime,
          workDir: args.input.workDir,
          application,
          timeoutMs: perAttemptTimeoutMs,
          buildScript: (currentApplication) => buildTerminalReadOutputScript(currentApplication, target)
        })
        if (result.returnCode !== 0 || result.timedOut) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result,
            successText: `Observed ${application} idle state.`
          }
        }

        const normalizedOutput = normalizeTextOutput(result.stdout)
        const observation = buildTerminalOutputObservation({
          normalizedOutput,
          application,
          maxChars: args.input.maxChars
        })
        const targetedObservation = applyTerminalTarget({
          observation,
          target
        })
        const now = Date.now()
        if (previousOutput === null || normalizedOutput !== previousOutput) {
          previousOutput = normalizedOutput
          lastChangeAt = now
        }

        lastResult = result
        lastObservation = targetedObservation

        if (checks > 1 && now - lastChangeAt >= idleMs) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result,
            data: {
              ...targetedObservation,
              ...buildTerminalRecoveryMetadata({
                application,
                completed: targetedObservation.completed,
                exitStatus: targetedObservation.exitStatus
              }),
              idleMs,
              stable: true,
              checks,
              elapsedMs: now - startedAt
            } satisfies TerminalIdleObservation,
            successText: `Observed ${application} idle state.`
          }
        }

        const remainingMs = overallTimeoutMs - (Date.now() - startedAt)
        if (remainingMs <= 0) {
          break
        }

        await sleep(Math.min(pollIntervalMs, remainingMs))
      }

      const timeoutMessage = `${application} output did not stay idle for ${idleMs}ms within ${overallTimeoutMs}ms.`
      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: createTimeoutResult({
          workDir: args.input.workDir,
          timeoutMs: overallTimeoutMs,
          stdout: lastResult?.stdout ?? '',
          runner: lastResult?.runner,
          message: timeoutMessage
        }),
        data: {
          ...(lastObservation ?? applyTerminalTarget({
            observation: buildTerminalOutputObservation({
              normalizedOutput: '',
              application,
              maxChars: args.input.maxChars
            }),
            target
          })),
          ...buildTerminalRecoveryMetadata({
            application,
            completed: lastObservation?.completed ?? false,
            exitStatus: lastObservation?.exitStatus ?? null,
            timedOut: true
          }),
          idleMs,
          stable: false,
          checks,
          elapsedMs: Date.now() - startedAt
        } satisfies TerminalIdleObservation,
        successText: `Observed ${application} idle state.`
      }
    }
    case 'chrome.open_url': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const target = requireHttpUrl(buildChromeOpenUrlTarget(requireNonEmptyValue(args.input.target, 'Target URL')))
      const result = await args.runtime.openApplication({
        workDir: args.input.workDir,
        application,
        target,
        activate: args.input.activate,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened ${target} in ${application}.`
      }
    }
    case 'chrome.focus_tab_by_title': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const title = requireNonEmptyValue(args.input.target, 'Tab title')
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeFocusTabScript(title, application),
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Focused a tab matching "${title}" in ${application}.`
      }
    }
    case 'chrome.new_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const shortcut = buildChromeNewTabShortcut()
      const activateResult = await args.runtime.activateApplication({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })
      if (activateResult.returnCode !== 0 || activateResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activateResult,
          successText: `Opened a new tab in ${application}.`
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened a new tab in ${application}.`
      }
    }
    case 'chrome.reload_active_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const shortcut = buildChromeReloadActiveTabShortcut()
      const activateResult = await args.runtime.activateApplication({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })
      if (activateResult.returnCode !== 0 || activateResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activateResult,
          successText: `Reloaded the active tab in ${application}.`
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Reloaded the active tab in ${application}.`
      }
    }
    case 'chrome.focus_tab_by_url': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const url = requireNonEmptyValue(args.input.target, 'Tab URL')
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeFocusTabByUrlScript(url, application),
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Focused a tab matching URL "${url}" in ${application}.`
      }
    }
    case 'chrome.open_url_in_new_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const target = requireHttpUrl(buildChromeOpenUrlTarget(requireNonEmptyValue(args.input.target, 'Target URL')))
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeOpenUrlInNewTabScript(target, application),
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened ${target} in a new tab in ${application}.`
      }
    }
    case 'chrome.list_tabs': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeListTabsScript(application),
        timeoutMs: args.input.timeoutMs
      })
      const data = parseChromeTabListObservation({
        result,
        application,
        limit: args.input.limit
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Listed ${data.returnedTabs} tabs in ${application}.`
      }
    }
    case 'chrome.get_active_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeGetActiveTabScript(application),
        timeoutMs: args.input.timeoutMs
      })
      const data = parseChromeActiveTabObservation({
        result,
        application
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Read the active tab in ${application}.`
      }
    }
    case 'chrome.wait_for_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const query = requireNonEmptyValue(args.input.query, 'Tab query')
      const field = args.input.field ?? 'either'
      const wait = await waitForChromeTabMatch({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        query,
        field,
        limit: args.input.limit,
        timeoutMs: args.input.timeoutMs,
        pollIntervalMs: args.input.pollIntervalMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: wait.result,
        data: wait.observation,
        successText: `Observed matching tab "${query}" in ${application}.`
      }
    }
    case 'chrome.wait_for_active_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const query = requireNonEmptyValue(args.input.query, 'Active tab query')
      const field = args.input.field ?? 'either'
      const wait = await waitForChromeActiveTabMatch({
        runtime: args.runtime,
        workDir: args.input.workDir,
        application,
        query,
        field,
        timeoutMs: args.input.timeoutMs,
        pollIntervalMs: args.input.pollIntervalMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: wait.result,
        data: wait.observation,
        successText: `Observed active tab "${query}" in ${application}.`
      }
    }
    case 'chrome.close_active_tab': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const shortcut = buildChromeCloseActiveTabShortcut()
      const activateResult = await args.runtime.activateApplication({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })
      if (activateResult.returnCode !== 0 || activateResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activateResult,
          successText: `Closed the active tab in ${application}.`
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Closed the active tab in ${application}.`
      }
    }
    case 'chrome.find_tabs': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const query = requireNonEmptyValue(args.input.query, 'Tab query')
      const field = args.input.field ?? 'either'
      const result = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeListTabsScript(application),
        timeoutMs: args.input.timeoutMs
      })
      const data = parseChromeTabMatchObservation({
        result,
        application,
        query,
        field,
        limit: args.input.limit
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        data,
        successText: `Found ${data.returnedMatches} matching tabs in ${application}.`
      }
    }
    case 'chrome.close_tabs': {
      const application = requireNonEmptyValue(args.input.application || 'Google Chrome', 'Application')
      const query = requireNonEmptyValue(args.input.query, 'Tab query')
      const field = args.input.field ?? 'either'
      const perAttemptTimeoutMs = Number.isFinite(args.input.timeoutMs)
        ? Math.max(1_000, Math.floor(Number(args.input.timeoutMs)))
        : 20_000
      const closeShortcut = buildChromeCloseActiveTabShortcut()
      const initialListResult = await args.runtime.runAppleScript({
        workDir: args.input.workDir,
        script: buildChromeListTabsScript(application),
        timeoutMs: perAttemptTimeoutMs
      })
      if (initialListResult.returnCode !== 0 || initialListResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: initialListResult,
          successText: `Closed matching tabs in ${application}.`
        }
      }

      const initialMatches = parseChromeTabMatchObservation({
        result: initialListResult,
        application,
        query,
        field,
        limit: args.input.limit
      })
      const tabsToClose = initialMatches.tabs
      const closedTabs: ChromeTabObservation[] = []
      let remainingMatches = initialMatches.totalMatches

      for (const tab of tabsToClose) {
        const focusResult = await args.runtime.runAppleScript({
          workDir: args.input.workDir,
          script: buildChromeTabFocusScript({ application, tab }),
          timeoutMs: perAttemptTimeoutMs
        })
        if (focusResult.returnCode !== 0 || focusResult.timedOut) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result: focusResult,
            data: {
              application,
              query,
              field,
              closedTabs,
              requestedMatches: tabsToClose.length,
              closedCount: closedTabs.length,
              remainingMatches
            } satisfies ChromeCloseTabsObservation,
            successText: `Closed ${closedTabs.length} matching tabs in ${application}.`
          }
        }

        const pressResult = await args.runtime.pressKey({
          workDir: args.input.workDir,
          key: closeShortcut.key,
          modifiers: closeShortcut.modifiers,
          timeoutMs: perAttemptTimeoutMs
        })
        if (pressResult.returnCode !== 0 || pressResult.timedOut) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result: pressResult,
            data: {
              application,
              query,
              field,
              closedTabs,
              requestedMatches: tabsToClose.length,
              closedCount: closedTabs.length,
              remainingMatches
            } satisfies ChromeCloseTabsObservation,
            successText: `Closed ${closedTabs.length} matching tabs in ${application}.`
          }
        }

        await sleep(150)
        const listResult = await args.runtime.runAppleScript({
          workDir: args.input.workDir,
          script: buildChromeListTabsScript(application),
          timeoutMs: perAttemptTimeoutMs
        })
        if (listResult.returnCode !== 0 || listResult.timedOut) {
          return {
            adapterId: args.input.adapterId,
            methodId: args.input.methodId,
            stage,
            result: listResult,
            data: {
              application,
              query,
              field,
              closedTabs,
              requestedMatches: tabsToClose.length,
              closedCount: closedTabs.length,
              remainingMatches
            } satisfies ChromeCloseTabsObservation,
            successText: `Closed ${closedTabs.length} matching tabs in ${application}.`
          }
        }

        const afterMatches = parseChromeTabMatchObservation({
          result: listResult,
          application,
          query,
          field
        })
        if (afterMatches.totalMatches <= remainingMatches - 1 || remainingMatches === 0) {
          closedTabs.push(tab)
          remainingMatches = afterMatches.totalMatches
        }
      }

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result: {
          ...initialListResult,
          stdout: JSON.stringify({
            closedCount: closedTabs.length,
            remainingMatches
          })
        },
        data: {
          application,
          query,
          field,
          closedTabs,
          requestedMatches: tabsToClose.length,
          closedCount: closedTabs.length,
          remainingMatches
        } satisfies ChromeCloseTabsObservation,
        successText: `Closed ${closedTabs.length} matching tabs in ${application}.`
      }
    }
    case 'skillsfan.focus_main_window': {
      const application = requireNonEmptyValue(args.input.application || 'SkillsFan', 'Application')
      const result = await args.runtime.focusWindow({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Focused ${application}.`
      }
    }
    case 'skillsfan.open_settings': {
      const application = requireNonEmptyValue(args.input.application || 'SkillsFan', 'Application')
      const shortcut = buildSkillsFanOpenSettingsShortcut()
      const activateResult = await args.runtime.activateApplication({
        workDir: args.input.workDir,
        application,
        timeoutMs: args.input.timeoutMs
      })
      if (activateResult.returnCode !== 0 || activateResult.timedOut) {
        return {
          adapterId: args.input.adapterId,
          methodId: args.input.methodId,
          stage,
          result: activateResult,
          successText: `Opened settings in ${application}.`
        }
      }
      const result = await args.runtime.pressKey({
        workDir: args.input.workDir,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        timeoutMs: args.input.timeoutMs
      })

      return {
        adapterId: args.input.adapterId,
        methodId: args.input.methodId,
        stage,
        result,
        successText: `Opened settings in ${application}.`
      }
    }
    default:
      throw createDesktopAdapterExecutionError(
        'invalid_input',
        `Unknown desktop adapter method: ${args.input.methodId}`
      )
  }
}

function isProbablyHttpUrl(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false
  }

  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function shouldPreferActivationOverOpenApplication(application: string, target?: string): boolean {
  if (target?.trim()) {
    return false
  }

  const normalizedApplication = application.trim().toLowerCase()
  return [
    'finder',
    'google chrome',
    'chrome',
    'chromium',
    'terminal',
    'iterm',
    'iterm2'
  ].includes(normalizedApplication)
}

export async function maybeExecuteOpenApplicationAdapterMethod(args: {
  runtime: DesktopHostRuntime
  platform: NodeJS.Platform
  workDir: string
  application: string
  target?: string
  activate?: boolean
  timeoutMs?: number
}): Promise<DesktopAdapterMethodExecution | null> {
  const normalizedApplication = args.application.trim().toLowerCase()

  if (normalizedApplication === 'finder' && args.target && !isProbablyHttpUrl(args.target)) {
    const methodId = isExistingDirectory(args.target, args.workDir)
      ? 'finder.open_folder'
      : 'finder.reveal_path'
    return await executeDesktopAdapterMethod({
      runtime: args.runtime,
      platform: args.platform,
      input: {
        workDir: args.workDir,
        adapterId: 'finder',
        methodId,
        application: args.application,
        target: args.target,
        activate: args.activate,
        timeoutMs: args.timeoutMs
      }
    })
  }

  if (['google chrome', 'chrome', 'chromium'].includes(normalizedApplication) && isProbablyHttpUrl(args.target)) {
    return await executeDesktopAdapterMethod({
      runtime: args.runtime,
      platform: args.platform,
      input: {
        workDir: args.workDir,
        adapterId: 'chrome',
        methodId: 'chrome.open_url',
        application: args.application,
        target: args.target,
        activate: args.activate,
        timeoutMs: args.timeoutMs
      }
    })
  }

  if (shouldPreferActivationOverOpenApplication(args.application, args.target)) {
    const result = await args.runtime.activateApplication({
      workDir: args.workDir,
      application: args.application,
      timeoutMs: args.timeoutMs
    })

    return {
      adapterId: normalizedApplication === 'finder'
        ? 'finder'
        : ['google chrome', 'chrome', 'chromium'].includes(normalizedApplication)
          ? 'chrome'
          : 'terminal',
      methodId: 'desktop.activate_application',
      stage: 'active',
      result,
      successText: `Opened ${args.application}.`
    }
  }

  return null
}
