export type SharedToolPermissionPolicyKind =
  | 'allow'
  | 'sanitize-web-search'
  | 'workspace-paths'
  | 'system-browser-only'
  | 'command-approval'

export interface SharedToolPermissionPolicy {
  kind: SharedToolPermissionPolicyKind
  getApprovalDescription?: (input: Record<string, unknown>) => string
}

const ALLOW_TOOLS = new Set([
  'mcp__web-tools__WebFetch',
  'mcp__local-tools__memory',
  'mcp__local-tools__tool_search_tool_regex',
  'mcp__local-tools__tool_search_tool_bm25',
  'mcp__local-tools__subagents'
])

const COMMAND_APPROVAL_POLICIES: Record<string, (input: Record<string, unknown>) => string> = {
  'mcp__local-tools__bash_code_execution': (input) =>
    `Execute command: ${typeof input.command === 'string' ? input.command : 'shell command'}`,
  'mcp__local-tools__code_execution': (input) =>
    `Execute ${typeof input.language === 'string' ? input.language : 'code'} snippet`,
  'mcp__local-tools__open_application': (input) =>
    `Open macOS application: ${typeof input.application === 'string' ? input.application : 'application'}`,
  'mcp__local-tools__run_applescript': () => 'Execute AppleScript for macOS UI automation',
  'mcp__local-tools__terminal_run_command': (input) =>
    `Run terminal command: ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__chrome_focus_tab': (input) =>
    `Focus Chrome tab: ${typeof input.title === 'string' ? input.title : 'tab title'}`,
  'mcp__local-tools__chrome_open_url': (input) =>
    `Open Chrome URL: ${typeof input.url === 'string' ? input.url : 'URL'}`,
  'mcp__local-tools__finder_open_folder': (input) =>
    `Open Finder folder: ${typeof input.target === 'string' ? input.target : 'folder'}`,
  'mcp__local-tools__finder_reveal_path': (input) =>
    `Reveal in Finder: ${typeof input.target === 'string' ? input.target : 'path'}`,
  'mcp__local-tools__finder_open_home_folder': () => 'Open Finder home folder',
  'mcp__local-tools__finder_new_window': () => 'Open new Finder window',
  'mcp__local-tools__finder_search': (input) =>
    `Search in Finder: ${typeof input.query === 'string' ? input.query : 'search query'}`,
  'mcp__local-tools__terminal_new_tab_run_command': (input) =>
    `Run terminal command in new tab: ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__terminal_new_window_run_command': (input) =>
    `Run terminal command in new window: ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__terminal_run_command_in_directory': (input) =>
    `Run terminal command in directory: ${typeof input.directory === 'string' ? input.directory : 'directory'} → ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__terminal_list_sessions': () => 'List terminal sessions',
  'mcp__local-tools__terminal_list_panes': (input) => buildWindowTabScopedDescription(input, 'List terminal panes'),
  'mcp__local-tools__terminal_get_pane_layout': (input) =>
    buildWindowTabScopedDescription(input, 'Read terminal pane layout'),
  'mcp__local-tools__terminal_focus_session': (input) =>
    `Focus terminal target: ${getTerminalFocusScope(input)}`,
  'mcp__local-tools__terminal_interrupt_process': (input) =>
    buildTerminalTargetDescription(input, 'Interrupt terminal process'),
  'mcp__local-tools__terminal_get_session_state': (input) =>
    buildTerminalTargetDescription(input, 'Read terminal session state'),
  'mcp__local-tools__terminal_get_last_command_result': (input) =>
    buildTerminalTargetDescription(input, 'Read terminal last command result'),
  'mcp__local-tools__terminal_read_output': () => 'Read terminal output',
  'mcp__local-tools__terminal_wait_for_output': (input) =>
    `Wait for terminal output: ${typeof input.expectedText === 'string' ? input.expectedText : 'expected output'}`,
  'mcp__local-tools__terminal_wait_until_not_busy': (input) =>
    buildTerminalTargetDescription(input, 'Wait for terminal session to become idle'),
  'mcp__local-tools__terminal_wait_until_idle': () => 'Wait for terminal idle state',
  'mcp__local-tools__terminal_split_pane_run_command': (input) =>
    `Split terminal pane (${input.direction === 'horizontal' ? 'horizontal' : 'vertical'}) and run: ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__terminal_run_command_and_wait': (input) =>
    `Run terminal command and wait: ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__terminal_run_command_in_directory_and_wait': (input) =>
    `Run terminal command in directory and wait: ${typeof input.directory === 'string' ? input.directory : 'directory'} → ${typeof input.command === 'string' ? input.command : 'terminal command'}`,
  'mcp__local-tools__chrome_new_tab': () => 'Open new Chrome tab',
  'mcp__local-tools__chrome_open_url_in_new_tab': (input) =>
    `Open Chrome URL in new tab: ${typeof input.url === 'string' ? input.url : 'URL'}`,
  'mcp__local-tools__chrome_reload_active_tab': () => 'Reload active Chrome tab',
  'mcp__local-tools__chrome_focus_tab_by_url': (input) =>
    `Focus Chrome tab by URL: ${typeof input.url === 'string' ? input.url : 'URL'}`,
  'mcp__local-tools__chrome_list_tabs': () => 'List Chrome tabs',
  'mcp__local-tools__chrome_find_tabs': (input) =>
    `Find Chrome tabs: ${typeof input.query === 'string' ? input.query : 'tab query'}`,
  'mcp__local-tools__chrome_close_tabs': (input) =>
    `Close Chrome tabs: ${typeof input.query === 'string' ? input.query : 'tab query'}`,
  'mcp__local-tools__chrome_get_active_tab': () => 'Read active Chrome tab',
  'mcp__local-tools__chrome_wait_for_tab': (input) =>
    `Wait for Chrome tab: ${typeof input.query === 'string' ? input.query : 'tab query'}`,
  'mcp__local-tools__chrome_wait_for_active_tab': (input) =>
    `Wait for active Chrome tab: ${typeof input.query === 'string' ? input.query : 'active tab query'}`,
  'mcp__local-tools__chrome_close_active_tab': () => 'Close active Chrome tab',
  'mcp__local-tools__skillsfan_open_settings': () => 'Open SkillsFan settings',
  'mcp__local-tools__skillsfan_focus_main_window': () => 'Focus SkillsFan main window'
}

