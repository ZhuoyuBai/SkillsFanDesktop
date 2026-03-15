import type { ToolCatalogEntry } from './types'
import { SHARED_BUILT_IN_TOOL_CATALOG } from './built-ins'

const BASE_MCP_TOOLS: ToolCatalogEntry[] = [
  {
    name: 'mcp__local-tools__memory',
    description: 'Search cross-conversation memory and read or update project MEMORY.md through the local platform memory system.',
    source: 'mcp',
    server: 'local-tools',
    category: 'memory'
  },
  {
    name: 'mcp__local-tools__code_execution',
    description: 'Run a local code snippet (JavaScript, Python, Bash, or Shell) inside the current workspace.',
    source: 'mcp',
    server: 'local-tools',
    category: 'shell'
  },
  {
    name: 'mcp__local-tools__bash_code_execution',
    description: 'Run a local shell command as a hosted-tool replacement for bash code execution.',
    source: 'mcp',
    server: 'local-tools',
    category: 'shell'
  },
  {
    name: 'mcp__local-tools__text_editor_code_execution',
    description: 'View or edit workspace files through a local text-editor style tool interface.',
    source: 'mcp',
    server: 'local-tools',
    category: 'files'
  },
  {
    name: 'mcp__local-tools__tool_search_tool_regex',
    description: 'Search the local tool catalog using a regex pattern.',
    source: 'mcp',
    server: 'local-tools',
    category: 'meta'
  },
  {
    name: 'mcp__local-tools__tool_search_tool_bm25',
    description: 'Search the local tool catalog using keyword relevance ranking.',
    source: 'mcp',
    server: 'local-tools',
    category: 'meta'
  },
  {
    name: 'mcp__local-tools__open_url',
    description: 'Open a URL in the user\'s default system browser.',
    source: 'mcp',
    server: 'local-tools',
    category: 'web'
  },
  {
    name: 'mcp__local-tools__open_application',
    description: 'Open a real macOS application, optionally with a URL or file target, such as Google Chrome. Do not use this just to prepare Terminal, iTerm, Finder, or Chrome before another structured app tool; those tools already open or reuse the app when needed.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__activate_application',
    description: 'Bring an existing macOS application to the front before sending keyboard input.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__run_applescript',
    description: 'Run AppleScript on macOS for system-level UI automation after the user grants Accessibility permissions.',
    source: 'mcp',
    server: 'local-tools',
    category: 'shell'
  },
  {
    name: 'mcp__local-tools__desktop_press_key',
    description: 'Press a key or shortcut in the focused macOS application.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_type_text',
    description: 'Type text into the focused macOS application.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_click',
    description: 'Click at a specific screen coordinate on macOS.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_move_mouse',
    description: 'Move the mouse cursor to a specific screen coordinate on macOS.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_scroll',
    description: 'Scroll at a specific screen coordinate on macOS.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_list_windows',
    description: 'List open macOS windows with names, positions, sizes, and minimized state.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__desktop_focus_window',
    description: 'Focus a specific macOS application window.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__finder_reveal_path',
    description: 'Reveal a file or folder in Finder through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__finder_open_folder',
    description: 'Open a folder directly in Finder through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__finder_open_home_folder',
    description: 'Open the current user home folder in Finder through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__finder_new_window',
    description: 'Open a new Finder window through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__finder_search',
    description: 'Search local files from a Finder-oriented directory scope through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_new_tab_run_command',
    description: 'Open a new Terminal or iTerm tab, then run a shell command through a structured macOS desktop adapter. Use this only when the user explicitly wants a separate new tab.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_new_window_run_command',
    description: 'Open a new Terminal or iTerm window, then run a shell command through a structured macOS desktop adapter. Use this only when the user explicitly wants a separate new window.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_run_command_in_directory',
    description: 'Run a shell command in Terminal or iTerm after changing into a target directory through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_list_sessions',
    description: 'List Terminal or iTerm windows, tabs, sessions, and iTerm pane targets through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_list_panes',
    description: 'List panes inside a selected iTerm or iTerm2 tab through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_get_pane_layout',
    description: 'Read a structured iTerm or iTerm2 pane layout snapshot, including pane sizes and a split-hierarchy view, through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_focus_session',
    description: 'Focus a specific Terminal or iTerm window, tab, session, or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_interrupt_process',
    description: 'Send Control+C to the active Terminal or iTerm session or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_get_session_state',
    description: 'Read active, busy, title, and tty state for a selected Terminal or iTerm session or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_get_last_command_result',
    description: 'Read the last structured command result, including command identity and exit status, from a selected Terminal or iTerm session or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_read_output',
    description: 'Read the visible output from the active Terminal or iTerm session or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_wait_until_not_busy',
    description: 'Wait until a selected Terminal or iTerm session or iTerm pane is no longer busy through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_wait_for_output',
    description: 'Wait until expected text appears in the active Terminal or iTerm session or iTerm pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_wait_until_idle',
    description: 'Wait until Terminal or iTerm output stays unchanged for an idle window through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_split_pane_run_command',
    description: 'Split an iTerm or iTerm2 pane horizontally or vertically, then run a shell command in the new pane through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_run_command_and_wait',
    description: 'Run a shell command in Terminal or iTerm and wait until it reports a structured exit status marker through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_run_command_in_directory_and_wait',
    description: 'Run a shell command in Terminal or iTerm after changing into a target directory and wait until it reports a structured exit status marker through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__terminal_run_command',
    description: 'Run a shell command in Terminal or iTerm through a structured macOS desktop adapter. This already opens Terminal or iTerm when needed, so do not open the app first.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_open_url',
    description: 'Open an http or https URL in Google Chrome through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_open_url_in_new_tab',
    description: 'Open an http or https URL in a new Google Chrome tab through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_focus_tab',
    description: 'Focus a Google Chrome tab by partial title through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_focus_tab_by_url',
    description: 'Focus a Google Chrome tab by partial URL through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_list_tabs',
    description: 'List open Google Chrome tabs with window indices, titles, URLs, and active state through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_find_tabs',
    description: 'Find matching Google Chrome tabs by title, URL, or domain through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_close_tabs',
    description: 'Find and close matching Google Chrome tabs by title, URL, or domain through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_get_active_tab',
    description: 'Read the active Google Chrome tab title and URL through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_wait_for_tab',
    description: 'Wait until a Google Chrome tab matching a title, URL, or domain query appears through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_wait_for_active_tab',
    description: 'Wait until the active Google Chrome tab matches a title, URL, or domain query through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_close_active_tab',
    description: 'Close the active Google Chrome tab through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_new_tab',
    description: 'Open a new Google Chrome tab through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__chrome_reload_active_tab',
    description: 'Reload the active Google Chrome tab through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__skillsfan_open_settings',
    description: 'Open the SkillsFan settings window through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__skillsfan_focus_main_window',
    description: 'Focus the main SkillsFan window through a structured macOS desktop adapter.',
    source: 'mcp',
    server: 'local-tools',
    category: 'desktop'
  },
  {
    name: 'mcp__local-tools__subagent_spawn',
    description: 'Launch a hosted subagent run managed by the app runtime.',
    source: 'mcp',
    server: 'local-tools',
    category: 'tasks'
  },
  {
    name: 'mcp__local-tools__subagents',
    description: 'List, inspect, wait for, or kill hosted subagent runs in the current conversation.',
    source: 'mcp',
    server: 'local-tools',
    category: 'tasks'
  },
  {
    name: 'mcp__web-tools__WebSearch',
    description: 'Search the web using the app-configured local search provider.',
    source: 'mcp',
    server: 'web-tools',
    category: 'web'
  },
  {
    name: 'mcp__web-tools__WebFetch',
    description: 'Fetch and extract readable text from a public web page.',
    source: 'mcp',
    server: 'web-tools',
    category: 'web'
  }
]

