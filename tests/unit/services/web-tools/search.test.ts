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

  it('auto-detects GLM from aiSources when no explicit provider is set', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'zhipu',
        zhipu: { apiKey: 'glm-test-key', apiUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'GLM-5' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'GLM search result about AI' } }],
        web_search: [{ link: 'https://example.com/glm', title: 'GLM Result' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'AI news' })

    expect(result.provider).toBe('glm')
    expect(result.content).toBe('GLM search result about AI')
    expect(result.citations).toEqual(['https://example.com/glm'])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({ Authorization: 'Bearer glm-test-key' })
    const body = JSON.parse(String(init.body))
    expect(body.tools).toEqual([{ type: 'web_search', web_search: { enable: true } }])
  })

  it('auto-detects Kimi from aiSources with higher priority than GLM', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'zhipu',
        kimi: { apiKey: 'kimi-test-key', apiUrl: 'https://api.moonshot.cn/anthropic', model: 'kimi-k2' },
        zhipu: { apiKey: 'glm-test-key', apiUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'GLM-5' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Kimi search result' } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'test' })

    expect(result.provider).toBe('kimi')
    expect(result.content).toBe('Kimi search result')
  })

  it('auto-detects MiniMax from aiSources', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'minimax',
        minimax: { apiKey: 'minimax-test-key', apiUrl: 'https://api.minimax.chat', model: 'MiniMax-Text-01' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'MiniMax search result' } }],
        web_search: [{ url: 'https://example.com/minimax' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'test' })

    expect(result.provider).toBe('minimax')
    expect(result.content).toBe('MiniMax search result')
    expect(result.citations).toEqual(['https://example.com/minimax'])
  })

  it('auto-detects GPT from custom aiSource with openai provider', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'custom',
        custom: { provider: 'openai', apiKey: 'sk-openai-key', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: 'GPT search result',
            annotations: [{ type: 'url_citation', url: 'https://example.com/gpt' }]
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'test' })

    expect(result.provider).toBe('gpt')
    expect(result.content).toBe('GPT search result')
    expect(result.citations).toEqual(['https://example.com/gpt'])
  })

  it('auto-detects Claude from custom aiSource with anthropic provider', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'custom',
        custom: { provider: 'anthropic', apiKey: 'sk-ant-key', apiUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        content: [
          { type: 'web_search_tool_result', search_results: [{ url: 'https://example.com/claude', title: 'Claude Result' }] },
          { type: 'text', text: 'Claude search result' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'test' })

    expect(result.provider).toBe('claude')
    expect(result.content).toBe('Claude search result')
    expect(result.citations).toEqual(['https://example.com/claude'])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-key' })
  })

  it('falls back to DuckDuckGo when only DeepSeek is configured (no web search support)', async () => {
    mocks.getConfig.mockReturnValue({
      tools: {
        web: {
          search: { enabled: true, timeoutSeconds: 5, cacheTtlMinutes: 15, maxResults: 5 },
          fetch: { enabled: true }
        }
      },
      aiSources: {
        current: 'deepseek',
        deepseek: { apiKey: 'deepseek-key', apiUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }
      }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`
        <html><body>
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fddg">DDG result</a>
          <div class="result__snippet">DDG snippet</div>
        </body></html>
      `, { status: 200, headers: { 'content-type': 'text/html' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeWebSearch({ query: 'test' })

    expect(result.provider).toBe('duckduckgo')
  })
})
