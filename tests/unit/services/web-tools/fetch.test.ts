import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

import { executeWebFetch, extractReadableContent, validatePublicWebUrl } from '../../../../src/main/services/web-tools/fetch'

describe('web-tools/fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: {
            enabled: true
          },
          fetch: {
            enabled: true,
            maxChars: 80,
            timeoutSeconds: 5,
            cacheTtlMinutes: 15,
            maxRedirects: 2,
            userAgent: 'SkillsFanTest/1.0'
          }
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('blocks localhost and other private URLs', () => {
    expect(() => validatePublicWebUrl('http://localhost:3000')).toThrow('Blocked private or local network URL.')
    expect(() => validatePublicWebUrl('ftp://example.com/file.txt')).toThrow('Only http and https URLs are supported.')
  })

  it('extracts readable HTML, follows redirects, truncates, and caches', async () => {
    const longParagraph = 'This is a long body paragraph with enough content to trigger truncation in the local fetch tool. '.repeat(20)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 302,
        headers: { location: '/final' }
      }))
      .mockResolvedValueOnce(new Response(`
        <html>
          <head><title>Example Title</title></head>
          <body>
            <main>
              <h1>Headline</h1>
              <p>${longParagraph}</p>
            </main>
            <script>window.__test = true</script>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await executeWebFetch({ url: 'https://example.com/start', maxChars: 1000 })
    const second = await executeWebFetch({ url: 'https://example.com/start', maxChars: 1000 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.finalUrl).toBe('https://example.com/final')
    expect(first.title).toBe('Example Title')
    expect(first.content).toContain('Headline')
    expect(first.content).not.toContain('__test')
    expect(first.truncated).toBe(true)
    expect(first.content.length).toBeLessThanOrEqual(1000)
    expect(second.cached).toBe(true)
  })

  it('extracts text from non-html content without title parsing', () => {
    expect(extractReadableContent('{"ok":true}', 'application/json')).toEqual({
      content: '{"ok":true}'
    })
  })
})
