import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

import { __testing, executeWebSearch } from '../../../../src/main/services/web-tools/search'

describe('web-tools/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    __testing.SEARCH_CACHE.clear()

    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: 'brave',
            apiKey: 'brave-key',
            timeoutSeconds: 5,
            cacheTtlMinutes: 15,
            maxResults: 5
          },
          fetch: {
            enabled: true
          }
        }
      },
      aiSources: {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __testing.SEARCH_CACHE.clear()
  })

  it('executes brave search and reuses cached results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        web: {
          results: [
            {
              title: 'GPT-5.4 rumor roundup',
              url: 'https://example.com/news/gpt-5-4',
              description: 'A summary of current rumor coverage.',
              age: '1 day ago'
            }
          ]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await executeWebSearch({ query: 'GPT-5.4', count: 3, country: 'us' })
    const second = await executeWebSearch({ query: 'GPT-5.4', count: 3, country: 'us' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(requestUrl.hostname).toBe('api.search.brave.com')
    expect(requestUrl.searchParams.get('q')).toBe('GPT-5.4')
    expect(requestUrl.searchParams.get('count')).toBe('3')
    expect(requestUrl.searchParams.get('country')).toBe('US')
    expect(first.provider).toBe('brave')
    expect(first.count).toBe(1)
    expect(first.results?.[0]).toMatchObject({
      title: 'GPT-5.4 rumor roundup',
      siteName: 'example.com',
      published: '1 day ago'
    })
    expect(second.cached).toBe(true)
  })

  it('uses the configured perplexity provider payload shape', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: 'perplexity',
            timeoutSeconds: 5,
            cacheTtlMinutes: 15,
            maxResults: 5,
            perplexity: {
              apiKey: 'pplx-key',
              baseUrl: 'https://api.perplexity.ai'
            }
          },
          fetch: {
            enabled: true
          }
        }
      },
      aiSources: {}
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            title: 'OpenAI model tracker',
            url: 'https://perplexity.ai/example',
            snippet: 'Latest public information.',
            date: '2026-03-07'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({
      query: 'OpenAI GPT news',
      count: 4,
      domainFilter: ['openai.com', 'theverge.com'],
      freshness: 'week',
      language: 'en'
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.perplexity.ai/search')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer pplx-key'
    })
    expect(JSON.parse(String(init.body))).toEqual({
      query: 'OpenAI GPT news',
      max_results: 4,
      search_language_filter: ['en'],
      search_recency_filter: 'week',
      search_domain_filter: ['openai.com', 'theverge.com']
    })
    expect(result.provider).toBe('perplexity')
    expect(result.results?.[0].siteName).toBe('perplexity.ai')
  })

  it('uses the no-key DuckDuckGo HTML provider when configured', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: 'duckduckgo',
            timeoutSeconds: 5,
            cacheTtlMinutes: 15,
            maxResults: 5
          },
          fetch: {
            enabled: true
          }
        }
      },
      aiSources: {}
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`
        <html>
          <body>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffirst">First result</a>
            <div class="result__snippet">First snippet</div>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsecond">Second result</a>
            <div class="result__snippet">Second snippet</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'open source ai', count: 2 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(requestUrl.hostname).toBe('html.duckduckgo.com')
    expect(requestUrl.searchParams.get('q')).toBe('open source ai')
    expect(result.provider).toBe('duckduckgo')
    expect(result.count).toBe(2)
    expect(result.results).toEqual([
      {
        title: 'First result',
        url: 'https://example.com/first',
        snippet: 'First snippet',
        siteName: 'example.com'
      },
      {
        title: 'Second result',
        url: 'https://example.com/second',
        snippet: 'Second snippet',
        siteName: 'example.com'
      }
    ])
  })

  it('falls back to DuckDuckGo HTML when an API provider is selected without a key', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: 'brave',
            apiKey: '',
            timeoutSeconds: 5,
            cacheTtlMinutes: 15,
            maxResults: 5
          },
          fetch: {
            enabled: true
          }
        }
      },
      aiSources: {}
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`
        <html>
          <body>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffallback">Fallback result</a>
            <div class="result__snippet">Fallback snippet</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'fallback search', count: 1 })

    expect(result.provider).toBe('duckduckgo')
    expect(result.results?.[0]).toMatchObject({
      title: 'Fallback result',
      url: 'https://example.com/fallback'
    })
  })
})
