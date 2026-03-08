import { describe, expect, it } from 'vitest'
import {
  buildThinkingCard,
  buildThinkingCardWithTools,
  buildCompleteCard
} from '@main/services/feishu/card-builder'

function getHeaderTitle(card: Record<string, any>): string {
  return card.header.title.content
}

function getBodyText(card: Record<string, any>): string {
  return card.elements[0].text.content
}

describe('feishu card builder', () => {
  it('renders localized thinking cards', () => {
    const zhCard = buildThinkingCard('zh-CN')
    const twCard = buildThinkingCard('zh-TW')
    const enCard = buildThinkingCard('en')

    expect(getHeaderTitle(zhCard)).toBe('任务状态')
    expect(getBodyText(zhCard)).toBe('正在处理你的请求…')

    expect(getHeaderTitle(twCard)).toBe('任務狀態')
    expect(getBodyText(twCard)).toBe('正在處理你的請求…')

    expect(getHeaderTitle(enCard)).toBe('Task Status')
    expect(getBodyText(enCard)).toBe('Working on your request…')
  })

  it('renders localized tool summaries without raw internal names', () => {
    const card = buildThinkingCardWithTools(
      ['🔎 Searching the web: GPT-5.4', '🌐 Reading a web page: openai.com'],
      'en'
    )

    expect(getHeaderTitle(card)).toBe('Task Status')
    expect(getBodyText(card)).toContain('Working on your request:')
    expect(getBodyText(card)).not.toContain('mcp__web-tools__WebSearch')
  })

  it('renders localized completion card', () => {
    const card = buildCompleteCard('zh-TW')

    expect(getHeaderTitle(card)).toBe('任務狀態')
    expect(getBodyText(card)).toBe('任務完成 ✓')
  })
})
