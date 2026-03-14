import type { DesktopAdapterMethodCapability, DesktopKeyModifier } from '../../types'
import { escapeAppleScriptString } from './utils'

export type TerminalApplication = 'Terminal' | 'iTerm' | 'iTerm2'
export type TerminalSplitDirection = 'horizontal' | 'vertical'

export interface TerminalSessionTarget {
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}

export const terminalAdapterMethods: DesktopAdapterMethodCapability[] = [
  {
    id: 'terminal.run_command',
    displayName: 'Run Command',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Runs a shell command in a selected Terminal or iTerm session without free-form AppleScript.'
  },
  {
    id: 'terminal.new_tab_run_command',
    displayName: 'New Tab And Run',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Opens a new terminal tab before sending a command without free-form AppleScript.'
  },
  {
    id: 'terminal.new_window_run_command',
    displayName: 'New Window And Run',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Opens a new terminal window before sending a command without free-form AppleScript.'
  },
  {
    id: 'terminal.run_command_in_directory',
    displayName: 'Run In Directory',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Runs a shell command after changing into a target directory through a structured adapter method.'
  },
  {
    id: 'terminal.list_sessions',
    displayName: 'List Sessions',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Enumerates Terminal or iTerm windows, tabs, and sessions through a structured adapter method.'
  },
  {
    id: 'terminal.list_panes',
    displayName: 'List Panes',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Enumerates panes in a selected iTerm or iTerm2 tab through a structured adapter method.'
  },
  {
    id: 'terminal.get_pane_layout',
    displayName: 'Get Pane Layout',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reads a structured iTerm pane layout snapshot, including pane sizes and a synthetic split hierarchy.'
  },
  {
    id: 'terminal.focus_session',
    displayName: 'Focus Session',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Focuses a specific Terminal or iTerm window, tab, or session through a structured adapter method.'
  },
  {
    id: 'terminal.interrupt_process',
    displayName: 'Interrupt Process',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Sends Control+C to a selected terminal session through a structured shortcut helper.'
  },
  {
    id: 'terminal.get_session_state',
    displayName: 'Get Session State',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reads active/busy/title/tty state from a selected Terminal or iTerm session through a structured adapter method.'
  },
  {
    id: 'terminal.read_output',
    displayName: 'Read Output',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reads the visible output from a selected Terminal or iTerm session through a structured adapter method.'
  },
  {
    id: 'terminal.get_last_command_result',
    displayName: 'Get Last Command Result',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reads the last structured terminal command result, including command identity and exit status markers.'
  },
  {
    id: 'terminal.wait_for_output',
    displayName: 'Wait For Output',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Polls Terminal or iTerm output until expected text appears through a structured adapter method.'
  },
  {
    id: 'terminal.wait_until_not_busy',
    displayName: 'Wait Until Not Busy',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Polls Terminal or iTerm session state until the selected session is no longer busy.'
  },
  {
    id: 'terminal.wait_until_idle',
    displayName: 'Wait Until Idle',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Polls Terminal or iTerm output until it stays unchanged for an idle window through a structured adapter method.'
  },
  {
    id: 'terminal.split_pane_run_command',
    displayName: 'Split Pane And Run',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Splits an iTerm pane horizontally or vertically, then runs a shell command in the new pane.'
  },
  {
    id: 'terminal.run_command_and_wait',
    displayName: 'Run Command And Wait',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Runs a shell command and waits for a captured exit status marker through a structured adapter method.'
  },
  {
    id: 'terminal.run_command_in_directory_and_wait',
    displayName: 'Run In Directory And Wait',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Runs a shell command in a target directory and waits for a captured exit status marker through a structured adapter method.'
  }
]

export const TERMINAL_COMMAND_START_MARKER_PREFIX = '__SKILLSFAN_COMMAND_START__='
export const TERMINAL_COMMAND_RESULT_MARKER_PREFIX = '__SKILLSFAN_COMMAND_RESULT__='
export const TERMINAL_EXIT_STATUS_MARKER_PREFIX = '__SKILLSFAN_EXIT_STATUS__='

