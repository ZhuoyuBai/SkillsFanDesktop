import type {
  DesktopAdapterCapability,
  DesktopAdapterSmokeFlowCapability,
  DesktopAdapterWorkflowCapability,
  DesktopHostAction
} from '../../types'
import { chromeAdapterMethods } from './chrome'
import { finderAdapterMethods } from './finder'
import { skillsfanAdapterMethods } from './skillsfan'
import { terminalAdapterMethods } from './terminal'

export interface DesktopAppAdapterDescriptor extends DesktopAdapterCapability {
  displayName: string
  stage: 'active' | 'planned'
  applicationNames: string[]
  actions: DesktopHostAction[]
}

const ALL_DESKTOP_ACTIONS: DesktopHostAction[] = [
  'open_application',
  'run_applescript',
  'activate_application',
  'press_key',
  'type_text',
  'click',
  'move_mouse',
  'scroll',
  'list_windows',
  'focus_window'
]

const PLANNED_APP_ACTIONS: DesktopHostAction[] = [
  'open_application',
  'run_applescript',
  'activate_application',
  'press_key',
  'type_text',
  'click',
  'scroll',
  'list_windows',
  'focus_window'
]

const TERMINAL_PRODUCT_WORKFLOWS: DesktopAdapterWorkflowCapability[] = [
  {
    id: 'terminal.session-control',
    displayName: 'Session Control',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.list_sessions',
      'terminal.focus_session',
      'terminal.get_session_state',
      'terminal.read_output',
      'terminal.get_last_command_result'
    ],
    notes: 'Stable session inspection and targeting workflows across Terminal, iTerm, and iTerm2.'
  },
  {
    id: 'terminal.run-and-verify',
    displayName: 'Run And Verify',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.run_command',
      'terminal.run_command_in_directory',
      'terminal.run_command_and_wait',
      'terminal.run_command_in_directory_and_wait',
      'terminal.wait_for_output',
      'terminal.wait_until_not_busy',
      'terminal.wait_until_idle',
      'terminal.interrupt_process'
    ],
    notes: 'Runs terminal commands, waits for completion, and surfaces exit status plus recovery hints.'
  },
  {
    id: 'iterm.pane-ops',
    displayName: 'iTerm Pane Ops',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.list_panes',
      'terminal.get_pane_layout',
      'terminal.split_pane_run_command'
    ],
    notes: 'Structured pane discovery, split-pane execution, and pane-layout inspection for iTerm and iTerm2.'
  }
]

const CHROME_PRODUCT_WORKFLOWS: DesktopAdapterWorkflowCapability[] = [
  {
    id: 'chrome.tab-navigation',
    displayName: 'Tab Navigation',
    supported: true,
    stage: 'active',
    methodIds: [
      'chrome.open_url',
      'chrome.open_url_in_new_tab',
      'chrome.new_tab',
      'chrome.focus_tab_by_title',
      'chrome.focus_tab_by_url',
      'chrome.get_active_tab',
      'chrome.wait_for_active_tab'
    ],
    notes: 'Stable Chrome tab opening, focusing, and active-tab confirmation workflows.'
  },
  {
    id: 'chrome.tab-observe',
    displayName: 'Tab Observe',
    supported: true,
    stage: 'active',
    methodIds: [
      'chrome.list_tabs',
      'chrome.find_tabs',
      'chrome.wait_for_tab',
      'chrome.get_active_tab'
    ],
    notes: 'Structured Chrome tab discovery and matching by title, URL, and domain.'
  },
  {
    id: 'chrome.tab-cleanup',
    displayName: 'Tab Cleanup',
    supported: true,
    stage: 'active',
    methodIds: [
      'chrome.reload_active_tab',
      'chrome.close_active_tab',
      'chrome.close_tabs'
    ],
    notes: 'Stable reload and close flows for active or matched Chrome tabs.'
  }
]

const TERMINAL_SMOKE_FLOWS: DesktopAdapterSmokeFlowCapability[] = [
  {
    id: 'terminal.command-roundtrip',
    displayName: 'Command Roundtrip',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.run_command_and_wait',
      'terminal.get_last_command_result',
      'terminal.read_output'
    ],
    verification: 'Run a short command, confirm completionState is completed, and verify the latest command result matches the captured output.',
    notes: 'Validates the core run-command, wait, and result-reading loop in Terminal or iTerm.'
  },
  {
    id: 'terminal.session-targeting',
    displayName: 'Session Targeting',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.list_sessions',
      'terminal.focus_session',
      'terminal.get_session_state'
    ],
    verification: 'List sessions, focus a non-default target, then verify the active session metadata updates as expected.',
    notes: 'Validates window/tab/session targeting before multi-session automation runs.'
  },
  {
    id: 'iterm.split-pane-roundtrip',
    displayName: 'iTerm Split Pane Roundtrip',
    supported: true,
    stage: 'active',
    methodIds: [
      'terminal.list_panes',
      'terminal.split_pane_run_command',
      'terminal.get_pane_layout'
    ],
    verification: 'Create a new iTerm pane, run a short command in it, then confirm pane enumeration and layout snapshot both reflect the split.',
    notes: 'Validates pane creation plus pane-layout observation for iTerm and iTerm2.'
  }
]

