/**
 * OpenAI Codex OAuth Provider
 *
 * Implements OAuth 2.0 PKCE flow for OpenAI (ChatGPT) authentication.
 * Uses the same OAuth flow as the official Codex CLI.
 *
 * Authentication Flow:
 * 1. Start localhost callback server on port 1455
 * 2. Open browser to auth.openai.com for user login
 * 3. Receive authorization code via callback
 * 4. Exchange code for id_token, access_token, refresh_token
 * 5. Exchange id_token for API key (sk-... format)
 * 6. Use API key for OpenAI API calls
 */

import http from 'http'
import crypto from 'crypto'
import { app, shell } from 'electron'
import type {
  OAuthAISourceProvider,
  ProviderResult
} from '../../../../shared/interfaces'
import type {
  AISourceType,
  AISourcesConfig,
  BackendRequestConfig,
  OAuthSourceConfig,
  OAuthStartResult,
  OAuthCompleteResult,
  AISourceUserInfo
} from '../../../../shared/types'
// ============================================================================
// PKCE (RFC 7636) utilities for OAuth
// ============================================================================

function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest())
}

// ============================================================================
// Constants
// ============================================================================

/**
 * OpenAI Codex CLI public OAuth Client ID
 * Source: codex-rs/core/src/auth.rs:734
 */
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/**
 * OpenAI OAuth endpoints
 */
const OPENAI_ISSUER = 'https://auth.openai.com'
const OPENAI_AUTHORIZE_URL = `${OPENAI_ISSUER}/oauth/authorize`
const OPENAI_TOKEN_URL = `${OPENAI_ISSUER}/oauth/token`

/**
 * Callback server configuration
 */
