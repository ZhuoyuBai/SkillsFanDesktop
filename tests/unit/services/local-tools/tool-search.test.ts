import { describe, expect, it } from 'vitest'
import { buildToolCatalog } from '../../../../src/main/services/local-tools/tool-catalog'
import { searchToolsByBm25, searchToolsByRegex } from '../../../../src/main/services/local-tools/tool-search'

describe('local tool search', () => {
  it('finds tool matches with regex', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: true, includeSkillMcp: true })
    const results = searchToolsByRegex({
      catalog,
      pattern: 'web(search|fetch)',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual([
      'mcp__web-tools__WebFetch',
      'mcp__web-tools__WebSearch'
    ])
  })

  it('ranks relevant tools with bm25 search', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false, includeSkillMcp: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'search memory history',
      limit: 3
    })

    expect(results[0]?.name).toBe('mcp__local-tools__memory')
    expect(results[0]?.score).toBeGreaterThan(0)
  })
})
