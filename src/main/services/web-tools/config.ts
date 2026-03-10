import type {
  WebFetchConfig,
  WebSearchConfig,
  WebSearchProvider,
  WebToolsConfig
} from '../../shared/types'

export interface NormalizedProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

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
  kimi: NormalizedProviderConfig
  glm: NormalizedProviderConfig
  minimax: NormalizedProviderConfig
  gpt: NormalizedProviderConfig
  claude: NormalizedProviderConfig
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
export const DEFAULT_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
export const DEFAULT_GLM_MODEL = 'glm-4-flash'
export const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.chat/v1'
export const DEFAULT_MINIMAX_MODEL = 'MiniMax-Text-01'
export const DEFAULT_GPT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_GPT_MODEL = 'gpt-4o-search-preview'
export const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com'
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514'
export const DEFAULT_WEB_FETCH_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const VALID_PROVIDERS: WebSearchProvider[] = [
  'duckduckgo', 'brave', 'perplexity', 'kimi', 'glm', 'minimax', 'gpt', 'claude'
]

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.floor(value)))
}

function trimString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeProviderBlock(
  config: { apiKey?: string; baseUrl?: string; model?: string } | undefined,
  defaultBaseUrl: string,
  defaultModel: string
): NormalizedProviderConfig {
  return {
    apiKey: trimString(config?.apiKey),
    baseUrl: trimString(config?.baseUrl, defaultBaseUrl) || defaultBaseUrl,
    model: trimString(config?.model, defaultModel) || defaultModel
  }
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
      kimi: { apiKey: '', baseUrl: DEFAULT_KIMI_BASE_URL, model: DEFAULT_KIMI_MODEL },
      glm: { apiKey: '', baseUrl: DEFAULT_GLM_BASE_URL, model: DEFAULT_GLM_MODEL },
      minimax: { apiKey: '', baseUrl: DEFAULT_MINIMAX_BASE_URL, model: DEFAULT_MINIMAX_MODEL },
      gpt: { apiKey: '', baseUrl: DEFAULT_GPT_BASE_URL, model: DEFAULT_GPT_MODEL },
      claude: { apiKey: '', baseUrl: DEFAULT_CLAUDE_BASE_URL, model: DEFAULT_CLAUDE_MODEL }
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
  const provider = (VALID_PROVIDERS as string[]).includes(config?.provider || '')
    ? config!.provider!
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
    kimi: normalizeProviderBlock(config?.kimi, DEFAULT_KIMI_BASE_URL, DEFAULT_KIMI_MODEL),
    glm: normalizeProviderBlock(config?.glm, DEFAULT_GLM_BASE_URL, DEFAULT_GLM_MODEL),
    minimax: normalizeProviderBlock(config?.minimax, DEFAULT_MINIMAX_BASE_URL, DEFAULT_MINIMAX_MODEL),
    gpt: normalizeProviderBlock(config?.gpt, DEFAULT_GPT_BASE_URL, DEFAULT_GPT_MODEL),
    claude: normalizeProviderBlock(config?.claude, DEFAULT_CLAUDE_BASE_URL, DEFAULT_CLAUDE_MODEL)
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