function quoteShellSingleString(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function trimTrailingShellSeparators(command: string): string {
  return command.trim().replace(/[;\s]+$/u, '')
}

function getTargetWindowIndex(target?: TerminalSessionTarget): number | undefined {
  return Number.isInteger(target?.windowIndex) && Number(target?.windowIndex) > 0
    ? Number(target?.windowIndex)
    : undefined
}

function getTargetTabIndex(target?: TerminalSessionTarget): number | undefined {
  return Number.isInteger(target?.tabIndex) && Number(target?.tabIndex) > 0
    ? Number(target?.tabIndex)
    : undefined
}

function getTargetSessionIndex(target?: TerminalSessionTarget): number | undefined {
  return Number.isInteger(target?.sessionIndex) && Number(target?.sessionIndex) > 0
    ? Number(target?.sessionIndex)
    : undefined
}

function getTargetPaneIndex(target?: TerminalSessionTarget): number | undefined {
  return Number.isInteger(target?.paneIndex) && Number(target?.paneIndex) > 0
    ? Number(target?.paneIndex)
    : undefined
}

function buildTerminalTargetLines(args: {
  application: TerminalApplication
  target?: TerminalSessionTarget
  createWindowIfMissing?: boolean
}): string[] {
  const { application, target, createWindowIfMissing = false } = args
  const windowIndex = getTargetWindowIndex(target)
  const tabIndex = getTargetTabIndex(target)
  const sessionIndex = getTargetSessionIndex(target)
  const paneIndex = getTargetPaneIndex(target)
  const resolvedSessionIndex = paneIndex ?? sessionIndex
  const resolvedSessionLabel = paneIndex ? 'Pane' : 'Session'

  if (application === 'iTerm' || application === 'iTerm2') {
    const appleScriptApplication = application
    return [
      `tell application "${appleScriptApplication}"`,
      '  activate',
      '  delay 0.1',
      '  if (count of windows) = 0 then',
      createWindowIfMissing
        ? '    set targetWindow to (create window with default profile)'
        : '    error "iTerm2 has no open windows."',
      createWindowIfMissing ? '    delay 0.1' : '',
      '  else',
      windowIndex
        ? `    set targetWindow to first window whose index is ${windowIndex}`
        : '    set targetWindow to current window',
      '  end if',
      '  tell targetWindow',
      tabIndex
        ? `    if (count of tabs) < ${tabIndex} then`
        : '',
      tabIndex
        ? `      error "Tab not found: ${tabIndex}"`
        : '',
      tabIndex ? '    end if' : '',
      tabIndex
        ? `    set targetTab to tab ${tabIndex}`
        : '    set targetTab to current tab',
      '  end tell',
      '  tell targetTab',
      resolvedSessionIndex
        ? `    if (count of sessions) < ${resolvedSessionIndex} then`
        : '',
      resolvedSessionIndex
        ? `      error "${resolvedSessionLabel} not found: ${resolvedSessionIndex}"`
        : '',
      resolvedSessionIndex ? '    end if' : '',
      resolvedSessionIndex
        ? `    set targetSession to session ${resolvedSessionIndex}`
        : '    set targetSession to current session',
      '  end tell'
    ].filter(Boolean)
  }

  return [
    'tell application "Terminal"',
    '  activate',
    '  if (count of windows) = 0 then',
    createWindowIfMissing
      ? '    do script ""'
      : '    error "Terminal has no open windows."',
    '  end if',
    windowIndex
      ? `  set targetWindow to first window whose index is ${windowIndex}`
      : '  set targetWindow to front window',
    tabIndex
      ? `  if (count of tabs of targetWindow) < ${tabIndex} then`
      : '',
    tabIndex
      ? `    error "Tab not found: ${tabIndex}"`
      : '',
    tabIndex ? '  end if' : '',
    tabIndex
      ? `  set targetTab to tab ${tabIndex} of targetWindow`
      : '  set targetTab to selected tab of targetWindow'
  ].filter(Boolean)
}

export function buildTerminalCommandWithExitStatusMarker(
  command: string,
  commandId?: string
): string {
  const normalizedCommand = trimTrailingShellSeparators(command)
  const normalizedCommandId = commandId?.trim()

  if (normalizedCommandId) {
    const quotedCommandId = quoteShellSingleString(normalizedCommandId)
    return [
      `printf '\\n${TERMINAL_COMMAND_START_MARKER_PREFIX}%s\\n' ${quotedCommandId}`,
      `{ ${normalizedCommand}; }`,
      '__skillsfan_exit_code=$?',
      `printf '${TERMINAL_COMMAND_RESULT_MARKER_PREFIX}%s\\t%s\\n' ${quotedCommandId} "$__skillsfan_exit_code"`,
      `printf '${TERMINAL_EXIT_STATUS_MARKER_PREFIX}%s\\n' "$__skillsfan_exit_code"`
    ].join('; ')
  }

  return normalizedCommand
}

export function buildITermProbeScript(
  application: Extract<TerminalApplication, 'iTerm' | 'iTerm2'>
): string {
  const appleScriptApplication = application

  return [
    `tell application "${appleScriptApplication}"`,
    '  if (count of windows) = 0 then',
    '    return "no_windows"',
    '  end if',
    '  set targetWindow to current window',
    '  tell targetWindow',
    '    set targetTab to current tab',
    '  end tell',
    '  tell targetTab',
    '    set targetSession to current session',
    '  end tell',
    '  return "ok"',
    'end tell'
  ].join('\n')
}

export function buildTerminalRunCommandScript(
  command: string,
  application: TerminalApplication = 'Terminal',
  target?: TerminalSessionTarget,
  commandId?: string
): string {
  const escapedCommand = escapeAppleScriptString(buildTerminalCommandWithExitStatusMarker(command, commandId))
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: true
  })

  if (application === 'iTerm' || application === 'iTerm2') {
    return [
      ...lines,
      `  tell targetSession to write text "${escapedCommand}"`,
      'end tell'
    ].join('\n')
  }

  return [
    ...lines,
    `  do script "${escapedCommand}" in targetTab`,
    'end tell'
  ].join('\n')
}

