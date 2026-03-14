import { describe, expect, it } from 'vitest'

import {
  getBlockedServerSideToolNames,
  getClaudeSdkBuiltInToolNames,
  getHostedSubagentDisallowedBuiltInToolNames,
  isBlockedServerSideTool,
  isHostedSubagentDisallowedBuiltInTool
} from '../../../../src/gateway/tools'

describe('shared built-in tool definitions', () => {
  it('exposes the shared Claude SDK built-in tool list', () => {
    expect(getClaudeSdkBuiltInToolNames()).toEqual([
      'Read', 'Write', 'Edit', 'Grep', 'Glob',
      'Bash',
      'TodoWrite', 'TaskOutput',
      'NotebookEdit',
      'Task',
      'AskUserQuestion',
      'TeamCreate', 'TeamDelete', 'SendMessage',
      'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
      'EnterPlanMode', 'EnterWorktree'
    ])
  })

  it('keeps server-side tools blocked through a shared helper', () => {
    expect(getBlockedServerSideToolNames()).toContain('WebSearch')
    expect(isBlockedServerSideTool('WebSearch')).toBe(true)
    expect(isBlockedServerSideTool('mcp__local-tools__memory')).toBe(false)
  })

  it('tracks hosted subagent built-in restrictions through the shared helper', () => {
    expect(getHostedSubagentDisallowedBuiltInToolNames()).toContain('Task')
    expect(isHostedSubagentDisallowedBuiltInTool('Task')).toBe(true)
    expect(isHostedSubagentDisallowedBuiltInTool('Bash')).toBe(false)
  })
})
