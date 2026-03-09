import type {
  WebFetchConfig,
  WebSearchConfig,
  WebSearchProvider,
  WebToolsConfig
} from '../../shared/types'

export interface NormalizedWebSearchConfig {
  enabled: boolean
  provider: WebSearchProvider
  apiKey: string
  maxResults: number
  timeoutSeconds: number
  cacheTtlMinutes: number
  perplexity: {
    apiKey: string
    baseUrl: string
  }
  kimi: {
    apiKey: string
    baseUrl: string
    model: string
  }
}

export interface NormalizedWebFetchConfig {
  enabled: boolean
  maxChars: number
  timeoutSeconds: number
  cacheTtlMinutes: number
  maxRedirects: number
  userAgent: string
}

export interface NormalizedWebToolsConfig {
  web: {
    search: NormalizedWebSearchConfig
    fetch: NormalizedWebFetchConfig
  }
}

export const DEFAULT_WEB_SEARCH_PROVIDER: WebSearchProvider = 'duckduckgo'
export const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5
export const DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS = 30
export const DEFAULT_WEB_SEARCH_CACHE_TTL_MINUTES = 15
export const DEFAULT_WEB_FETCH_MAX_CHARS = 15000
export const DEFAULT_WEB_FETCH_TIMEOUT_SECONDS = 30
export const DEFAULT_WEB_FETCH_CACHE_TTL_MINUTES = 15
export const DEFAULT_WEB_FETCH_MAX_REDIRECTS = 3
export const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.cn/v1'
export const DEFAULT_KIMI_MODEL = 'moonshot-v1-128k'
export const DEFAULT_PERPLEXITY_BASE_URL = 'https://api.perplexity.ai'
export const DEFAULT_WEB_FETCH_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.floor(value)))
}

function trimString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

export const DEFAULT_WEB_TOOLS_CONFIG: NormalizedWebToolsConfig = {
  web: {
    search: {
      enabled: true,
      provider: DEFAULT_WEB_SEARCH_PROVIDER,
      apiKey: '',
      maxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS,
      timeoutSeconds: DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS,
      cacheTtlMinutes: DEFAULT_WEB_SEARCH_CACHE_TTL_MINUTES,
      perplexity: {
        apiKey: '',
        baseUrl: DEFAULT_PERPLEXITY_BASE_URL
      },
      kimi: {
        apiKey: '',
        baseUrl: DEFAULT_KIMI_BASE_URL,
        model: DEFAULT_KIMI_MODEL
      }
    },
    fetch: {
      enabled: true,
      maxChars: DEFAULT_WEB_FETCH_MAX_CHARS,
      timeoutSeconds: DEFAULT_WEB_FETCH_TIMEOUT_SECONDS,
      cacheTtlMinutes: DEFAULT_WEB_FETCH_CACHE_TTL_MINUTES,
      maxRedirects: DEFAULT_WEB_FETCH_MAX_REDIRECTS,
      userAgent: DEFAULT_WEB_FETCH_USER_AGENT
    }
  }
}

export function normalizeWebSearchConfig(config?: WebSearchConfig): NormalizedWebSearchConfig {
  const provider = config?.provider === 'duckduckgo'
    || config?.provider === 'brave'
    || config?.provider === 'perplexity'
    || config?.provider === 'kimi'
    ? config.provider
    : DEFAULT_WEB_SEARCH_PROVIDER

  return {
    enabled: config?.enabled !== false,
    provider,
    apiKey: trimString(config?.apiKey),
    maxResults: clampInt(config?.maxResults, DEFAULT_WEB_SEARCH_MAX_RESULTS, 1, 10),
    timeoutSeconds: clampInt(config?.timeoutSeconds, DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS, 5, 120),
    cacheTtlMinutes: clampInt(config?.cacheTtlMinutes, DEFAULT_WEB_SEARCH_CACHE_TTL_MINUTES, 0, 1440),
    perplexity: {
      apiKey: trimString(config?.perplexity?.apiKey),
      baseUrl: trimString(config?.perplexity?.baseUrl, DEFAULT_PERPLEXITY_BASE_URL) || DEFAULT_PERPLEXITY_BASE_URL
    },
    kimi: {
      apiKey: trimString(config?.kimi?.apiKey),
      baseUrl: trimString(config?.kimi?.baseUrl, DEFAULT_KIMI_BASE_URL) || DEFAULT_KIMI_BASE_URL,
      model: trimString(config?.kimi?.model, DEFAULT_KIMI_MODEL) || DEFAULT_KIMI_MODEL
    }
  }
}

export function normalizeWebFetchConfig(config?: WebFetchConfig): NormalizedWebFetchConfig {
  return {
    enabled: config?.enabled !== false,
    maxChars: clampInt(config?.maxChars, DEFAULT_WEB_FETCH_MAX_CHARS, 1000, 100000),
    timeoutSeconds: clampInt(config?.timeoutSeconds, DEFAULT_WEB_FETCH_TIMEOUT_SECONDS, 5, 120),
    cacheTtlMinutes: clampInt(config?.cacheTtlMinutes, DEFAULT_WEB_FETCH_CACHE_TTL_MINUTES, 0, 1440),
    maxRedirects: clampInt(config?.maxRedirects, DEFAULT_WEB_FETCH_MAX_REDIRECTS, 0, 10),
    userAgent: trimString(config?.userAgent, DEFAULT_WEB_FETCH_USER_AGENT) || DEFAULT_WEB_FETCH_USER_AGENT
  }
}

export function normalizeWebToolsConfig(config?: WebToolsConfig): NormalizedWebToolsConfig {
  return {
    web: {
      search: normalizeWebSearchConfig(config?.web?.search),
      fetch: normalizeWebFetchConfig(config?.web?.fetch)
    }
  }
}