export function buildTerminalNewTabRunCommandScript(
  command: string,
  application: TerminalApplication = 'Terminal',
  commandId?: string
): string {
  const escapedCommand = escapeAppleScriptString(buildTerminalCommandWithExitStatusMarker(command, commandId))

  if (application === 'iTerm' || application === 'iTerm2') {
    const appleScriptApplication = application
    return [
      `tell application "${appleScriptApplication}"`,
      '  activate',
      '  if (count of windows) = 0 then',
      '    create window with default profile',
      '  else',
      '    tell current window',
      '      create tab with default profile',
      '    end tell',
      '  end if',
      `  tell current session of current tab of current window to write text "${escapedCommand}"`,
      'end tell'
    ].join('\n')
  }

  return [
    'tell application "Terminal"',
    '  activate',
    '  if (count of windows) = 0 then',
    `    do script "${escapedCommand}"`,
    '  else',
    '    tell application "System Events"',
    '      keystroke "t" using command down',
    '    end tell',
    '    delay 0.2',
    `    do script "${escapedCommand}" in front window`,
    '  end if',
    'end tell'
  ].join('\n')
}

export function buildTerminalNewWindowRunCommandScript(
  command: string,
  application: TerminalApplication = 'Terminal',
  commandId?: string
): string {
  const escapedCommand = escapeAppleScriptString(buildTerminalCommandWithExitStatusMarker(command, commandId))

  if (application === 'iTerm' || application === 'iTerm2') {
    const appleScriptApplication = application
    return [
      `tell application "${appleScriptApplication}"`,
      '  activate',
      '  create window with default profile',
      `  tell current session of current window to write text "${escapedCommand}"`,
      'end tell'
    ].join('\n')
  }

  return [
    'tell application "Terminal"',
    '  activate',
    '  if (count of windows) = 0 then',
    `    do script "${escapedCommand}"`,
    '  else',
    '    tell application "System Events"',
    '      keystroke "n" using command down',
    '    end tell',
    '    delay 0.2',
    `    do script "${escapedCommand}" in front window`,
    '  end if',
    'end tell'
  ].join('\n')
}

export function buildTerminalRunCommandInDirectoryScript(
  command: string,
  directory: string,
  application: TerminalApplication = 'Terminal',
  target?: TerminalSessionTarget,
  commandId?: string
): string {
  const combinedCommand = `cd ${quoteShellSingleString(directory.trim())} && ${trimTrailingShellSeparators(command)}`
  return buildTerminalRunCommandScript(combinedCommand, application, target, commandId)
}

export function buildTerminalInterruptShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: 'c',
    modifiers: ['control']
  }
}