const CALLBACK_PORT = 1455
const OPENAI_REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`

/**
 * OAuth scopes
 */
const OPENAI_SCOPES = 'openid profile email offline_access'

/**
 * OpenAI API
 */
const OPENAI_API_BASE = 'https://api.openai.com/v1'
const OPENAI_MODELS_URL = `${OPENAI_API_BASE}/models`

/**
 * ChatGPT subscription users use a different API endpoint
 * Source: codex-rs/core/src/model_provider_info.rs:148-152
 */
const CHATGPT_API_BASE = 'https://chatgpt.com/backend-api/codex'

/**
 * Preferred model lists for Codex/OpenAI integrations.
 * Keep these aligned with the current Codex model picker instead of older o-series defaults.
 */
const CHATGPT_CODEX_MODELS = [
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.2',
  'gpt-5.1-codex-mini'
]

const OPENAI_API_CODEX_MODELS = [
  ...CHATGPT_CODEX_MODELS,
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-codex',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano'
]

/**
 * Token refresh threshold (refresh when less than 5 minutes remaining)
 */
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Auth timeout (5 minutes)
 */
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Port bind retry configuration (matches Codex CLI server.rs:488-489)
 */
const MAX_BIND_ATTEMPTS = 10
const BIND_RETRY_DELAY_MS = 200

// ============================================================================
// Types
// ============================================================================

interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
}

interface ApiKeyExchangeResponse {
  access_token: string
}

// ============================================================================
// State
// ============================================================================

interface PendingAuth {
  state: string
  codeVerifier: string
  server: http.Server
  callbackPromise: Promise<{ code: string; state: string }>
  resolveCallback?: (value: { code: string; state: string }) => void
  rejectCallback?: (error: Error) => void
  timeoutTimer: ReturnType<typeof setTimeout>
}

let pendingAuth: PendingAuth | null = null

// ============================================================================
// OpenAI Codex Provider Implementation
// ============================================================================

class OpenAICodexProvider implements OAuthAISourceProvider {
  readonly type: AISourceType = 'openai-codex'
  readonly displayName = 'OpenAI'

  /**
   * Check if OpenAI Codex is configured
   */
  isConfigured(config: AISourcesConfig): boolean {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    return !!(providerConfig?.loggedIn && providerConfig?.accessToken)
  }

  /**
   * Get backend configuration for API calls
   */
  getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.loggedIn || !providerConfig?.accessToken) {
      return null
    }

    const token = providerConfig.accessToken
    const isApiKey = token.startsWith('sk-')
    const model = this.resolveModelForToken(token, providerConfig.model, providerConfig.availableModels)

    if (isApiKey) {
      // API key user: use standard OpenAI API
      return {
        url: `${OPENAI_API_BASE}/responses`,
        key: token,
        model,
        apiType: 'responses'
      }
    } else {
      // ChatGPT login uses the ChatGPT Codex Responses endpoint, not /v1/responses.
      return {
        url: `${CHATGPT_API_BASE}/responses`,
        key: token,
        model,
        apiType: 'responses',
        headers: {
          'ChatGPT-Account-ID': providerConfig.chatgptAccountId || ''
        }
      }
    }
  }

  /**
   * Get current model
   */
  getCurrentModel(config: AISourcesConfig): string | null {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.accessToken) {
      return providerConfig?.model || null
    }
    return this.resolveModelForToken(
      providerConfig.accessToken,
      providerConfig.model,
      providerConfig.availableModels
    )
  }

  /**
   * Get available models from OpenAI API
   */
  async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.accessToken) {
      return this.getChatGPTDefaultModels()
    }

    const isApiKey = providerConfig.accessToken.startsWith('sk-')

    // ChatGPT subscription users (access_token, not API key) can't use /v1/models
    if (!isApiKey) {
      return this.normalizeAvailableModels(providerConfig.availableModels, false)
    }

    try {
      const response = await fetch(OPENAI_MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${providerConfig.accessToken}`
        }
      })

      if (!response.ok) {
        console.warn('[OpenAICodex] Failed to fetch models:', response.status)
        return this.normalizeAvailableModels(providerConfig.availableModels, true)
      }

      const data = await response.json()
      const models = data.data || []
      if (!Array.isArray(models) || models.length === 0) {
        return this.normalizeAvailableModels(providerConfig.availableModels, true)
      }

      // Filter to chat-capable models
      const chatModels = models
        .map((m: any) => m.id as string)
        .filter((id: string) =>
          !id.includes('embedding') &&
          !id.includes('whisper') &&
          !id.includes('tts') &&
          !id.includes('dall-e') &&
          !id.includes('moderation')
        )

      return this.normalizeAvailableModels(chatModels, true)
    } catch (error) {
      console.error('[OpenAICodex] Error fetching models:', error)
      return this.normalizeAvailableModels(providerConfig.availableModels, true)
    }
  }

  /**
   * Default models for API-key based OpenAI usage
   */
  private getApiKeyDefaultModels(): string[] {
    return [...OPENAI_API_CODEX_MODELS]
  }

  /**
   * Default models for ChatGPT-backed Codex usage
   */
  private getChatGPTDefaultModels(): string[] {
    return [...CHATGPT_CODEX_MODELS]
  }

  /**
   * ChatGPT-backed Codex only accepts a narrower model set than the standard API.
   */
  private resolveModelForToken(
    token: string,
    configuredModel?: string | null,
    availableModels?: string[]
  ): string {
    const supportedModels = this.normalizeAvailableModels(availableModels, token.startsWith('sk-'))

    if (configuredModel && supportedModels.includes(configuredModel)) {
      return configuredModel
    }

    return supportedModels[0]
  }

  private normalizeAvailableModels(models: string[] | undefined, isApiKey: boolean): string[] {
    const preferredModels = isApiKey ? this.getApiKeyDefaultModels() : this.getChatGPTDefaultModels()
    const seen = new Set<string>()
    const requestedModels = Array.isArray(models) ? models : []

    const result = preferredModels.filter(modelId => {
      if (!requestedModels.includes(modelId) || seen.has(modelId)) {
        return false
      }
      seen.add(modelId)
      return true
    })

    if (isApiKey) {
      for (const modelId of requestedModels) {
        if (!modelId.startsWith('gpt-5') || seen.has(modelId)) {
          continue
        }
        seen.add(modelId)
        result.push(modelId)
      }
    }

    if (result.length > 0) {
      return result
    }

    // Fall back to the preferred Codex-oriented model set if the API response or cached config
    // only contains legacy models such as gpt-4.1/o3/o4.
    return [...preferredModels]
  }

  /**
   * Get user info from config
   */
  getUserInfo(config: AISourcesConfig): AISourceUserInfo | null {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    return providerConfig?.user || null
  }

  // ========== OAuth Flow ==========

  /**
   * Start OAuth login flow
   */
  async startLogin(): Promise<ProviderResult<OAuthStartResult>> {
    try {
      console.log('[OpenAICodex] Starting OAuth PKCE flow')

      // Clean up any previous pending auth
      this.cleanupPendingAuth()

      // Generate PKCE codes
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = generateCodeChallenge(codeVerifier)

      // Generate random state for CSRF protection
      const state = crypto.randomBytes(32).toString('base64url')

      // Start callback server
      const server = await this.startCallbackServer()

      // Create callback promise
      let resolveCallback: ((value: { code: string; state: string }) => void) | undefined
      let rejectCallback: ((error: Error) => void) | undefined
      const callbackPromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
        resolveCallback = resolve
        rejectCallback = reject
      })

      // Set timeout
      const timeoutTimer = setTimeout(() => {
        console.warn('[OpenAICodex] Auth timeout, cleaning up')
        rejectCallback?.(new Error('Authentication timed out'))
        this.cleanupPendingAuth()
      }, AUTH_TIMEOUT_MS)

      // Store pending auth
      pendingAuth = {
        state,
        codeVerifier,
        server,
        callbackPromise,
        resolveCallback,
        rejectCallback,
        timeoutTimer
      }

      // Set up request handler
      server.on('request', (req, res) => {
        if (!req.url?.startsWith('/auth/callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
          return
        }

        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`)
        const code = url.searchParams.get('code')
        const callbackState = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        if (error) {
          const message = errorDescription || error
          console.error('[OpenAICodex] OAuth callback error:', message)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(buildCallbackPage('error', 'loginFailed', '', message))
          pendingAuth?.rejectCallback?.(new Error(message))
          return
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(buildCallbackPage('error', 'error', 'missingCode'))
          return
        }

        // Return success page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(buildCallbackPage('success', 'loginSuccess', 'successMessage'))

        // Resolve the callback promise
        pendingAuth?.resolveCallback?.({ code, state: callbackState || '' })
      })

      // Build authorization URL
      const authUrl = this.buildAuthorizeUrl(codeChallenge, state)

      // Open browser
      await shell.openExternal(authUrl)

      console.log('[OpenAICodex] OAuth flow started, waiting for callback')

      return {
        success: true,
        data: {
          loginUrl: authUrl,
          state
        }
      }
    } catch (error) {
      console.error('[OpenAICodex] Start login error:', error)
      this.cleanupPendingAuth()
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start login'
      }
    }
  }

  /**
   * Complete OAuth login by waiting for callback
   */
  async completeLogin(state: string): Promise<ProviderResult<OAuthCompleteResult>> {
    if (!pendingAuth || pendingAuth.state !== state) {
      return {
        success: false,
        error: 'No pending authentication or state mismatch'
      }
    }

    try {
      console.log('[OpenAICodex] Waiting for OAuth callback...')

      // Wait for the callback
      const { code, state: callbackState } = await pendingAuth.callbackPromise

      // Verify state
      if (callbackState !== pendingAuth.state) {
        this.cleanupPendingAuth()
        return {
          success: false,
          error: 'State mismatch - possible CSRF attack'
        }
      }

      const codeVerifier = pendingAuth.codeVerifier

      // Clean up server (no longer needed)
      this.cleanupPendingAuth()

      console.log('[OpenAICodex] Got authorization code, exchanging for tokens...')

      // Step 1: Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code, codeVerifier)

      console.log('[OpenAICodex] Got tokens, exchanging for API key...')

      // Step 2: Try to exchange id_token for API key (best-effort)
      let apiKey: string | null = null
      try {
        apiKey = await this.obtainApiKey(tokens.id_token)
        console.log('[OpenAICodex] Got API key via token exchange')
      } catch (err) {
        console.warn('[OpenAICodex] API key exchange failed, using access_token fallback:', err)
      }

      // Use API key if available, otherwise fall back to OAuth access_token
      const bearerToken = apiKey || tokens.access_token
      const isApiKey = bearerToken.startsWith('sk-')

      // Parse id_token to get user info
      const userInfo = this.parseIdToken(tokens.id_token)

      // Extract chatgptAccountId from JWT auth claims (needed for ChatGPT backend API)
      const authClaims = this.parseIdTokenAuthClaims(tokens.id_token)
      const chatgptAccountId = authClaims.chatgpt_account_id || ''

      // Fetch available models (only for API key users; ChatGPT users can't use /v1/models)
      let models: string[] = isApiKey
        ? this.getApiKeyDefaultModels()
        : this.getChatGPTDefaultModels()
      if (isApiKey) {
        try {
          const modelsResponse = await fetch(OPENAI_MODELS_URL, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
          })
          if (modelsResponse.ok) {
            const data = await modelsResponse.json()
            const allModels = (data.data || [])
              .map((m: any) => m.id as string)
              .filter((id: string) =>
                !id.includes('embedding') &&
                !id.includes('whisper') &&
                !id.includes('tts') &&
                !id.includes('dall-e') &&
                !id.includes('moderation')
              )
            models = this.normalizeAvailableModels(allModels, true)
          }
        } catch {
          // Use defaults
        }
      }

      const defaultModel = models[0] || (isApiKey
        ? this.getApiKeyDefaultModels()[0]
        : this.getChatGPTDefaultModels()[0])

      console.log('[OpenAICodex] Login successful for:', userInfo.email || 'unknown')

      const result: OAuthCompleteResult & {
        _tokenData: { accessToken: string; refreshToken: string; expiresAt: number; uid: string }
        _availableModels: string[]
        _modelNames: Record<string, string>
        _defaultModel: string
        _chatgptAccountId: string
      } = {
        success: true,
        user: {
          name: userInfo.email || 'OpenAI User',
          uid: userInfo.email || ''
        },
        _tokenData: {
          accessToken: bearerToken,
          refreshToken: tokens.refresh_token,
          expiresAt: userInfo.exp ? userInfo.exp * 1000 : Date.now() + 60 * 60 * 1000, // Default 1 hour
          uid: userInfo.email || ''
        },
        _availableModels: models,
        _modelNames: this.getModelDisplayNames(models),
        _defaultModel: defaultModel,
        _chatgptAccountId: chatgptAccountId
      }

      return { success: true, data: result }
    } catch (error) {
      console.error('[OpenAICodex] Complete login error:', error)
      this.cleanupPendingAuth()
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete login'
      }
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(): Promise<ProviderResult<void>> {
    return { success: true }
  }

  /**
   * Check if token is valid
   */
  async checkToken(): Promise<ProviderResult<{ valid: boolean; expiresIn?: number }>> {
    return { success: true, data: { valid: true } }
  }

  /**
   * Logout
   */
  async logout(): Promise<ProviderResult<void>> {
    this.cleanupPendingAuth()
    return { success: true }
  }

  // ========== Token Management ==========

  /**
   * Check token validity with config
   */
  checkTokenWithConfig(config: AISourcesConfig): { valid: boolean; expiresIn?: number; needsRefresh: boolean } {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.accessToken) {
      return { valid: false, needsRefresh: false }
    }

    const tokenExpires = providerConfig.tokenExpires || 0
    const now = Date.now()
    const needsRefresh = tokenExpires > 0 && tokenExpires <= now + TOKEN_REFRESH_THRESHOLD_MS

    return { valid: true, needsRefresh }
  }

  /**
   * Refresh token with config
   * Full chain: refresh_token → new tokens → token exchange → new api_key
   */
  async refreshTokenWithConfig(config: AISourcesConfig): Promise<ProviderResult<{
    accessToken: string
    refreshToken: string
    expiresAt: number
    chatgptAccountId?: string
  }>> {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.refreshToken) {
      return { success: false, error: 'No refresh token' }
    }

    try {
      console.log('[OpenAICodex] Refreshing token...')

      // Step 1: Refresh tokens
      const response = await fetch(OPENAI_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: providerConfig.refreshToken,
          client_id: OPENAI_CLIENT_ID
        })
      })

      if (!response.ok) {
        const body = await response.text()
        console.error('[OpenAICodex] Token refresh failed:', response.status, body)
        return { success: false, error: `Token refresh failed: ${response.status}` }
      }

      const tokens: TokenResponse = await response.json()

      // Step 2: Try to exchange new id_token for API key (best-effort)
      let apiKey: string | null = null
      try {
        apiKey = await this.obtainApiKey(tokens.id_token)
      } catch (err) {
        console.warn('[OpenAICodex] Token refresh: API key exchange failed, using access_token:', err)
      }

      // Use API key if available, otherwise fall back to OAuth access_token
      const bearerToken = apiKey || tokens.access_token

      // Parse new token for expiry
      const tokenInfo = this.parseIdToken(tokens.id_token)
      const expiresAt = tokenInfo.exp ? tokenInfo.exp * 1000 : Date.now() + 60 * 60 * 1000

      // Extract updated chatgptAccountId from new id_token
      const authClaims = this.parseIdTokenAuthClaims(tokens.id_token)
      const chatgptAccountId = authClaims.chatgpt_account_id || ''

      console.log('[OpenAICodex] Token refresh successful')

      return {
        success: true,
        data: {
          accessToken: bearerToken,
          refreshToken: tokens.refresh_token,
          expiresAt,
          chatgptAccountId
        }
      }
    } catch (error) {
      console.error('[OpenAICodex] Token refresh error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed'
      }
    }
  }

  /**
   * Refresh config (fetch updated models)
   */
  async refreshConfig(config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
    const providerConfig = config['openai-codex'] as OAuthSourceConfig | undefined
    if (!providerConfig?.accessToken) {
      return { success: false, error: 'Not logged in' }
    }

    try {
      const models = await this.getAvailableModels(config)
      const model = this.resolveModelForToken(providerConfig.accessToken, providerConfig.model)
      return {
        success: true,
        data: {
          'openai-codex': {
            ...providerConfig,
            model,
            availableModels: models,
            modelNames: this.getModelDisplayNames(models)
          }
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // ========== Helper Methods ==========

  /**
   * Build OAuth authorize URL
   */
  private buildAuthorizeUrl(codeChallenge: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OPENAI_CLIENT_ID,
      redirect_uri: OPENAI_REDIRECT_URI,
      scope: OPENAI_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      state
    })
    return `${OPENAI_AUTHORIZE_URL}?${params.toString()}`
  }

  /**
   * Start the localhost callback server
   * Handles port conflicts by attempting to cancel previous servers
   */
  private async startCallbackServer(): Promise<http.Server> {
    let cancelAttempted = false
    let attempts = 0

    while (attempts < MAX_BIND_ATTEMPTS) {
      try {
        return await new Promise<http.Server>((resolve, reject) => {
          const server = http.createServer()
          server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
              reject(err)
            } else {
              reject(new Error(`Failed to start callback server: ${err.message}`))
            }
          })
          server.listen(CALLBACK_PORT, '127.0.0.1', () => {
            resolve(server)
          })
        })
      } catch (err: any) {
        attempts++
        if (err.code === 'EADDRINUSE') {
          // Try to cancel previous login server (like Codex CLI does)
          if (!cancelAttempted) {
            cancelAttempted = true
            try {
              await this.sendCancelRequest()
            } catch {
              // Ignore cancel errors
            }
          }
          if (attempts >= MAX_BIND_ATTEMPTS) {
            throw new Error(`Port ${CALLBACK_PORT} is already in use. Close any other application using this port and try again.`)
          }
          await new Promise(resolve => setTimeout(resolve, BIND_RETRY_DELAY_MS))
        } else {
          throw err
        }
      }
    }

    throw new Error(`Failed to start callback server after ${MAX_BIND_ATTEMPTS} attempts`)
  }

  /**
   * Send cancel request to a potentially running previous login server
   */
  private sendCancelRequest(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: CALLBACK_PORT,
        path: '/cancel',
        method: 'GET',
        timeout: 2000
      }, () => resolve())
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Cancel request timed out'))
      })
      req.end()
    })
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    const response = await fetch(OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OPENAI_REDIRECT_URI,
        client_id: OPENAI_CLIENT_ID,
        code_verifier: codeVerifier
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Token exchange failed (${response.status}): ${body}`)
    }

    return await response.json()
  }

  /**
   * Exchange id_token for an OpenAI API key
   * Uses OAuth 2.0 Token Exchange (RFC 8693)
   */
  private async obtainApiKey(idToken: string): Promise<string> {
    const response = await fetch(OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: OPENAI_CLIENT_ID,
        requested_token: 'openai-api-key',
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token'
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`API key exchange failed (${response.status}): ${body}`)
    }

    const data: ApiKeyExchangeResponse = await response.json()
    return data.access_token
  }

  /**
   * Parse JWT id_token to extract auth claims from 'https://api.openai.com/auth'
   * (Same as Codex CLI's jwt_auth_claims in server.rs)
   */
  private parseIdTokenAuthClaims(idToken: string): Record<string, any> {
    try {
      const parts = idToken.split('.')
      if (parts.length < 2) return {}
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload['https://api.openai.com/auth'] || {}
    } catch {
      return {}
    }
  }

  /**
   * Parse JWT id_token to extract user info
   */
  private parseIdToken(idToken: string): { email?: string; exp?: number; planType?: string } {
    try {
      const parts = idToken.split('.')
      if (parts.length < 2) return {}

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      // OpenAI stores custom claims under 'https://api.openai.com/auth'
      const authClaims = payload['https://api.openai.com/auth'] || {}

      return {
        email: payload.email || authClaims.email,
        exp: payload.exp,
        planType: authClaims.chatgpt_plan_type
      }
    } catch {
      return {}
    }
  }

  /**
   * Clean up pending auth state
   */
  private cleanupPendingAuth(): void {
    if (pendingAuth) {
      clearTimeout(pendingAuth.timeoutTimer)
      try {
        pendingAuth.server.close()
      } catch {
        // Ignore close errors
      }
      pendingAuth = null
    }
  }

  /**
   * Get model display names
   */
  private getModelDisplayNames(models: string[]): Record<string, string> {
    const displayNames: Record<string, string> = {
      'gpt-5.4': 'GPT-5.4',
      'gpt-5.3-codex': 'GPT-5.3-Codex',
      'gpt-5.2-codex': 'GPT-5.2-Codex',
      'gpt-5.2': 'GPT-5.2',
      'gpt-5.1-codex-max': 'GPT-5.1-Codex-Max',
      'gpt-5.1-codex-mini': 'GPT-5.1-Codex-Mini',
      'gpt-5.1-codex': 'GPT-5.1-Codex',
      'gpt-5.1': 'GPT-5.1',
      'gpt-5-codex': 'GPT-5-Codex',
      'gpt-5': 'GPT-5',
      'gpt-5-mini': 'GPT-5-Mini',
      'gpt-5-nano': 'GPT-5-Nano',
      'codex-mini-latest': 'Codex Mini'
    }

    const result: Record<string, string> = {}
    for (const model of models) {
      result[model] = displayNames[model] || model
    }
    return result
  }
}