export function getSharedToolPermissionPolicy(toolName: string): SharedToolPermissionPolicy | null {
  if (toolName === 'mcp__web-tools__WebSearch') {
    return { kind: 'sanitize-web-search' }
  }

  if (toolName === 'mcp__local-tools__text_editor_code_execution') {
    return { kind: 'workspace-paths' }
  }

  if (toolName === 'mcp__local-tools__open_url') {
    return { kind: 'system-browser-only' }
  }

  if (ALLOW_TOOLS.has(toolName)) {
    return { kind: 'allow' }
  }

  const getApprovalDescription = COMMAND_APPROVAL_POLICIES[toolName]
  if (getApprovalDescription) {
    return {
      kind: 'command-approval',
      getApprovalDescription
    }
  }

  return null
}

export function buildSharedToolApprovalDescription(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  const getApprovalDescription = COMMAND_APPROVAL_POLICIES[toolName]
  return getApprovalDescription ? getApprovalDescription(input) : null
}

function buildWindowTabScopedDescription(
  input: Record<string, unknown>,
  action: string
): string {
  const targetParts = [
    typeof input.windowIndex === 'number' ? `window ${input.windowIndex}` : null,
    typeof input.tabIndex === 'number' ? `tab ${input.tabIndex}` : null
  ].filter(Boolean)

  return targetParts.length > 0
    ? `${action}: ${targetParts.join(', ')}`
    : action
}

function buildTerminalTargetDescription(
  input: Record<string, unknown>,
  action: string
): string {
  const targetParts = [
    typeof input.windowIndex === 'number' ? `window ${input.windowIndex}` : null,
    typeof input.tabIndex === 'number' ? `tab ${input.tabIndex}` : null,
    typeof input.sessionIndex === 'number' ? `session ${input.sessionIndex}` : null,
    typeof input.paneIndex === 'number' ? `pane ${input.paneIndex}` : null
  ].filter(Boolean)

  return targetParts.length > 0
    ? `${action}: ${targetParts.join(', ')}`
    : action
}

function getTerminalFocusScope(input: Record<string, unknown>): string {
  const windowIndex = typeof input.windowIndex === 'number' ? `window ${input.windowIndex}` : 'current window'
  const tabIndex = typeof input.tabIndex === 'number' ? `tab ${input.tabIndex}` : 'current tab'
  const paneIndex = typeof input.paneIndex === 'number' ? `pane ${input.paneIndex}` : null
  const sessionIndex = paneIndex
    ? null
    : (typeof input.sessionIndex === 'number' ? `session ${input.sessionIndex}` : 'current session')

  return [windowIndex, tabIndex, sessionIndex, paneIndex].filter(Boolean).join(', ')
}