export function buildTerminalListSessionsScript(
  application: TerminalApplication = 'Terminal'
): string {
  if (application === 'iTerm' || application === 'iTerm2') {
    const appleScriptApplication = application
    return [
      `tell application "${appleScriptApplication}"`,
      '  activate',
      '  if (count of windows) = 0 then',
      '    error "iTerm2 has no open windows."',
      '  end if',
      '  set outputLines to {}',
      '  repeat with w in windows',
      '    set windowIndex to index of w',
      '    repeat with t in tabs of w',
      '      set tabIndex to index of t',
      '      repeat with s in sessions of t',
      '        set sessionIndex to index of s',
      '        set sessionTitle to ""',
      '        try',
      '          set sessionTitle to name of s',
      '        end try',
      '        set ttyValue to ""',
      '        try',
      '          set ttyValue to tty of s',
      '        end try',
      '        set busyValue to false',
      '        try',
      '          set busyValue to is processing of s',
      '        end try',
      '        set activeValue to (s is current session of t)',
      '        set end of outputLines to (windowIndex as string) & tab & (tabIndex as string) & tab & (sessionIndex as string) & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
      '      end repeat',
      '    end repeat',
      '  end repeat',
      '  set AppleScript\'s text item delimiters to linefeed',
      '  set outputText to outputLines as text',
      '  set AppleScript\'s text item delimiters to ""',
      '  return outputText',
      'end tell'
    ].join('\n')
  }

  return [
    'tell application "Terminal"',
    '  activate',
    '  if (count of windows) = 0 then',
    '    error "Terminal has no open windows."',
    '  end if',
    '  set outputLines to {}',
    '  repeat with w in windows',
    '    set windowIndex to index of w',
    '    set selectedTabRef to selected tab of w',
    '    repeat with t in tabs of w',
    '      set tabIndex to index of t',
    '      set sessionTitle to ""',
    '      try',
    '        set sessionTitle to custom title of t',
    '      end try',
    '      set ttyValue to ""',
    '      try',
    '        set ttyValue to tty of t',
    '      end try',
    '      set busyValue to false',
    '      try',
    '        set busyValue to busy of t',
    '      end try',
    '      set activeValue to (t is selectedTabRef)',
    '      set end of outputLines to (windowIndex as string) & tab & (tabIndex as string) & tab & "1" & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
    '    end repeat',
    '  end repeat',
    '  set AppleScript\'s text item delimiters to linefeed',
    '  set outputText to outputLines as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return outputText',
    'end tell'
  ].join('\n')
}

export function buildTerminalListPanesScript(
  application: TerminalApplication = 'iTerm2',
  target?: TerminalSessionTarget
): string {
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: false
  })

  return [
    ...lines,
    '  set outputLines to {}',
    '  repeat with s in sessions of targetTab',
    '    set sessionIndex to index of s',
    '    set sessionTitle to ""',
    '    try',
    '      set sessionTitle to name of s',
    '    end try',
    '    set ttyValue to ""',
    '    try',
    '      set ttyValue to tty of s',
    '    end try',
    '    set busyValue to false',
    '    try',
    '      set busyValue to is processing of s',
    '    end try',
    '    set activeValue to (s is current session of targetTab)',
    '    set end of outputLines to (index of targetWindow as string) & tab & (index of targetTab as string) & tab & (sessionIndex as string) & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
    '  end repeat',
    '  set AppleScript\'s text item delimiters to linefeed',
    '  set outputText to outputLines as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return outputText',
    'end tell'
  ].join('\n')
}

export function buildTerminalGetPaneLayoutScript(
  application: TerminalApplication = 'iTerm2',
  target?: TerminalSessionTarget
): string {
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: false
  })

  return [
    ...lines,
    '  set outputLines to {}',
    '  repeat with s in sessions of targetTab',
    '    set sessionIndex to index of s',
    '    set sessionTitle to ""',
    '    try',
    '      set sessionTitle to name of s',
    '    end try',
    '    set ttyValue to ""',
    '    try',
    '      set ttyValue to tty of s',
    '    end try',
    '    set busyValue to false',
    '    try',
    '      set busyValue to is processing of s',
    '    end try',
    '    set activeValue to (s is current session of targetTab)',
    '    set columnsValue to 0',
    '    try',
    '      set columnsValue to columns of s',
    '    end try',
    '    set rowsValue to 0',
    '    try',
    '      set rowsValue to rows of s',
    '    end try',
    '    set end of outputLines to "__PANE__" & tab & (index of targetWindow as string) & tab & (index of targetTab as string) & tab & (sessionIndex as string) & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue & tab & (columnsValue as string) & tab & (rowsValue as string)',
    '  end repeat',
    '  set AppleScript\'s text item delimiters to linefeed',
    '  set outputText to outputLines as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return outputText',
    'end tell'
  ].join('\n')
}

