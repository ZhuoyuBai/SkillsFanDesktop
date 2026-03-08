import { getConfig } from '../config.service'
import { normalizeWebToolsConfig } from './config'

type FetchPayload = {
  url: string
  finalUrl: string
  title?: string
  contentType: string
  content: string
  fetchedAt: string
  tookMs: number
  cached?: boolean
  truncated?: boolean
}

type CacheEntry = {
  expiresAt: number
  payload: FetchPayload
}

const FETCH_CACHE = new Map<string, CacheEntry>()

const HTML_TAG_REPLACEMENTS: Array<[RegExp, string]> = [
  [/<\/(p|div|section|article|main|aside|header|footer|nav|li|ul|ol|table|tr|br|h[1-6])>/gi, '\n'],
  [/<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' '],
  [/<[^>]+>/g, ' ']
]

function readCachedPayload(key: string): FetchPayload | null {
  const cached = FETCH_CACHE.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    FETCH_CACHE.delete(key)
    return null
  }
  return { ...cached.payload, cached: true }
}

function writeCachedPayload(key: string, ttlMinutes: number, payload: FetchPayload): void {
  if (ttlMinutes <= 0) return

  FETCH_CACHE.set(key, {
    expiresAt: Date.now() + ttlMinutes * 60_000,
    payload
  })
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

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return undefined
  const title = normalizeWhitespace(decodeHtmlEntities(match[1]))
  return title || undefined
}

export function extractReadableContent(body: string, contentType: string): { title?: string; content: string } {
  if (!contentType.includes('text/html')) {
    return { content: normalizeWhitespace(body) }
  }

  let text = body
  for (const [pattern, replacement] of HTML_TAG_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }

  text = decodeHtmlEntities(text)
  text = normalizeWhitespace(text)

  return {
    title: extractTitle(body),
    content: text
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    host === 'localhost'
    || host === '0.0.0.0'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.local')
    || host.endsWith('.internal')
  ) {
    return true
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number)
    if (octets.some((value) => value < 0 || value > 255)) return true
    if (octets[0] === 10 || octets[0] === 127) return true
    if (octets[0] === 169 && octets[1] === 254) return true
    if (octets[0] === 192 && octets[1] === 168) return true
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  }

  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true
  }

  return false
}

export function validatePublicWebUrl(rawUrl: string): URL {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.')
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error('Blocked private or local network URL.')
  }

  return url
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

async function fetchFollowingRedirects(args: {
  url: string
  timeoutSeconds: number
  maxRedirects: number
  userAgent: string
}): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = validatePublicWebUrl(args.url).toString()

  for (let redirectCount = 0; redirectCount <= args.maxRedirects; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': args.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, args.timeoutSeconds)

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === args.maxRedirects) {
        throw new Error('Too many redirects.')
      }

      const location = response.headers.get('location')
      if (!location) {
        throw new Error('Redirect response missing location header.')
      }

      currentUrl = validatePublicWebUrl(new URL(location, currentUrl).toString()).toString()
      continue
    }

    return { response, finalUrl: currentUrl }
  }

  throw new Error('Too many redirects.')
}

function getRuntimeConfig() {
  const config = getConfig()
  return normalizeWebToolsConfig(config.tools)
}

export async function executeWebFetch(args: {
  url: string
  maxChars?: number
}): Promise<FetchPayload> {
  const runtime = getRuntimeConfig()
  const { fetch: fetchConfig } = runtime.web

  if (!fetchConfig.enabled) {
    throw new Error('Web fetch is disabled in settings.')
  }

  const maxChars = Math.max(1000, Math.min(100000, Math.floor(args.maxChars || fetchConfig.maxChars)))
  const cacheKey = `${args.url}|${maxChars}`
  const cached = readCachedPayload(cacheKey)
  if (cached) return cached

  const start = Date.now()
  const { response, finalUrl } = await fetchFollowingRedirects({
    url: args.url,
    timeoutSeconds: fetchConfig.timeoutSeconds,
    maxRedirects: fetchConfig.maxRedirects,
    userAgent: fetchConfig.userAgent
  })

  if (!response.ok) {
    throw new Error(`Web fetch failed (${response.status}): ${await readErrorText(response)}`)
  }

  const contentType = (response.headers.get('content-type') || 'text/plain').toLowerCase()
  if (
    !contentType.includes('text/')
    && !contentType.includes('application/json')
    && !contentType.includes('application/xml')
    && !contentType.includes('application/xhtml+xml')
  ) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }

  let rawText = await response.text()
  if (contentType.includes('application/json')) {
    try {
      rawText = JSON.stringify(JSON.parse(rawText), null, 2)
    } catch {
      rawText = rawText.trim()
    }
  }

  const extracted = extractReadableContent(rawText, contentType)
  const truncated = extracted.content.length > maxChars
  const payload: FetchPayload = {
    url: args.url,
    finalUrl,
    title: extracted.title,
    contentType,
    content: truncated ? extracted.content.slice(0, maxChars) : extracted.content,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - start,
    truncated
  }

  writeCachedPayload(cacheKey, fetchConfig.cacheTtlMinutes, payload)
  return payload
}

export const __testing = {
  FETCH_CACHE,
  extractReadableContent,
  validatePublicWebUrl,
  decodeHtmlEntities
}
