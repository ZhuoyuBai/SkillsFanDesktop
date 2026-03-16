import { getConfig } from '../config.service'
import { normalizeWebToolsConfig } from './config'
import type { WebSearchProvider } from '../../shared/types'

type SearchPayload = {
  query: string
  provider: WebSearchProvider
  count?: number
  tookMs: number
  cached?: boolean
  results?: Array<{
    title: string
    url: string
    snippet: string
    siteName?: string
    published?: string
  }>
  content?: string
  citations?: string[]
}

type CacheEntry = {
  expiresAt: number
  payload: SearchPayload
}

const SEARCH_CACHE = new Map<string, CacheEntry>()
const DUCKDUCKGO_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/'
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const PERPLEXITY_PATH = '/search'
const DUCKDUCKGO_FRESHNESS_MAP: Record<string, string> = {
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y'
}
const BRAVE_FRESHNESS_MAP: Record<string, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py'
}

function normalizeApiKey(value?: string): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
}

function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')))
}

function resolveSiteName(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function buildCacheKey(parts: Array<string | number | undefined>): string {
  return parts.map((part) => String(part || '')).join('|')
}

function readCachedPayload(key: string): SearchPayload | null {
  const cached = SEARCH_CACHE.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    SEARCH_CACHE.delete(key)
    return null
  }
  return { ...cached.payload, cached: true }
}

function writeCachedPayload(key: string, ttlMinutes: number, payload: SearchPayload): void {
  if (ttlMinutes <= 0) return

  SEARCH_CACHE.set(key, {
    expiresAt: Date.now() + ttlMinutes * 60_000,
    payload
  })
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutSeconds: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500)
  } catch {
    return response.statusText || `HTTP ${response.status}`
  }
}

// ---------------------------------------------------------------------------
// AI Source key resolution helpers
// ---------------------------------------------------------------------------

function getAiSourceApiKey(sourceKey: string): string {
  const config = getConfig()
  const source = config.aiSources?.[sourceKey] as Record<string, unknown> | undefined
  if (source && typeof source.apiKey === 'string') {
    return source.apiKey.trim()
  }
  return ''
}

function resolveClaudeApiKeyFromSources(): string {
  const config = getConfig()
  const aiSources = config.aiSources as Record<string, unknown> | undefined
  if (!aiSources) return ''

  // Check 'custom' source with anthropic provider
  const custom = aiSources.custom as Record<string, unknown> | undefined
  if (custom && custom.provider === 'anthropic' && typeof custom.apiKey === 'string') {
    return custom.apiKey.trim()
  }

  return ''
}

function resolveGptApiKeyFromSources(): string {
  const config = getConfig()
  const aiSources = config.aiSources as Record<string, unknown> | undefined
  if (!aiSources) return ''

  // Check 'custom' source with openai provider
  const custom = aiSources.custom as Record<string, unknown> | undefined
  if (custom && custom.provider === 'openai' && typeof custom.apiKey === 'string') {
    return custom.apiKey.trim()
  }

  return ''
}

function getProviderRuntime() {
  const config = getConfig()
  return normalizeWebToolsConfig(config.tools)
}

// ---------------------------------------------------------------------------
// DuckDuckGo
// ---------------------------------------------------------------------------

function buildDuckDuckGoQuery(query: string, domainFilter?: string[]): string {
  if (!domainFilter || domainFilter.length === 0) {
    return query
  }

  if (domainFilter.length === 1) {
    return `${query} site:${domainFilter[0]}`
  }

  return `${query} (${domainFilter.map((domain) => `site:${domain}`).join(' OR ')})`
}

