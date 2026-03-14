import {
  executeDesktopAdapterMethod,
  type ChromeActiveTabObservation,
  type ChromeCloseTabsObservation,
  type ChromeTabListObservation,
  type ChromeTabMatchObservation,
  type ChromeWaitForTabObservation,
  type DesktopAdapterMethodExecution,
  type TerminalCommandCompletionObservation,
  type TerminalLastCommandResultObservation,
  type TerminalPaneLayoutObservation,
  type TerminalPaneListObservation,
  type TerminalSessionListObservation,
  type TerminalSessionStateObservation,
  type TerminalSessionTarget
} from './adapters/executor'
import { listDesktopAppAdapters } from './adapters/registry'
import { desktopHostRuntime } from './runtime'
import type { DesktopSmokeFlowExecutionResult, DesktopSmokeFlowExecutionStep } from '../types'

const smokeFlowRuns = new Map<string, DesktopSmokeFlowExecutionResult>()

function cloneRun<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isMethodExecutionSuccessful(execution: DesktopAdapterMethodExecution): boolean {
  return execution.result.returnCode === 0 && !execution.result.timedOut && execution.result.ok !== false
}

function toStepResult(execution: DesktopAdapterMethodExecution): DesktopSmokeFlowExecutionStep {
  const success = isMethodExecutionSuccessful(execution)

  return {
    methodId: execution.methodId,
    success,
    summary: success
      ? execution.successText
      : execution.result.errorMessage || execution.result.stderr || execution.successText,
    errorCode: execution.result.errorCode,
    errorMessage: execution.result.errorMessage || execution.result.stderr || undefined,
    data: execution.data
  }
}

function createRunError(execution: DesktopAdapterMethodExecution): Error {
  return new Error(execution.result.errorMessage || execution.result.stderr || `${execution.methodId} failed.`)
}

function getSmokeFlowDescriptor(flowId: string) {
  for (const adapter of listDesktopAppAdapters(process.platform)) {
    for (const smokeFlow of adapter.smokeFlows || []) {
      if (smokeFlow.id === flowId) {
        return {
          adapterId: adapter.id,
          displayName: smokeFlow.displayName,
          verification: smokeFlow.verification
        }
      }
    }
  }

  throw new Error(`Unknown desktop smoke flow: ${flowId}`)
}

function setSmokeFlowRun(result: DesktopSmokeFlowExecutionResult): DesktopSmokeFlowExecutionResult {
  const cloned = cloneRun(result)
  smokeFlowRuns.set(result.id, cloned)
  return cloneRun(cloned)
}

function finalizeSmokeFlowRun(args: {
  base: DesktopSmokeFlowExecutionResult
  state: 'passed' | 'failed'
  summary: string
  steps: DesktopSmokeFlowExecutionStep[]
  error?: string | null
}): DesktopSmokeFlowExecutionResult {
  const finishedAt = new Date().toISOString()
  const durationMs = Date.parse(finishedAt) - Date.parse(args.base.startedAt)

  return setSmokeFlowRun({
    ...args.base,
    state: args.state,
    summary: args.summary,
    error: args.error ?? null,
    finishedAt,
    durationMs,
    steps: args.steps
  })
}

function getTargetFromSession(args: {
  session?: Pick<TerminalSessionStateObservation, 'windowIndex' | 'tabIndex' | 'sessionIndex' | 'paneIndex'>
}): TerminalSessionTarget | undefined {
  if (!args.session) {
    return undefined
  }

  return {
    windowIndex: args.session.windowIndex,
    tabIndex: args.session.tabIndex,
    sessionIndex: args.session.sessionIndex,
    paneIndex: args.session.paneIndex
  }
}

async function executeSmokeFlowMethod(args: {
  steps: DesktopSmokeFlowExecutionStep[]
  workDir: string
  adapterId: string
  methodId: string
  application?: string
  target?: string
  command?: string
  expectedText?: string
  query?: string
  field?: 'title' | 'url' | 'either' | 'domain'
  direction?: 'horizontal' | 'vertical'
  timeoutMs?: number
  pollIntervalMs?: number
  maxChars?: number
  limit?: number
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}): Promise<DesktopAdapterMethodExecution> {
  const execution = await executeDesktopAdapterMethod({
    runtime: desktopHostRuntime,
    platform: process.platform,
    input: {
      workDir: args.workDir,
      adapterId: args.adapterId,
      methodId: args.methodId,
      application: args.application,
      target: args.target,
      command: args.command,
      expectedText: args.expectedText,
      query: args.query,
      field: args.field,
      direction: args.direction,
      timeoutMs: args.timeoutMs,
      pollIntervalMs: args.pollIntervalMs,
      maxChars: args.maxChars,
      limit: args.limit,
      windowIndex: args.windowIndex,
      tabIndex: args.tabIndex,
      sessionIndex: args.sessionIndex,
      paneIndex: args.paneIndex
    }
  })
  args.steps.push(toStepResult(execution))
  return execution
}