// ============================================================================
// Utility
// ============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const callbackPageI18n: Record<string, Record<string, string>> = {
  en: {
    loginSuccess: 'Login Successful!',
    loginFailed: 'Login Failed',
    error: 'Error',
    successMessage: 'You can close this window and return to SkillsFan.',
    missingCode: 'Missing authorization code.',
    closeNow: 'You can close this window now.',
    closeIn: 'This window will close in {s}s...',
  },
  'zh-CN': {
    loginSuccess: '登录成功！',
    loginFailed: '登录失败',
    error: '错误',
    successMessage: '您可以关闭此窗口并返回 SkillsFan。',
    missingCode: '缺少授权码。',
    closeNow: '您现在可以关闭此窗口。',
    closeIn: '此窗口将在 {s} 秒后关闭...',
  },
  'zh-TW': {
    loginSuccess: '登入成功！',
    loginFailed: '登入失敗',
    error: '錯誤',
    successMessage: '您可以關閉此視窗並返回 SkillsFan。',
    missingCode: '缺少授權碼。',
    closeNow: '您現在可以關閉此視窗。',
    closeIn: '此視窗將在 {s} 秒後關閉...',
  },
}

function getCallbackLocale(): string {
  const locale = app.getLocale().toLowerCase()
  if (locale.startsWith('zh')) {
    return locale.includes('tw') || locale.includes('hk') || locale.includes('hant') ? 'zh-TW' : 'zh-CN'
  }
  return 'en'
}

