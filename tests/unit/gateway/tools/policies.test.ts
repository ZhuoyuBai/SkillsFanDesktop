import { describe, expect, it } from 'vitest'

import {
  buildSharedToolApprovalDescription,
  getSharedToolPermissionPolicy
} from '../../../../src/gateway/tools/policies'

describe('gateway tool permission policies', () => {
  it('returns a sanitize policy for local web search replacements', () => {
    expect(getSharedToolPermissionPolicy('mcp__web-tools__WebSearch')).toEqual({
      kind: 'sanitize-web-search'
    })
  })

  it('builds terminal target approval descriptions through shared policy helpers', () => {
    expect(
      buildSharedToolApprovalDescription('mcp__local-tools__terminal_get_last_command_result', {
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      })
    ).toBe('Read terminal last command result: window 2, tab 3, pane 2')
  })

  it('builds focus descriptions with default current target labels', () => {
    expect(
      buildSharedToolApprovalDescription('mcp__local-tools__terminal_focus_session', {})
    ).toBe('Focus terminal target: current window, current tab, current session')
  })

  it('returns null for tools without shared policy registration', () => {
    expect(getSharedToolPermissionPolicy('Task')).toBeNull()
    expect(buildSharedToolApprovalDescription('Task', {})).toBeNull()
  })
})