async function resolveAvailableApplication(args: {
  workDir: string
  candidates: string[]
}): Promise<string> {
  let lastError: Error | null = null

  for (const candidate of args.candidates) {
    const result = await desktopHostRuntime.openApplication({
      workDir: args.workDir,
      application: candidate,
      activate: true,
      timeoutMs: 4_000
    })

    if (result.returnCode === 0 && !result.timedOut && result.ok !== false) {
      return candidate
    }

    if (result.errorCode !== 'app_not_found') {
      return candidate
    }

    lastError = new Error(result.errorMessage || `${candidate} is not available.`)
  }

  throw lastError ?? new Error('No supported desktop application is available for this smoke flow.')
}

async function runTerminalCommandRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const marker = `__skillsfan_smoke_terminal_roundtrip_${Date.now().toString(36)}__`
  const runExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.run_command_and_wait',
    application: 'Terminal',
    command: `printf '${marker}\\n'`,
    timeoutMs: 15_000,
    pollIntervalMs: 400,
    maxChars: 4_000
  })
  if (!isMethodExecutionSuccessful(runExecution)) {
    throw createRunError(runExecution)
  }

  const completion = runExecution.data as TerminalCommandCompletionObservation | undefined
  if (!completion?.completed || completion.exitStatus !== 0) {
    throw new Error('Terminal command roundtrip did not complete successfully.')
  }

  const lastResultExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.get_last_command_result',
    application: 'Terminal',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(lastResultExecution)) {
    throw createRunError(lastResultExecution)
  }

  const lastResult = lastResultExecution.data as TerminalLastCommandResultObservation | undefined
  if (!lastResult?.completed || lastResult.exitStatus !== 0) {
    throw new Error('Terminal did not report a successful last command result.')
  }
  if (completion.commandId && lastResult.commandId !== completion.commandId) {
    throw new Error('Terminal last command result did not match the dispatched smoke command.')
  }

  const readExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.read_output',
    application: 'Terminal',
    timeoutMs: 8_000,
    maxChars: 4_000
  })
  if (!isMethodExecutionSuccessful(readExecution)) {
    throw createRunError(readExecution)
  }

  const readOutput = (readExecution.data as { output?: string } | undefined)?.output || ''
  if (!readOutput.includes(marker)) {
    throw new Error('Terminal output did not contain the expected smoke marker.')
  }

  return 'Terminal command roundtrip passed.'
}

async function runTerminalSessionTargeting(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const listExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.list_sessions',
    application: 'Terminal',
    timeoutMs: 8_000,
    limit: 10
  })
  if (!isMethodExecutionSuccessful(listExecution)) {
    throw createRunError(listExecution)
  }

  const sessionList = listExecution.data as TerminalSessionListObservation | undefined
  const targetSession = sessionList?.sessions.find((session) => !session.active) || sessionList?.sessions[0]
  if (!targetSession) {
    throw new Error('No Terminal sessions were available for session targeting.')
  }

  const focusExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.focus_session',
    application: 'Terminal',
    timeoutMs: 8_000,
    windowIndex: targetSession.windowIndex,
    tabIndex: targetSession.tabIndex,
    sessionIndex: targetSession.sessionIndex
  })
  if (!isMethodExecutionSuccessful(focusExecution)) {
    throw createRunError(focusExecution)
  }

  const stateExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.get_session_state',
    application: 'Terminal',
    timeoutMs: 8_000,
    windowIndex: targetSession.windowIndex,
    tabIndex: targetSession.tabIndex,
    sessionIndex: targetSession.sessionIndex
  })
  if (!isMethodExecutionSuccessful(stateExecution)) {
    throw createRunError(stateExecution)
  }

  const sessionState = stateExecution.data as TerminalSessionStateObservation | undefined
  if (!sessionState?.active) {
    throw new Error('Focused Terminal session did not become active.')
  }

  return 'Terminal session targeting passed.'
}

