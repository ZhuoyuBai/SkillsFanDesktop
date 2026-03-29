import { describe, expect, it } from 'vitest'
import { buildToolCatalog } from '../../../../src/main/services/local-tools/tool-catalog'
import { searchToolsByBm25, searchToolsByRegex } from '../../../../src/main/services/local-tools/tool-search'

describe('local tool search', () => {
  it('finds tool matches with regex', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: true })
    const results = searchToolsByRegex({
      catalog,
      pattern: 'web(search|fetch)',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual([
      'WebFetch',
      'WebSearch'
    ])
  })

  it('ranks relevant tools with bm25 search', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'search memory history',
      limit: 3
    })

    expect(results[0]?.name).toBe('mcp__local-tools__memory')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  it('surfaces macOS automation tools for system browser workflows', () => {
    const catalog = buildToolCatalog({
      aiBrowserEnabled: false,
      browserAutomationEnabled: true,
      browserAutomationMode: 'system-browser'
    })
    const results = searchToolsByBm25({
      catalog,
      query: 'open real chrome and automate macos ui with applescript',
      limit: 6
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__open_application',
      'mcp__local-tools__run_applescript'
    ]))
  })

  it('surfaces the skill MCP tool when skill workflows are enabled', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false, includeSkillMcp: true })
    const results = searchToolsByBm25({
      catalog,
      query: 'load skill instructions before starting the task',
      limit: 3
    })

    expect(results.map((item) => item.name)).toContain('mcp__skill__Skill')
  })
})
