import { describe, expect, it } from 'vitest'
import { normalizeAssistantContent } from '../../../src/shared/utils/assistant-content'

describe('assistant-content', () => {
  it('removes whitespace-only blank lines and trims stray paragraph indentation', () => {
    const content = [
      ' 我来帮你搜索杭州明天的天气信息。',
      '  ',
      '   ',
      '          已获取到天气信息，让我关闭搜索 tab 并为你整理：     ',
      '',
      '   **杭州明天（3月27日，周五）天气：**',
    ].join('\n')

    expect(normalizeAssistantContent(content)).toBe([
      '我来帮你搜索杭州明天的天气信息。',
      '',
      '已获取到天气信息，让我关闭搜索 tab 并为你整理：',
      '',
      '**杭州明天（3月27日，周五）天气：**',
    ].join('\n'))
  })

  it('preserves fenced code blocks', () => {
    const content = [
      '这里是示例：',
      '',
      '```ts',
      '    const value = 1',
      '    console.log(value)',
      '```',
    ].join('\n')

    expect(normalizeAssistantContent(content)).toBe(content)
  })
})
