import { describe, expect, it } from 'vitest'

import {
  AI_BROWSER_MCP_TOOL_PREFIX,
  AI_BROWSER_TOOL_PREFIX,
  isAIBrowserTool
} from '../../../../src/main/services/ai-browser/tool-utils'

describe('ai-browser tool-utils', () => {
  it('recognizes raw browser tool names', () => {
    expect(isAIBrowserTool(`${AI_BROWSER_TOOL_PREFIX}new_page`)).toBe(true)
  })

  it('recognizes MCP-prefixed browser tool names', () => {
    expect(isAIBrowserTool(`${AI_BROWSER_MCP_TOOL_PREFIX}new_page`)).toBe(true)
  })

  it('rejects non-browser tool names', () => {
    expect(isAIBrowserTool('mcp__local-tools__open_application')).toBe(false)
  })
})
