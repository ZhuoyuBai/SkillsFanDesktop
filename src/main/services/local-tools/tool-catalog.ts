export interface ToolCatalogEntry {
  name: string
  description: string
  source: 'built-in' | 'mcp'
  server?: string
  category: 'files' | 'shell' | 'tasks' | 'browser' | 'web' | 'memory' | 'skills' | 'meta'
}

const BUILT_IN_TOOLS: ToolCatalogEntry[] = [
  { name: 'Read', description: 'Read a file from the current workspace.', source: 'built-in', category: 'files' },
  { name: 'Write', description: 'Write a file to the current workspace.', source: 'built-in', category: 'files' },
  { name: 'Edit', description: 'Replace exact text in a file.', source: 'built-in', category: 'files' },
  { name: 'Grep', description: 'Search file contents with ripgrep.', source: 'built-in', category: 'files' },
  { name: 'Glob', description: 'Find files by glob pattern.', source: 'built-in', category: 'files' },
  { name: 'Bash', description: 'Run a shell command in the workspace.', source: 'built-in', category: 'shell' },
  { name: 'TodoWrite', description: 'Maintain a visible task checklist.', source: 'built-in', category: 'tasks' },
  { name: 'TaskOutput', description: 'Read output from a background task.', source: 'built-in', category: 'tasks' },
  { name: 'NotebookEdit', description: 'Edit a Jupyter notebook cell.', source: 'built-in', category: 'files' },
  { name: 'Task', description: 'Launch a sub-agent for parallel work.', source: 'built-in', category: 'tasks' },
  { name: 'AskUserQuestion', description: 'Pause and ask the user a structured follow-up question.', source: 'built-in', category: 'tasks' },
  { name: 'TeamCreate', description: 'Create an agent team for coordinated work.', source: 'built-in', category: 'tasks' },
  { name: 'TeamDelete', description: 'Delete an agent team.', source: 'built-in', category: 'tasks' },
  { name: 'SendMessage', description: 'Send a message between team members.', source: 'built-in', category: 'tasks' },
  { name: 'TaskCreate', description: 'Create a team task.', source: 'built-in', category: 'tasks' },
  { name: 'TaskUpdate', description: 'Update a team task.', source: 'built-in', category: 'tasks' },
  { name: 'TaskList', description: 'List team tasks.', source: 'built-in', category: 'tasks' },
  { name: 'TaskGet', description: 'Get details for a team task.', source: 'built-in', category: 'tasks' },
  { name: 'EnterPlanMode', description: 'Switch into planning mode.', source: 'built-in', category: 'tasks' },
  { name: 'EnterWorktree', description: 'Create an isolated worktree for edits.', source: 'built-in', category: 'files' }
]

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
    description: 'Open a real macOS application, optionally with a URL or file target, such as Google Chrome.',
    source: 'mcp',
    server: 'local-tools',
    category: 'browser'
  },
  {
    name: 'mcp__local-tools__run_applescript',
    description: 'Run AppleScript on macOS for system-level UI automation after the user grants Accessibility permissions.',
    source: 'mcp',
    server: 'local-tools',
    category: 'shell'
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

const SKILL_TOOL: ToolCatalogEntry = {
  name: 'mcp__skill__Skill',
  description: 'Load a Skill package with task-specific instructions from the local skill registry.',
  source: 'mcp',
  server: 'skill',
  category: 'skills'
}

export function buildToolCatalog(options: {
  aiBrowserEnabled?: boolean
  includeSkillMcp?: boolean
}): ToolCatalogEntry[] {
  const catalog = [...BUILT_IN_TOOLS, ...BASE_MCP_TOOLS]

  if (options.aiBrowserEnabled) {
    catalog.push(...AI_BROWSER_TOOLS)
  }

  if (options.includeSkillMcp) {
    catalog.push(SKILL_TOOL)
  }

  return catalog
}