function resolveDuckDuckGoHref(rawHref: string): string | undefined {
  const decodedHref = decodeHtmlEntities(rawHref).trim()
  if (!decodedHref) return undefined

  try {
    const url = new URL(decodedHref, 'https://duckduckgo.com')
    const redirected = url.searchParams.get('uddg')
    if (redirected) {
      const resolved = decodeURIComponent(redirected)
      const target = new URL(resolved)
      if (target.protocol === 'http:' || target.protocol === 'https:') {
        return target.toString()
      }
      return undefined
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    return undefined
  }

  return undefined
}

async function runDuckDuckGoSearch(args: {
  query: string
  count: number
  country?: string
  language?: string
  freshness?: string
  domainFilter?: string[]
  timeoutSeconds: number
}) {
  const url = new URL(DUCKDUCKGO_HTML_ENDPOINT)
  url.searchParams.set('q', buildDuckDuckGoQuery(args.query, args.domainFilter))

  if (args.freshness && DUCKDUCKGO_FRESHNESS_MAP[args.freshness]) {
    url.searchParams.set('df', DUCKDUCKGO_FRESHNESS_MAP[args.freshness])
  }

  const acceptLanguage = [args.language, args.country]
    .filter(Boolean)
    .join(args.country ? '-' : '')

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': acceptLanguage || 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search error (${response.status}): ${await readErrorText(response)}`)
  }

  const html = await response.text()
  const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const matches = Array.from(html.matchAll(anchorRegex))
  const results: SearchPayload['results'] = []
  const seen = new Set<string>()

  for (let index = 0; index < matches.length && results.length < args.count; index += 1) {
    const match = matches[index]
    const href = resolveDuckDuckGoHref(match[1] || '')
    if (!href || seen.has(href)) continue

    const nextIndex = matches[index + 1]?.index ?? html.length
    const segment = html.slice(match.index || 0, nextIndex)
    const snippetMatch = segment.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i)
    const title = stripHtml(match[2] || '')
    if (!title) continue

    seen.add(href)
    results.push({
      title,
      url: href,
      snippet: stripHtml(snippetMatch?.[1] || ''),
      siteName: resolveSiteName(href)
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Brave
// ---------------------------------------------------------------------------

async function runBraveSearch(args: {
  query: string
  count: number
  country?: string
  language?: string
  freshness?: string
  timeoutSeconds: number
  apiKey: string
}) {
  const url = new URL(BRAVE_ENDPOINT)
  url.searchParams.set('q', args.query)
  url.searchParams.set('count', String(args.count))

  if (args.country) {
    url.searchParams.set('country', args.country.toUpperCase())
  }
  if (args.language) {
    url.searchParams.set('search_lang', args.language.toLowerCase())
  }
  if (args.freshness && BRAVE_FRESHNESS_MAP[args.freshness]) {
    url.searchParams.set('freshness', BRAVE_FRESHNESS_MAP[args.freshness])
  }

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': args.apiKey
    }
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`Brave Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    web?: {
      results?: Array<{
        title?: string
        url?: string
        description?: string
        age?: string
      }>
    }
  }

  return (data.web?.results || []).map((entry) => ({
    title: entry.title || '',
    url: entry.url || '',
    snippet: entry.description || '',
    siteName: entry.url ? resolveSiteName(entry.url) : undefined,
    published: entry.age || undefined
  }))
}

// ---------------------------------------------------------------------------
// Perplexity
// ---------------------------------------------------------------------------

async function runPerplexitySearch(args: {
  query: string
  count: number
  country?: string
  language?: string
  freshness?: string
  domainFilter?: string[]
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}${PERPLEXITY_PATH}`
  const body: Record<string, unknown> = {
    query: args.query,
    max_results: args.count
  }

  if (args.country) body.country = args.country.toUpperCase()
  if (args.language) body.search_language_filter = [args.language.toLowerCase()]
  if (args.freshness) body.search_recency_filter = args.freshness
  if (args.domainFilter && args.domainFilter.length > 0) body.search_domain_filter = args.domainFilter

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify(body)
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`Perplexity Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    results?: Array<{
      title?: string
      url?: string
      snippet?: string
      date?: string
      last_updated?: string
    }>
  }

  return (data.results || []).map((entry) => ({
    title: entry.title || '',
    url: entry.url || '',
    snippet: entry.snippet || '',
    siteName: entry.url ? resolveSiteName(entry.url) : undefined,
    published: entry.date || entry.last_updated || undefined
  }))
}

// ---------------------------------------------------------------------------
// Kimi (Moonshot)
// ---------------------------------------------------------------------------

function extractKimiMessageText(message?: {
  content?: string
  reasoning_content?: string
}): string {
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim()
  }
  if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content.trim()
  }
  return ''
}

function extractKimiCitations(data: {
  search_results?: Array<{ url?: string }>
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { arguments?: string }
      }>
    }
  }>
}): string[] {
  const urls = new Set<string>()

  for (const result of data.search_results || []) {
    if (typeof result.url === 'string' && result.url.trim()) {
      urls.add(result.url.trim())
    }
  }

  for (const toolCall of data.choices?.[0]?.message?.tool_calls || []) {
    const raw = toolCall.function?.arguments
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as {
        url?: string
        search_results?: Array<{ url?: string }>
      }

      if (typeof parsed.url === 'string' && parsed.url.trim()) {
        urls.add(parsed.url.trim())
      }

      for (const result of parsed.search_results || []) {
        if (typeof result.url === 'string' && result.url.trim()) {
          urls.add(result.url.trim())
        }
      }
    } catch {
      continue
    }
  }

  return Array.from(urls)
}

function buildKimiToolResultContent(data: {
  search_results?: Array<{ title?: string; url?: string; content?: string }>
}): string {
  return JSON.stringify({
    search_results: (data.search_results || []).map((entry) => ({
      title: entry.title || '',
      url: entry.url || '',
      content: entry.content || ''
    }))
  })
}

async function runKimiSearch(args: {
  query: string
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
  model: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}/chat/completions`
  const messages: Array<Record<string, unknown>> = [{ role: 'user', content: args.query }]
  const citations = new Set<string>()

  for (let round = 0; round < 3; round += 1) {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`
      },
      body: JSON.stringify({
        model: args.model,
        messages,
        tools: [{
          type: 'builtin_function',
          function: { name: '$web_search' }
        }]
      })
    }, args.timeoutSeconds)

    if (!response.ok) {
      throw new Error(`Kimi Search API error (${response.status}): ${await readErrorText(response)}`)
    }

    const data = await response.json() as {
      search_results?: Array<{ title?: string; url?: string; content?: string }>
      choices?: Array<{
        finish_reason?: string
        message?: {
          content?: string
          reasoning_content?: string
          tool_calls?: Array<{
            id?: string
            function?: { arguments?: string }
          }>
        }
      }>
    }

    for (const url of extractKimiCitations(data)) {
      citations.add(url)
    }

    const choice = data.choices?.[0]
    const message = choice?.message
    const text = extractKimiMessageText(message)
    const toolCalls = message?.tool_calls || []

    if (choice?.finish_reason !== 'tool_calls' || toolCalls.length === 0) {
      return {
        content: text || 'No response',
        citations: Array.from(citations)
      }
    }

    messages.push({
      role: 'assistant',
      content: message?.content || '',
      ...(message?.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
      tool_calls: toolCalls
    })

    const toolContent = buildKimiToolResultContent(data)
    let pushedToolResult = false
    for (const toolCall of toolCalls) {
      const toolCallId = typeof toolCall.id === 'string' ? toolCall.id.trim() : ''
      if (!toolCallId) continue
      pushedToolResult = true
      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: toolContent
      })
    }

    if (!pushedToolResult) {
      return {
        content: text || 'No response',
        citations: Array.from(citations)
      }
    }
  }

  return {
    content: 'Search completed but no final answer was produced.',
    citations: Array.from(citations)
  }
}

// ---------------------------------------------------------------------------
// GLM (Zhipu AI)
// ---------------------------------------------------------------------------

async function runGlmSearch(args: {
  query: string
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
  model: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'user', content: args.query }],
      tools: [{ type: 'web_search', web_search: { enable: true } }]
    })
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`GLM Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string
        tool_calls?: Array<{
          type?: string
          function?: { arguments?: string }
        }>
      }
    }>
    web_search?: Array<{ link?: string; title?: string }>
  }

  const content = data.choices?.[0]?.message?.content?.trim() || 'No response'
  const citations: string[] = []

  // Extract citations from web_search results
  for (const entry of data.web_search || []) {
    if (typeof entry.link === 'string' && entry.link.trim()) {
      citations.push(entry.link.trim())
    }
  }

  return { content, citations }
}