function buildCallbackPage(type: 'success' | 'error', titleKey: string, messageKey: string, rawMessage?: string): string {
  const locale = getCallbackLocale()
  const t = callbackPageI18n[locale] || callbackPageI18n.en
  const title = t[titleKey] || titleKey
  const message = rawMessage || t[messageKey] || messageKey
  const closeNow = t.closeNow
  const closeIn = t.closeIn

  const icon = type === 'success'
    ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
    : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px;text-align:center;max-width:400px;width:90%}
.icon{margin-bottom:20px}
h2{font-size:22px;font-weight:600;color:#111827;margin-bottom:8px}
p{font-size:14px;color:#6b7280;line-height:1.5}
.countdown{margin-top:16px;font-size:12px;color:#9ca3af}
</style></head><body>
<div class="card">
<div class="icon">${icon}</div>
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(message)}</p>
<p class="countdown" id="cd"></p>
</div>
<script>
let s=3;const el=document.getElementById('cd');
const closeNow=${JSON.stringify(closeNow)};
const closeIn=${JSON.stringify(closeIn)};
function tick(){if(s<=0){window.close();el.textContent=closeNow;return}
el.textContent=closeIn.replace('{s}',s);s--;setTimeout(tick,1000)}
tick();
</script></body></html>`
}

// ============================================================================
// Singleton Export
// ============================================================================

let providerInstance: OpenAICodexProvider | null = null

export function getOpenAICodexProvider(): OpenAICodexProvider {
  if (!providerInstance) {
    providerInstance = new OpenAICodexProvider()
  }
  return providerInstance
}

export { OpenAICodexProvider }