export function buildTerminalFocusSessionScript(
  application: TerminalApplication = 'Terminal',
  target?: TerminalSessionTarget
): string {
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: false
  })

  if (application === 'iTerm' || application === 'iTerm2') {
    return [
      ...lines,
      '  set current window to targetWindow',
      '  select targetTab',
      '  tell targetSession to select',
      'end tell'
    ].join('\n')
  }

  return [
    ...lines,
    '  set front window to targetWindow',
    '  set selected tab of targetWindow to targetTab',
    'end tell'
  ].join('\n')
}

export function buildTerminalSplitPaneRunCommandScript(
  command: string,
  direction: TerminalSplitDirection = 'vertical',
  application: TerminalApplication = 'iTerm2',
  target?: TerminalSessionTarget,
  commandId?: string
): string {
  const escapedCommand = escapeAppleScriptString(buildTerminalCommandWithExitStatusMarker(command, commandId))
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: true
  })
  const splitCommand = direction === 'horizontal'
    ? 'split horizontally with default profile'
    : 'split vertically with default profile'

  return [
    ...lines,
    `  tell targetSession to set newSession to (${splitCommand})`,
    '  delay 0.2',
    `  tell newSession to write text "${escapedCommand}"`,
    '  set sessionTitle to ""',
    '  try',
    '    set sessionTitle to name of newSession',
    '  end try',
    '  set ttyValue to ""',
    '  try',
    '    set ttyValue to tty of newSession',
    '  end try',
    '  set busyValue to false',
    '  try',
    '    set busyValue to is processing of newSession',
    '  end try',
    '  set activeValue to (newSession is current session of targetTab)',
    '  return (index of targetWindow as string) & tab & (index of targetTab as string) & tab & (index of newSession as string) & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
    'end tell'
  ].join('\n')
}

export function buildTerminalReadOutputScript(
  application: TerminalApplication = 'Terminal',
  target?: TerminalSessionTarget
): string {
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: false
  })

  if (application === 'iTerm' || application === 'iTerm2') {
    return [
      ...lines,
      '  return contents of targetSession',
      'end tell'
    ].join('\n')
  }

  return [
    ...lines,
    '  return contents of targetTab',
    'end tell'
  ].join('\n')
}

export function buildTerminalGetSessionStateScript(
  application: TerminalApplication = 'Terminal',
  target?: TerminalSessionTarget
): string {
  const lines = buildTerminalTargetLines({
    application,
    target,
    createWindowIfMissing: false
  })

  if (application === 'iTerm' || application === 'iTerm2') {
    return [
      ...lines,
      '  set sessionTitle to ""',
      '  try',
      '    set sessionTitle to name of targetSession',
      '  end try',
      '  set ttyValue to ""',
      '  try',
      '    set ttyValue to tty of targetSession',
      '  end try',
      '  set busyValue to false',
      '  try',
      '    set busyValue to is processing of targetSession',
      '  end try',
      '  set activeValue to (targetSession is current session of targetTab)',
      '  return (index of targetWindow as string) & tab & (index of targetTab as string) & tab & (index of targetSession as string) & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
      'end tell'
    ].join('\n')
  }

  return [
    ...lines,
    '  set sessionTitle to ""',
    '  try',
    '    set sessionTitle to custom title of targetTab',
    '  end try',
    '  set ttyValue to ""',
    '  try',
    '    set ttyValue to tty of targetTab',
    '  end try',
    '  set busyValue to false',
    '  try',
    '    set busyValue to busy of targetTab',
    '  end try',
    '  set activeValue to (targetTab is selected tab of targetWindow)',
    '  return (index of targetWindow as string) & tab & (index of targetTab as string) & tab & "1" & tab & (activeValue as string) & tab & (busyValue as string) & tab & sessionTitle & tab & ttyValue',
    'end tell'
  ].join('\n')
}