// ---------------------------------------------------------------------------
// MiniMax
// ---------------------------------------------------------------------------

async function runMiniMaxSearch(args: {
  query: string
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
  model: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}/text/chatcompletion_v2`

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'user', content: args.query }],
      plugins: ['plugin_web_search']
    })
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`MiniMax Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: { content?: string }
    }>
    web_search?: Array<{ url?: string; title?: string }>
  }

  const content = data.choices?.[0]?.message?.content?.trim() || 'No response'
  const citations: string[] = []

  for (const entry of data.web_search || []) {
    if (typeof entry.url === 'string' && entry.url.trim()) {
      citations.push(entry.url.trim())
    }
  }

  return { content, citations }
}

// ---------------------------------------------------------------------------
// GPT (OpenAI) — uses gpt-4o-search-preview with built-in web search
// ---------------------------------------------------------------------------

async function runGptSearch(args: {
  query: string
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
  model: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'user', content: args.query }]
    })
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`GPT Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string
        annotations?: Array<{
          type?: string
          url?: string
        }>
      }
    }>
  }

  const message = data.choices?.[0]?.message
  const content = message?.content?.trim() || 'No response'
  const citations: string[] = []

  for (const annotation of message?.annotations || []) {
    if (annotation.type === 'url_citation' && typeof annotation.url === 'string' && annotation.url.trim()) {
      citations.push(annotation.url.trim())
    }
  }

  return { content, citations }
}

// ---------------------------------------------------------------------------
// Claude (Anthropic) — uses server-side web_search tool
// ---------------------------------------------------------------------------

async function runClaudeSearch(args: {
  query: string
  timeoutSeconds: number
  apiKey: string
  baseUrl: string
  model: string
}) {
  const endpoint = `${args.baseUrl.replace(/\/$/, '')}/v1/messages`

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 4096,
      tools: [{
        type: 'server_tool',
        name: 'web_search_20250305'
      }],
      messages: [{ role: 'user', content: args.query }]
    })
  }, args.timeoutSeconds)

  if (!response.ok) {
    throw new Error(`Claude Search API error (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json() as {
    content?: Array<{
      type: string
      text?: string
      search_results?: Array<{ url?: string; title?: string }>
    }>
  }

  let content = ''
  const citations: string[] = []

  for (const block of data.content || []) {
    if (block.type === 'text' && block.text) {
      content += (content ? '\n\n' : '') + block.text
    }
    if (block.type === 'web_search_tool_result') {
      for (const result of block.search_results || []) {
        if (typeof result.url === 'string' && result.url.trim()) {
          citations.push(result.url.trim())
        }
      }
    }
  }

  return { content: content.trim() || 'No response', citations }
}

