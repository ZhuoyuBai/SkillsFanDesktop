export type WebSearchProvider = 'duckduckgo' | 'brave' | 'perplexity' | 'kimi' | 'glm' | 'minimax' | 'gpt' | 'claude'

export interface PerplexitySearchConfig {
  apiKey?: string
  baseUrl?: string
}

export interface KimiSearchConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface GlmSearchConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface MiniMaxSearchConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface GptSearchConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface ClaudeSearchConfig {
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
  glm?: GlmSearchConfig
  minimax?: MiniMaxSearchConfig
  gpt?: GptSearchConfig
  claude?: ClaudeSearchConfig
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