const AI_BROWSER_TOOLS: ToolCatalogEntry[] = [
  { name: 'mcp__ai-browser__browser_list_pages', description: 'List open browser pages.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_select_page', description: 'Select the active browser page by index.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_new_page', description: 'Open a new browser page at a URL.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_close_page', description: 'Close a browser page.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_navigate', description: 'Navigate, reload, go back, or go forward in the active page.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_wait_for', description: 'Wait for text to appear on the page.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_click', description: 'Click an element from the browser snapshot.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_fill', description: 'Fill an input on the page.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_snapshot', description: 'Capture a structured accessibility snapshot of the page.', source: 'mcp', server: 'ai-browser', category: 'browser' },
  { name: 'mcp__ai-browser__browser_screenshot', description: 'Take a screenshot of the page or a selected element.', source: 'mcp', server: 'ai-browser', category: 'browser' }
]

export function buildToolCatalog(options: {
  aiBrowserEnabled?: boolean
  includeSubagentTools?: boolean
}): ToolCatalogEntry[] {
  const baseTools = options.includeSubagentTools === false
    ? BASE_MCP_TOOLS.filter(entry =>
        entry.name !== 'mcp__local-tools__subagent_spawn'
        && entry.name !== 'mcp__local-tools__subagents'
      )
    : BASE_MCP_TOOLS

  const catalog = [...SHARED_BUILT_IN_TOOL_CATALOG, ...baseTools]

  if (options.aiBrowserEnabled) {
    catalog.push(...AI_BROWSER_TOOLS)
  }

  return catalog
}
