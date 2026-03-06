import { describe, expect, it } from 'vitest'

import {
  getMatchingToolResult,
  getLatestVisibleActiveToolUseIds,
  isDuplicateActiveToolUse,
  type ThoughtLike
} from '../../../src/shared/utils/thought-dedupe'

function createToolUse(overrides: Partial<ThoughtLike> = {}): ThoughtLike {
  return {
    id: 'tool_use_1',
    type: 'tool_use',
    toolName: 'WebSearch',
    toolInput: { query: '杭州 明天天气 2026-03-07' },
    ...overrides
  }
}

describe('thought-dedupe', () => {
  it('detects duplicate unresolved tool_use thoughts with the same semantic input', () => {
    const existingThoughts: ThoughtLike[] = [
      createToolUse({ id: 'tool_use_a', toolInput: { query: '杭州 明天天气 2026-03-07', page: 1 } })
    ]

    const candidate = createToolUse({
      id: 'tool_use_b',
      toolInput: { page: 1, query: '杭州 明天天气 2026-03-07' }
    })

    expect(isDuplicateActiveToolUse(existingThoughts, candidate)).toBe(true)
  })

  it('does not mark a later tool_use as duplicate once the previous one has completed', () => {
    const firstCall = createToolUse({ id: 'tool_use_a' })
    const completion = {
      id: 'tool_result_a_result',
      type: 'tool_result'
    } satisfies ThoughtLike

    const candidate = createToolUse({ id: 'tool_use_b' })

    expect(isDuplicateActiveToolUse([firstCall, completion], candidate)).toBe(false)
  })

  it('keeps only the latest unresolved tool_use for each fingerprint', () => {
    const firstHangzhou = createToolUse({ id: 'tool_use_a' })
    const secondHangzhou = createToolUse({ id: 'tool_use_b' })
    const nanjing = createToolUse({
      id: 'tool_use_c',
      toolInput: { query: '南京 明天天气 2026-03-07' }
    })
    const completedSearch = createToolUse({
      id: 'tool_use_done',
      toolInput: { query: '上海 明天天气 2026-03-07' }
    })
    const completedResult = {
      id: 'tool_result_done',
      type: 'tool_result'
    } satisfies ThoughtLike

    const visibleIds = getLatestVisibleActiveToolUseIds([
      firstHangzhou,
      nanjing,
      secondHangzhou,
      completedSearch,
      completedResult
    ])

    expect(visibleIds.has('tool_use_a')).toBe(false)
    expect(visibleIds.has('tool_use_b')).toBe(true)
    expect(visibleIds.has('tool_use_c')).toBe(true)
    expect(visibleIds.has('tool_use_done')).toBe(false)
  })

  it('matches tool results by normalized exact id instead of substring', () => {
    const toolUse = createToolUse({ id: 'call_1' })
    const wrongResult = {
      id: 'call_12',
      type: 'tool_result'
    } satisfies ThoughtLike
    const rightResult = {
      id: 'tool_result_call_1',
      type: 'tool_result'
    } satisfies ThoughtLike

    expect(getMatchingToolResult([wrongResult], toolUse)).toBeUndefined()
    expect(getMatchingToolResult([wrongResult, rightResult], toolUse)).toEqual(rightResult)
  })
})