const CHROME_SMOKE_FLOWS: DesktopAdapterSmokeFlowCapability[] = [
  {
    id: 'chrome.tab-roundtrip',
    displayName: 'Tab Roundtrip',
    supported: true,
    stage: 'active',
    methodIds: [
      'chrome.open_url_in_new_tab',
      'chrome.wait_for_tab',
      'chrome.get_active_tab',
      'chrome.close_tabs'
    ],
    verification: 'Open a test page in a new tab, wait for the tab match, confirm the active tab metadata, then close the tab cleanly.',
    notes: 'Validates the core open, wait, inspect, and close loop for Chrome tab automation.'
  },
  {
    id: 'chrome.discovery-roundtrip',
    displayName: 'Discovery Roundtrip',
    supported: true,
    stage: 'active',
    methodIds: [
      'chrome.open_url_in_new_tab',
      'chrome.list_tabs',
      'chrome.find_tabs',
      'chrome.focus_tab_by_url',
      'chrome.get_active_tab',
      'chrome.close_tabs'
    ],
    verification: 'Open a temporary tab, enumerate tabs, filter by URL, focus the match, confirm it becomes active, then close the temporary tab.',
    notes: 'Validates tab listing, filtering, precise focus by URL, and cleanup for a self-contained Chrome discovery loop.'
  }
]

export function listDesktopAppAdapters(platform: NodeJS.Platform): DesktopAppAdapterDescriptor[] {
  const isMacOS = platform === 'darwin'
  const unsupportedNote = 'Desktop automation is only available on macOS.'

  return [
    {
      id: 'generic-macos',
      displayName: 'Generic macOS Automation',
      supported: isMacOS,
      stage: 'active',
      applicationNames: [],
      actions: ALL_DESKTOP_ACTIONS,
      methods: [],
      notes: isMacOS
        ? 'Current desktop actions run through generic AppleScript and CoreGraphics automation.'
        : unsupportedNote
    },
    {
      id: 'finder',
      displayName: 'Finder Adapter',
      supported: false,
      stage: 'planned',
      applicationNames: ['Finder'],
      actions: PLANNED_APP_ACTIONS,
      methods: finderAdapterMethods,
      notes: isMacOS
        ? 'Planned app-specific adapter for Finder workflows in M5.'
        : unsupportedNote
    },
    {
      id: 'terminal',
      displayName: 'Terminal Adapter',
      supported: isMacOS,
      stage: 'active',
      applicationNames: ['Terminal', 'iTerm', 'iTerm2'],
      actions: PLANNED_APP_ACTIONS,
      methods: terminalAdapterMethods,
      workflows: isMacOS ? TERMINAL_PRODUCT_WORKFLOWS : [],
      smokeFlows: isMacOS ? TERMINAL_SMOKE_FLOWS : [],
      notes: isMacOS
        ? 'M5-ready adapter for Terminal, iTerm, and iTerm2 command execution, observation, and pane workflows.'
        : unsupportedNote
    },
    {
      id: 'chrome',
      displayName: 'Chrome Adapter',
      supported: isMacOS,
      stage: 'active',
      applicationNames: ['Google Chrome', 'Chrome', 'Chromium'],
      actions: PLANNED_APP_ACTIONS,
      methods: chromeAdapterMethods,
      workflows: isMacOS ? CHROME_PRODUCT_WORKFLOWS : [],
      smokeFlows: isMacOS ? CHROME_SMOKE_FLOWS : [],
      notes: isMacOS
        ? 'M5-ready adapter for structured Chrome tab navigation, observation, and cleanup workflows.'
        : unsupportedNote
    },
    {
      id: 'skillsfan',
      displayName: 'SkillsFan Adapter',
      supported: false,
      stage: 'planned',
      applicationNames: ['SkillsFan'],
      actions: PLANNED_APP_ACTIONS,
      methods: skillsfanAdapterMethods,
      notes: isMacOS
        ? 'Planned app-specific adapter for first-party app workflows in M5.'
        : unsupportedNote
    }
  ]
}

export function resolveDesktopAppAdapter(
  application: string | undefined,
  platform: NodeJS.Platform
): DesktopAppAdapterDescriptor {
  const normalizedApplication = application?.trim().toLowerCase()
  const descriptors = listDesktopAppAdapters(platform)

  if (!normalizedApplication) {
    return descriptors[0]
  }

  return descriptors.find((descriptor) =>
    descriptor.applicationNames.some((candidate) => candidate.trim().toLowerCase() === normalizedApplication)
  ) ?? descriptors[0]
}
