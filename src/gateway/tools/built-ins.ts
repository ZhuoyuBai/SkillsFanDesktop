import type { ToolCatalogEntry } from './types'

export const SHARED_BUILT_IN_TOOL_CATALOG: ToolCatalogEntry[] = [
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

const CLAUDE_SDK_BUILT_IN_TOOL_NAMES = SHARED_BUILT_IN_TOOL_CATALOG.map((entry) => entry.name)

const BLOCKED_SERVER_SIDE_TOOL_NAMES = [
  'WebSearch',
  'WebFetch',
  'web_search',
  'web_fetch',
  'code_execution',
  'bash_code_execution',
  'text_editor_code_execution',
  'tool_search_tool_regex',
  'tool_search_tool_bm25',
  'memory'
] as const

const HOSTED_SUBAGENT_DISALLOWED_BUILT_IN_TOOL_NAMES = [
  'Task',
  'AskUserQuestion',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'EnterPlanMode',
  'EnterWorktree'
] as const

const BLOCKED_SERVER_SIDE_TOOL_SET = new Set<string>(BLOCKED_SERVER_SIDE_TOOL_NAMES)
const HOSTED_SUBAGENT_DISALLOWED_BUILT_IN_TOOL_SET = new Set<string>(HOSTED_SUBAGENT_DISALLOWED_BUILT_IN_TOOL_NAMES)

export function getClaudeSdkBuiltInToolNames(): string[] {
  return [...CLAUDE_SDK_BUILT_IN_TOOL_NAMES]
}

export function getBlockedServerSideToolNames(): string[] {
  return [...BLOCKED_SERVER_SIDE_TOOL_NAMES]
}

export function isBlockedServerSideTool(toolName: string): boolean {
  return BLOCKED_SERVER_SIDE_TOOL_SET.has(toolName)
}

export function getHostedSubagentDisallowedBuiltInToolNames(): string[] {
  return [...HOSTED_SUBAGENT_DISALLOWED_BUILT_IN_TOOL_NAMES]
}

export function isHostedSubagentDisallowedBuiltInTool(toolName: string): boolean {
  return HOSTED_SUBAGENT_DISALLOWED_BUILT_IN_TOOL_SET.has(toolName)
}
