export type WebSearchProvider = 'duckduckgo' | 'brave' | 'perplexity' | 'kimi'

export interface PerplexitySearchConfig {
  apiKey?: string
  baseUrl?: string
}

export interface KimiSearchConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface WebSearchConfig {
  enabled?: boolean
  provider?: WebSearchProvider
  apiKey?: string
  maxResults?: number
  timeoutSeconds?: number
  cacheTtlMinutes?: number
  perplexity?: PerplexitySearchConfig
  kimi?: KimiSearchConfig
}

export interface WebFetchConfig {
  enabled?: boolean
  maxChars?: number
  timeoutSeconds?: number
  cacheTtlMinutes?: number
  maxRedirects?: number
  userAgent?: string
}

export interface WebToolsConfig {
  web?: {
    search?: WebSearchConfig
    fetch?: WebFetchConfig
  }
}