// ---------------------------------------------------------------------------
// Provider resolution — auto-detects from aiSources
// ---------------------------------------------------------------------------

function resolveSearchProvider(
  search: ReturnType<typeof getProviderRuntime>['web']['search'],
  explicitProvider?: unknown
): {
  provider: WebSearchProvider
  apiKey?: string
} {
  // If user explicitly set a provider in config, honor it exactly.
  const explicitlyConfiguredProvider = typeof explicitProvider === 'string'
    ? explicitProvider as WebSearchProvider
    : undefined

  if (explicitlyConfiguredProvider) {
    if (explicitlyConfiguredProvider === 'duckduckgo') {
      return { provider: 'duckduckgo' }
    }

    const braveKey = normalizeApiKey(search.apiKey || process.env.BRAVE_API_KEY)
    const perplexityKey = normalizeApiKey(search.perplexity.apiKey || process.env.PERPLEXITY_API_KEY)
    const kimiKey = normalizeApiKey(search.kimi.apiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || getAiSourceApiKey('kimi'))
    const glmKey = normalizeApiKey(search.glm.apiKey || process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || getAiSourceApiKey('zhipu'))
    const minimaxKey = normalizeApiKey(search.minimax.apiKey || process.env.MINIMAX_API_KEY || getAiSourceApiKey('minimax'))
    const gptKey = normalizeApiKey(search.gpt.apiKey || process.env.OPENAI_API_KEY || resolveGptApiKeyFromSources())
    const claudeKey = normalizeApiKey(search.claude.apiKey || process.env.ANTHROPIC_API_KEY || resolveClaudeApiKeyFromSources())

    const keyMap: Record<string, string> = {
      brave: braveKey,
      perplexity: perplexityKey,
      kimi: kimiKey,
      glm: glmKey,
      minimax: minimaxKey,
      gpt: gptKey,
      claude: claudeKey
    }

    const key = keyMap[explicitlyConfiguredProvider]
    if (key) {
      return { provider: explicitlyConfiguredProvider, apiKey: key }
    }
    // Explicit provider but no key → fall through to auto-detect
  }

  // Auto-detect: check aiSources for providers that support web search
  const kimiKey = normalizeApiKey(getAiSourceApiKey('kimi') || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || search.kimi.apiKey)
  if (kimiKey) return { provider: 'kimi', apiKey: kimiKey }

  const glmKey = normalizeApiKey(getAiSourceApiKey('zhipu') || process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || search.glm.apiKey)
  if (glmKey) return { provider: 'glm', apiKey: glmKey }

  const minimaxKey = normalizeApiKey(getAiSourceApiKey('minimax') || process.env.MINIMAX_API_KEY || search.minimax.apiKey)
  if (minimaxKey) return { provider: 'minimax', apiKey: minimaxKey }

  const claudeKey = normalizeApiKey(resolveClaudeApiKeyFromSources() || process.env.ANTHROPIC_API_KEY || search.claude.apiKey)
  if (claudeKey) return { provider: 'claude', apiKey: claudeKey }

  const gptKey = normalizeApiKey(resolveGptApiKeyFromSources() || process.env.OPENAI_API_KEY || search.gpt.apiKey)
  if (gptKey) return { provider: 'gpt', apiKey: gptKey }

  // Legacy standalone search APIs
  const braveKey = normalizeApiKey(search.apiKey || process.env.BRAVE_API_KEY)
  if (braveKey) return { provider: 'brave', apiKey: braveKey }

  const perplexityKey = normalizeApiKey(search.perplexity.apiKey || process.env.PERPLEXITY_API_KEY)
  if (perplexityKey) return { provider: 'perplexity', apiKey: perplexityKey }

  return { provider: 'duckduckgo' }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function executeWebSearch(args: {
  query: string
  count?: number
  country?: string
  language?: string
  freshness?: string
  domainFilter?: string[]
}): Promise<SearchPayload> {
  const config = getConfig()
  const runtime = getProviderRuntime()
  const { search } = runtime.web

  if (!search.enabled) {
    throw new Error('Web search is disabled in settings.')
  }

  const explicitProvider = (config.tools as any)?.web?.search?.provider
  const { provider, apiKey } = resolveSearchProvider(search, explicitProvider)

  const count = Math.max(1, Math.min(10, Math.floor(args.count || search.maxResults)))
  const country = args.country?.trim().split(/[-_]/)[0].slice(0, 2).toUpperCase() || undefined
  const language = args.language?.trim().split(/[-_]/)[0].slice(0, 2).toLowerCase() || undefined
  const freshness = args.freshness?.trim().toLowerCase()
  const domainFilter = (args.domainFilter || []).map((entry) => entry.trim()).filter(Boolean)

  const cacheKey = buildCacheKey([
    provider,
    args.query,
    count,
    country,
    language,
    freshness,
    domainFilter.join(',')
  ])
  const cached = readCachedPayload(cacheKey)
  if (cached) return cached

  const start = Date.now()

  // AI search providers (content + citations)
  if (provider === 'kimi' || provider === 'glm' || provider === 'minimax' || provider === 'gpt' || provider === 'claude') {
    const runFn = {
      kimi: () => runKimiSearch({
        query: args.query,
        timeoutSeconds: search.timeoutSeconds,
        apiKey: apiKey || '',
        baseUrl: search.kimi.baseUrl,
        model: search.kimi.model
      }),
      glm: () => runGlmSearch({
        query: args.query,
        timeoutSeconds: search.timeoutSeconds,
        apiKey: apiKey || '',
        baseUrl: search.glm.baseUrl,
        model: search.glm.model
      }),
      minimax: () => runMiniMaxSearch({
        query: args.query,
        timeoutSeconds: search.timeoutSeconds,
        apiKey: apiKey || '',
        baseUrl: search.minimax.baseUrl,
        model: search.minimax.model
      }),
      gpt: () => runGptSearch({
        query: args.query,
        timeoutSeconds: search.timeoutSeconds,
        apiKey: apiKey || '',
        baseUrl: search.gpt.baseUrl,
        model: search.gpt.model
      }),
      claude: () => runClaudeSearch({
        query: args.query,
        timeoutSeconds: search.timeoutSeconds,
        apiKey: apiKey || '',
        baseUrl: search.claude.baseUrl,
        model: search.claude.model
      })
    }[provider]

    const result = await runFn()
    const payload: SearchPayload = {
      query: args.query,
      provider,
      tookMs: Date.now() - start,
      content: result.content,
      citations: result.citations
    }
    writeCachedPayload(cacheKey, search.cacheTtlMinutes, payload)
    return payload
  }

  // Traditional search providers (results list)
  if (provider === 'duckduckgo') {
    const results = await runDuckDuckGoSearch({
      query: args.query,
      count,
      country,
      language,
      freshness,
      domainFilter,
      timeoutSeconds: search.timeoutSeconds
    })

    const payload: SearchPayload = {
      query: args.query,
      provider,
      count: results.length,
      tookMs: Date.now() - start,
      results
    }
    writeCachedPayload(cacheKey, search.cacheTtlMinutes, payload)
    return payload
  }

  if (provider === 'perplexity') {
    const results = await runPerplexitySearch({
      query: args.query,
      count,
      country,
      language,
      freshness,
      domainFilter,
      timeoutSeconds: search.timeoutSeconds,
      apiKey: apiKey || '',
      baseUrl: search.perplexity.baseUrl
    })

    const payload: SearchPayload = {
      query: args.query,
      provider,
      count: results.length,
      tookMs: Date.now() - start,
      results
    }
    writeCachedPayload(cacheKey, search.cacheTtlMinutes, payload)
    return payload
  }

  // Brave (default for legacy)
  const results = await runBraveSearch({
    query: args.query,
    count,
    country,
    language,
    freshness,
    timeoutSeconds: search.timeoutSeconds,
    apiKey: apiKey || ''
  })

  const payload: SearchPayload = {
    query: args.query,
    provider,
    count: results.length,
    tookMs: Date.now() - start,
    results
  }
  writeCachedPayload(cacheKey, search.cacheTtlMinutes, payload)
  return payload
}

export const __testing = {
  DUCKDUCKGO_FRESHNESS_MAP,
  BRAVE_FRESHNESS_MAP,
  SEARCH_CACHE,
  buildCacheKey,
  buildDuckDuckGoQuery,
  resolveDuckDuckGoHref,
  extractKimiCitations,
  extractKimiMessageText,
  buildKimiToolResultContent,
  resolveSiteName
}