async function runITermSplitPaneRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const application = await resolveAvailableApplication({
    workDir: args.workDir,
    candidates: ['iTerm2', 'iTerm']
  })
  const beforeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.list_panes',
    application,
    timeoutMs: 8_000,
    limit: 20
  })
  if (!isMethodExecutionSuccessful(beforeExecution)) {
    throw createRunError(beforeExecution)
  }

  const before = beforeExecution.data as TerminalPaneListObservation | undefined
  const marker = `__skillsfan_smoke_iterm_split_${Date.now().toString(36)}__`
  const splitExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.split_pane_run_command',
    application,
    command: `printf '${marker}\\n'`,
    direction: 'vertical',
    timeoutMs: 15_000
  })
  if (!isMethodExecutionSuccessful(splitExecution)) {
    throw createRunError(splitExecution)
  }

  const splitState = splitExecution.data as TerminalSessionStateObservation | undefined
  const splitTarget = getTargetFromSession({ session: splitState })
  const layoutExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'terminal',
    methodId: 'terminal.get_pane_layout',
    application,
    timeoutMs: 8_000,
    windowIndex: splitTarget?.windowIndex,
    tabIndex: splitTarget?.tabIndex
  })
  if (!isMethodExecutionSuccessful(layoutExecution)) {
    throw createRunError(layoutExecution)
  }

  const layout = layoutExecution.data as TerminalPaneLayoutObservation | undefined
  if (!layout || layout.totalPanes <= (before?.totalPanes ?? 0)) {
    throw new Error('iTerm pane layout did not reflect a newly created split pane.')
  }

  return `${application} split-pane roundtrip passed.`
}

async function runChromeTabRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const application = await resolveAvailableApplication({
    workDir: args.workDir,
    candidates: ['Google Chrome', 'Chrome', 'Chromium']
  })
  const targetUrl = `https://example.com/?skillsfan_smoke=tab_roundtrip_${Date.now().toString(36)}`
  const openExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.open_url_in_new_tab',
    application,
    target: targetUrl,
    timeoutMs: 12_000
  })
  if (!isMethodExecutionSuccessful(openExecution)) {
    throw createRunError(openExecution)
  }

  const waitExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.wait_for_tab',
    application,
    query: targetUrl,
    field: 'url',
    timeoutMs: 12_000,
    pollIntervalMs: 400,
    limit: 5
  })
  if (!isMethodExecutionSuccessful(waitExecution)) {
    throw createRunError(waitExecution)
  }

  const waitResult = waitExecution.data as ChromeWaitForTabObservation | undefined
  if (!waitResult?.matched) {
    throw new Error('Chrome did not expose the smoke test tab in time.')
  }

  const activeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.get_active_tab',
    application,
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(activeExecution)) {
    throw createRunError(activeExecution)
  }

  const activeTab = activeExecution.data as ChromeActiveTabObservation | undefined
  if (!activeTab?.url.includes(targetUrl)) {
    throw new Error('Chrome active tab did not match the smoke test URL.')
  }

  const closeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.close_tabs',
    application,
    query: targetUrl,
    field: 'url',
    timeoutMs: 12_000
  })
  if (!isMethodExecutionSuccessful(closeExecution)) {
    throw createRunError(closeExecution)
  }

  const closeResult = closeExecution.data as ChromeCloseTabsObservation | undefined
  if (!closeResult || closeResult.closedCount < 1 || closeResult.remainingMatches !== 0) {
    throw new Error('Chrome smoke test tab did not close cleanly.')
  }

  return `${application} tab roundtrip passed.`
}

async function runChromeDiscoveryRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const application = await resolveAvailableApplication({
    workDir: args.workDir,
    candidates: ['Google Chrome', 'Chrome', 'Chromium']
  })
  const targetUrl = `https://example.com/?skillsfan_smoke=discovery_roundtrip_${Date.now().toString(36)}`
  const openExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.open_url_in_new_tab',
    application,
    target: targetUrl,
    timeoutMs: 12_000
  })
  if (!isMethodExecutionSuccessful(openExecution)) {
    throw createRunError(openExecution)
  }

  const listExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.list_tabs',
    application,
    timeoutMs: 8_000,
    limit: 20
  })
  if (!isMethodExecutionSuccessful(listExecution)) {
    throw createRunError(listExecution)
  }

  const listResult = listExecution.data as ChromeTabListObservation | undefined
  if (!listResult || listResult.totalTabs < 1) {
    throw new Error('Chrome did not report any tabs for discovery.')
  }

  const findExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.find_tabs',
    application,
    query: targetUrl,
    field: 'url',
    timeoutMs: 8_000,
    limit: 5
  })
  if (!isMethodExecutionSuccessful(findExecution)) {
    throw createRunError(findExecution)
  }

  const findResult = findExecution.data as ChromeTabMatchObservation | undefined
  if (!findResult || findResult.totalMatches < 1) {
    throw new Error('Chrome tab discovery did not find the smoke test tab.')
  }

  const focusExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.focus_tab_by_url',
    application,
    target: targetUrl,
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(focusExecution)) {
    throw createRunError(focusExecution)
  }

  const activeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.get_active_tab',
    application,
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(activeExecution)) {
    throw createRunError(activeExecution)
  }

  const activeTab = activeExecution.data as ChromeActiveTabObservation | undefined
  if (!activeTab?.url.includes(targetUrl)) {
    throw new Error('Chrome did not focus the discovered smoke test tab.')
  }

  const closeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'chrome',
    methodId: 'chrome.close_tabs',
    application,
    query: targetUrl,
    field: 'url',
    timeoutMs: 12_000
  })
  if (!isMethodExecutionSuccessful(closeExecution)) {
    throw createRunError(closeExecution)
  }

  return `${application} discovery roundtrip passed.`
}

