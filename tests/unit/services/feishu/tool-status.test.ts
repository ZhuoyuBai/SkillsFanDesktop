import { describe, expect, it } from 'vitest'
import { summarizeToolCall, upsertToolSummary } from '@main/services/feishu/tool-status'

describe('feishu tool status', () => {
  it('normalizes mcp web search into a readable localized summary', () => {
    const summary = summarizeToolCall('zh-CN', 'mcp__web-tools__WebSearch', {
      query: 'GPT-5.4 最新资讯 2026'
    })

    expect(summary.key).toBe('web-search')
    expect(summary.text).toBe('🔎 检索网页：GPT-5.4 最新资讯 2026')
  })

  it('deduplicates the same logical tool across raw and mcp names', () => {
    const first = summarizeToolCall('zh-CN', 'mcp__web-tools__WebSearch', {
      query: 'GPT-5.4 最新资讯 2026'
    })
    const second = summarizeToolCall('zh-CN', 'WebSearch', {
      query: 'GPT-5.4 介绍'
    })

    const merged = upsertToolSummary([first], second)

    expect(merged).toHaveLength(1)
    expect(merged[0].key).toBe('web-search')
    expect(merged[0].text).toBe('🔎 检索网页：GPT-5.4 介绍')
  })

  it('formats web fetch with english host display', () => {
    const summary = summarizeToolCall('en', 'mcp__web-tools__WebFetch', {
      url: 'https://www.openai.com/blog'
    })

    expect(summary.key).toBe('web-fetch')
    expect(summary.text).toBe('🌐 Reading a web page: openai.com')
  })

  it('formats unknown tools without exposing internal prefixes', () => {
    const summary = summarizeToolCall('zh-TW', 'mcp__custom__NotebookEdit')

    expect(summary.key).toBe('tool:notebookedit')
    expect(summary.text).toBe('🔧 呼叫工具：Notebook Edit')
  })

  it('summarizes local memory and code tools with localized copy', () => {
    const memory = summarizeToolCall('zh-CN', 'mcp__local-tools__memory', {
      command: 'search',
      query: '缓存策略'
    })
    const code = summarizeToolCall('en', 'mcp__local-tools__code_execution', {
      language: 'python'
    })

    expect(memory).toEqual({
      key: 'memory',
      text: '🧠 检索记忆：缓存策略'
    })
    expect(code).toEqual({
      key: 'code-execution',
      text: '🧪 Running code: python'
    })
  })
})
