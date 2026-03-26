import { describe, expect, it } from 'vitest'

import {
  isCompactLinearStreamText,
  trimBoundaryBlankLines,
} from '../../../src/renderer/utils/linear-stream-text'

describe('trimBoundaryBlankLines', () => {
  it('removes leading and trailing blank lines around a short status update', () => {
    expect(trimBoundaryBlankLines('\n\nJina 服务受限，让我使用浏览器直接搜索：\n\n')).toBe(
      'Jina 服务受限，让我使用浏览器直接搜索：'
    )
  })

  it('preserves internal paragraph breaks', () => {
    expect(trimBoundaryBlankLines('\n\n第一段\n\n第二段\n\n')).toBe('第一段\n\n第二段')
  })
})

describe('isCompactLinearStreamText', () => {
  it('treats a short single-line update with boundary blank lines as compact', () => {
    expect(isCompactLinearStreamText('\n\n搜索到了！让我点击第一个结果获取更详细的信息：\n')).toBe(true)
  })

  it('does not compact multi-line content', () => {
    expect(isCompactLinearStreamText('第一行\n第二行')).toBe(false)
  })
})