async function runFinderNavigationRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const openHomeExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'finder',
    methodId: 'finder.open_home_folder',
    application: 'Finder',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(openHomeExecution)) {
    throw createRunError(openHomeExecution)
  }

  const revealExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'finder',
    methodId: 'finder.reveal_path',
    application: 'Finder',
    target: args.workDir,
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(revealExecution)) {
    throw createRunError(revealExecution)
  }

  const newWindowExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'finder',
    methodId: 'finder.new_window',
    application: 'Finder',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(newWindowExecution)) {
    throw createRunError(newWindowExecution)
  }

  return 'Finder navigation roundtrip passed.'
}

async function runSkillsFanSettingsRoundtrip(args: {
  workDir: string
  steps: DesktopSmokeFlowExecutionStep[]
}): Promise<string> {
  const focusExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'skillsfan',
    methodId: 'skillsfan.focus_main_window',
    application: 'SkillsFan',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(focusExecution)) {
    throw createRunError(focusExecution)
  }

  const openSettingsExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'skillsfan',
    methodId: 'skillsfan.open_settings',
    application: 'SkillsFan',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(openSettingsExecution)) {
    throw createRunError(openSettingsExecution)
  }

  const refocusExecution = await executeSmokeFlowMethod({
    steps: args.steps,
    workDir: args.workDir,
    adapterId: 'skillsfan',
    methodId: 'skillsfan.focus_main_window',
    application: 'SkillsFan',
    timeoutMs: 8_000
  })
  if (!isMethodExecutionSuccessful(refocusExecution)) {
    throw createRunError(refocusExecution)
  }

  return 'SkillsFan settings roundtrip passed.'
}

export function getDesktopSmokeFlowRunSnapshot(flowId: string): DesktopSmokeFlowExecutionResult | null {
  const value = smokeFlowRuns.get(flowId)
  return value ? cloneRun(value) : null
}

export function clearDesktopSmokeFlowRuns(): void {
  smokeFlowRuns.clear()
}

export async function runDesktopSmokeFlow(args: {
  flowId: string
  workDir?: string
}): Promise<DesktopSmokeFlowExecutionResult> {
  const descriptor = getSmokeFlowDescriptor(args.flowId)
  const existingRun = smokeFlowRuns.get(args.flowId)

  if (existingRun?.state === 'running') {
    throw new Error(`${descriptor.displayName || args.flowId} is already running.`)
  }

  const runningRun = setSmokeFlowRun({
    id: args.flowId,
    adapterId: descriptor.adapterId,
    displayName: descriptor.displayName,
    verification: descriptor.verification,
    state: 'running',
    startedAt: new Date().toISOString(),
    summary: `${descriptor.displayName || args.flowId} is running.`,
    error: null,
    steps: []
  })
  const steps: DesktopSmokeFlowExecutionStep[] = []
  const workDir = args.workDir || process.cwd()

  try {
    let summary: string

    switch (args.flowId) {
      case 'terminal.command-roundtrip':
        summary = await runTerminalCommandRoundtrip({ workDir, steps })
        break
      case 'terminal.session-targeting':
        summary = await runTerminalSessionTargeting({ workDir, steps })
        break
      case 'iterm.split-pane-roundtrip':
        summary = await runITermSplitPaneRoundtrip({ workDir, steps })
        break
      case 'chrome.tab-roundtrip':
        summary = await runChromeTabRoundtrip({ workDir, steps })
        break
      case 'chrome.discovery-roundtrip':
        summary = await runChromeDiscoveryRoundtrip({ workDir, steps })
        break
      case 'finder.navigation-roundtrip':
        summary = await runFinderNavigationRoundtrip({ workDir, steps })
        break
      case 'skillsfan.settings-roundtrip':
        summary = await runSkillsFanSettingsRoundtrip({ workDir, steps })
        break
      default:
        throw new Error(`Desktop smoke flow ${args.flowId} is not executable yet.`)
    }

    return finalizeSmokeFlowRun({
      base: runningRun,
      state: 'passed',
      summary,
      steps
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return finalizeSmokeFlowRun({
      base: runningRun,
      state: 'failed',
      summary: `${descriptor.displayName || args.flowId} failed.`,
      steps,
      error: message
    })
  }
}
