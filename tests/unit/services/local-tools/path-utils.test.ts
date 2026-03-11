import { describe, expect, it } from 'vitest'
import { normalizeLocalFilePath } from '../../../../src/main/services/local-tools/path-utils'

describe('normalizeLocalFilePath', () => {
  it('converts macOS HFS paths into POSIX paths', () => {
    expect(normalizeLocalFilePath('Macintosh HD:Users:zhuoyu:Desktop:test.png'))
      .toBe('/Users/zhuoyu/Desktop/test.png')
  })

  it('decodes file URLs into local paths', () => {
    expect(normalizeLocalFilePath('file:///Users/zhuoyu/Desktop/test%20image.png'))
      .toBe('/Users/zhuoyu/Desktop/test image.png')
  })

  it('resolves home and relative paths', () => {
    expect(normalizeLocalFilePath('notes/result.txt', '/tmp/workspace'))
      .toBe('/tmp/workspace/notes/result.txt')
  })
})
