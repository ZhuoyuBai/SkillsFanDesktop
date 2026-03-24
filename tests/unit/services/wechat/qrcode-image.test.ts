import { describe, expect, it, vi } from 'vitest'
import {
  normalizeInlineQRCodeImage,
  resolveQRCodeImageSource
} from '@main/services/wechat/qrcode-image'

describe('wechat qr code image helpers', () => {
  it('passes through existing image data urls', () => {
    const dataUrl = 'data:image/png;base64,abc123'
    expect(normalizeInlineQRCodeImage(dataUrl)).toBe(dataUrl)
  })

  it('normalizes raw base64 image payloads', () => {
    const input = ' iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9m0X8AAAAASUVORK5CYII= '
    expect(normalizeInlineQRCodeImage(input)).toBe(`data:image/png;base64,${input.trim()}`)
  })

  it('normalizes url-safe base64 and strips whitespace', () => {
    const input = `${'abcd_efgh-'.repeat(8)}\nijkl==`
    expect(normalizeInlineQRCodeImage(input)).toBe(
      `data:image/png;base64,${`${'abcd/efgh+'.repeat(8)}ijkl==`}`
    )
  })

  it('wraps inline svg payloads into a data url', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    expect(normalizeInlineQRCodeImage(svg)).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    )
  })

  it('falls back to local generation for unsupported payloads', async () => {
    const generateDataUrl = vi.fn(async (qrcode: string) => `generated:${qrcode}`)

    const result = await resolveQRCodeImageSource(
      'wechat-login-token',
      'https://example.com/qr.png',
      generateDataUrl
    )

    expect(result).toBe('generated:wechat-login-token')
    expect(generateDataUrl).toHaveBeenCalledWith('wechat-login-token')
  })

  it('uses normalized inline content without generating a new qr code', async () => {
    const generateDataUrl = vi.fn(async (qrcode: string) => `generated:${qrcode}`)
    const inlineBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9m0X8AAAAASUVORK5CYII='

    const result = await resolveQRCodeImageSource('wechat-login-token', inlineBase64, generateDataUrl)

    expect(result).toBe(`data:image/png;base64,${inlineBase64}`)
    expect(generateDataUrl).not.toHaveBeenCalled()
  })
})
