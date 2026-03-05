/**
 * Tests for SkillsFan Proxy Provider Factory
 *
 * Verifies the factory function produces correct provider instances
 * and that the provider registry configurations are valid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so mock fns are available before vi.mock (which is hoisted)
const {
  mockStartLogin, mockIsLoggedIn, mockGetUserInfo, mockGetAccessToken,
  mockRefreshToken, mockLogout, mockOnLoginSuccess, mockGetFullAuthState,
  mockFetch
} = vi.hoisted(() => ({
  mockStartLogin: vi.fn(),
  mockIsLoggedIn: vi.fn(),
  mockGetUserInfo: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockRefreshToken: vi.fn(),
  mockLogout: vi.fn(),
  mockOnLoginSuccess: vi.fn(),
  mockGetFullAuthState: vi.fn(),
  mockFetch: vi.fn()
}))

vi.mock('@main/services/skillsfan/auth.service', () => ({
  startLogin: mockStartLogin,
  isLoggedIn: mockIsLoggedIn,
  getUserInfo: mockGetUserInfo,
  getAccessToken: mockGetAccessToken,
  refreshToken: mockRefreshToken,
  logout: mockLogout,
  onLoginSuccess: mockOnLoginSuccess,
  getFullAuthState: mockGetFullAuthState
}))

vi.mock('@main/services/skillsfan/constants', () => ({
  SKILLSFAN_BASE_URL: 'https://test.skills.fan',
  AUTH_TIMEOUT_MS: 10000,
  TOKEN_REFRESH_THRESHOLD_MS: 5 * 60 * 1000
}))

vi.stubGlobal('fetch', mockFetch)

import { createSkillsFanProxyProvider, type SkillsFanProxyConfig } from '@main/services/ai-sources/providers/skillsfan-proxy-provider'
import {
  SKILLSFAN_PROXY_CONFIGS,
  createAllSkillsFanProviders,
  getOAuthToCustomFallbackMap
} from '@main/services/ai-sources/providers/skillsfan-providers'
import { SKILLSFAN_PROVIDER_META } from '@shared/constants/providers'
import type { AISourcesConfig } from '@shared/types'

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createSkillsFanProxyProvider', () => {
  const testConfig: SkillsFanProxyConfig = {
    type: 'glm' as any,
    displayName: 'Test GLM',
    defaultModel: 'glm-5',
    modelFilter: (m) => m.owned_by === 'zhipu',
    customApiFallback: 'zhipu'
  }

  let provider: ReturnType<typeof createSkillsFanProxyProvider>

  beforeEach(() => {
    provider = createSkillsFanProxyProvider(testConfig)
    mockIsLoggedIn.mockReturnValue(false)
    mockGetFullAuthState.mockReturnValue({})
    mockGetUserInfo.mockReturnValue(null)
    mockGetAccessToken.mockResolvedValue(null)
  })

  it('should create provider with correct type and displayName', () => {
    expect(provider.type).toBe('glm')
    expect(provider.displayName).toBe('Test GLM')
  })

  it('should detect configured state from sfIsLoggedIn', () => {
    const config = {} as AISourcesConfig
    expect(provider.isConfigured(config)).toBe(false)

    mockIsLoggedIn.mockReturnValue(true)
    expect(provider.isConfigured(config)).toBe(true)
  })

  it('should detect configured state from provider config', () => {
    const config = { glm: { loggedIn: true } } as unknown as AISourcesConfig
    expect(provider.isConfigured(config)).toBe(true)
  })

  it('should return backend config with correct URL and model', () => {
    mockGetFullAuthState.mockReturnValue({ accessToken: 'test-token' })
    const config = { glm: { model: 'glm-5' } } as unknown as AISourcesConfig

    const backendConfig = provider.getBackendConfig(config)
    expect(backendConfig).toEqual({
      url: 'https://test.skills.fan/api/v1/chat/completions',
      key: 'test-token',
      model: 'glm-5',
      apiType: 'chat_completions'
    })
  })

  it('should use defaultModel when config has no model', () => {
    mockGetFullAuthState.mockReturnValue({ accessToken: 'test-token' })
    const config = { glm: {} } as unknown as AISourcesConfig

    const backendConfig = provider.getBackendConfig(config)
    expect(backendConfig?.model).toBe('glm-5')
  })

  it('should return null backend config when no token', () => {
    mockGetFullAuthState.mockReturnValue({})
    const config = { glm: {} } as unknown as AISourcesConfig

    const backendConfig = provider.getBackendConfig(config)
    expect(backendConfig).toBeNull()
  })

  it('should get current model from config', () => {
    const config = { glm: { model: 'glm-5-plus' } } as unknown as AISourcesConfig
    expect(provider.getCurrentModel(config)).toBe('glm-5-plus')
  })

  it('should fall back to defaultModel for getCurrentModel', () => {
    const config = {} as AISourcesConfig
    expect(provider.getCurrentModel(config)).toBe('glm-5')
  })

  it('should filter models using modelFilter', async () => {
    mockGetAccessToken.mockResolvedValue('test-token')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'glm-5', owned_by: 'zhipu' },
          { id: 'minimax-m1', owned_by: 'minimax' },
          { id: 'glm-5-plus', owned_by: 'zhipu' }
        ]
      })
    })

    const config = {} as AISourcesConfig
    const models = await provider.getAvailableModels(config)
    expect(models).toEqual(['glm-5', 'glm-5-plus'])
  })

  it('should return all models when no modelFilter', async () => {
    const noFilterProvider = createSkillsFanProxyProvider({
      type: 'skillsfan-credits' as any,
      displayName: 'Credits',
      defaultModel: ''
    })

    mockGetAccessToken.mockResolvedValue('test-token')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'glm-5', owned_by: 'zhipu' },
          { id: 'minimax-m1', owned_by: 'minimax' }
        ]
      })
    })

    const models = await noFilterProvider.getAvailableModels({} as AISourcesConfig)
    expect(models).toEqual(['glm-5', 'minimax-m1'])
  })

  it('should fall back to stored models on fetch error', async () => {
    mockGetAccessToken.mockRejectedValue(new Error('No token'))
    const config = {
      glm: { availableModels: ['glm-5'] }
    } as unknown as AISourcesConfig

    const models = await provider.getAvailableModels(config)
    expect(models).toEqual(['glm-5'])
  })

  it('should delegate startLogin to auth.service', async () => {
    mockStartLogin.mockResolvedValue({ success: true })
    const result = await provider.startLogin()

    expect(result.success).toBe(true)
    expect(result.data?.loginUrl).toBe('https://test.skills.fan')
    expect(result.data?.state).toBe('glm-login')
    expect(mockStartLogin).toHaveBeenCalled()
  })

  it('should delegate logout to auth.service', async () => {
    mockLogout.mockResolvedValue(undefined)
    const result = await provider.logout()
    expect(result.success).toBe(true)
    expect(mockLogout).toHaveBeenCalled()
  })

  it('should check token validity via auth.service', async () => {
    mockIsLoggedIn.mockReturnValue(true)
    const result = await provider.checkToken()
    expect(result.data?.valid).toBe(true)
  })

  it('should use custom loginState when provided', () => {
    const customProvider = createSkillsFanProxyProvider({
      type: 'test' as any,
      displayName: 'Test',
      defaultModel: 'test-1',
      loginState: 'custom-login-state'
    })

    mockStartLogin.mockResolvedValue({ success: true })
    customProvider.startLogin().then(result => {
      expect(result.data?.state).toBe('custom-login-state')
    })
  })

  describe('checkTokenWithConfig', () => {
    it('should return invalid when not logged in', () => {
      mockIsLoggedIn.mockReturnValue(false)
      const result = provider.checkTokenWithConfig({} as AISourcesConfig)
      expect(result.valid).toBe(false)
      expect(result.needsRefresh).toBe(false)
    })

    it('should return valid with expiry info when logged in', () => {
      mockIsLoggedIn.mockReturnValue(true)
      const futureTime = Date.now() + 60 * 60 * 1000 // 1 hour from now
      mockGetFullAuthState.mockReturnValue({ tokenExpiresAt: futureTime })

      const result = provider.checkTokenWithConfig({} as AISourcesConfig)
      expect(result.valid).toBe(true)
      expect(result.needsRefresh).toBe(false)
      expect(result.expiresIn).toBeGreaterThan(0)
    })

    it('should flag needsRefresh when token is near expiry', () => {
      mockIsLoggedIn.mockReturnValue(true)
      const nearExpiry = Date.now() + 2 * 60 * 1000 // 2 minutes from now (< 5min threshold)
      mockGetFullAuthState.mockReturnValue({ tokenExpiresAt: nearExpiry })

      const result = provider.checkTokenWithConfig({} as AISourcesConfig)
      expect(result.needsRefresh).toBe(true)
    })
  })

  describe('refreshTokenWithConfig', () => {
    it('should refresh token and return new state', async () => {
      mockRefreshToken.mockResolvedValue({ success: true })
      const newExpiry = Date.now() + 3600 * 1000
      mockGetFullAuthState.mockReturnValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        tokenExpiresAt: newExpiry
      })

      const result = await provider.refreshTokenWithConfig({} as AISourcesConfig)
      expect(result.success).toBe(true)
      expect(result.data?.accessToken).toBe('new-token')
    })

    it('should return error when refresh fails', async () => {
      mockRefreshToken.mockResolvedValue({ success: false })

      const result = await provider.refreshTokenWithConfig({} as AISourcesConfig)
      expect(result.success).toBe(false)
    })
  })

  describe('getUserInfo', () => {
    it('should return user info from auth.service', () => {
      mockGetUserInfo.mockReturnValue({ name: 'Test User', avatar: 'http://avatar.jpg', id: 'user-1' })
      const result = provider.getUserInfo({} as AISourcesConfig)
      expect(result).toEqual({ name: 'Test User', avatar: 'http://avatar.jpg', uid: 'user-1' })
    })

    it('should fall back to config user info', () => {
      mockGetUserInfo.mockReturnValue(null)
      const config = {
        glm: { user: { name: 'Config User', avatar: 'http://config.jpg', uid: 'u-2' } }
      } as unknown as AISourcesConfig
      const result = provider.getUserInfo(config)
      expect(result).toEqual({ name: 'Config User', avatar: 'http://config.jpg', uid: 'u-2' })
    })
  })
})

// ============================================================================
// Config Registry Tests
// ============================================================================

describe('SKILLSFAN_PROXY_CONFIGS', () => {
  it('should have unique type for each config', () => {
    const types = SKILLSFAN_PROXY_CONFIGS.map(c => c.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('should include glm, minimax-oauth, and skillsfan-credits', () => {
    const types = SKILLSFAN_PROXY_CONFIGS.map(c => c.type)
    expect(types).toContain('glm')
    expect(types).toContain('minimax-oauth')
    expect(types).toContain('skillsfan-credits')
  })

  it('should have displayName and type for all configs', () => {
    for (const config of SKILLSFAN_PROXY_CONFIGS) {
      expect(config.type).toBeTruthy()
      expect(config.displayName).toBeTruthy()
    }
  })
})

describe('createAllSkillsFanProviders', () => {
  it('should create one provider per config entry', () => {
    const providers = createAllSkillsFanProviders()
    expect(providers.length).toBe(SKILLSFAN_PROXY_CONFIGS.length)
  })

  it('should create providers with matching types', () => {
    const providers = createAllSkillsFanProviders()
    const providerTypes = providers.map(p => p.type)
    const configTypes = SKILLSFAN_PROXY_CONFIGS.map(c => c.type)
    expect(providerTypes).toEqual(configTypes)
  })
})

describe('getOAuthToCustomFallbackMap', () => {
  it('should generate correct fallback mapping', () => {
    const map = getOAuthToCustomFallbackMap()
    expect(map['glm']).toBe('zhipu')
    expect(map['minimax-oauth']).toBe('minimax')
  })

  it('should not include entries without customApiFallback', () => {
    const map = getOAuthToCustomFallbackMap()
    expect(map['skillsfan-credits']).toBeUndefined()
  })
})

// ============================================================================
// Shared Constants Tests
// ============================================================================

describe('SKILLSFAN_PROVIDER_META', () => {
  it('should have entries matching SKILLSFAN_PROXY_CONFIGS', () => {
    const configTypes = SKILLSFAN_PROXY_CONFIGS.map(c => c.type)
    for (const type of configTypes) {
      expect(SKILLSFAN_PROVIDER_META[type]).toBeDefined()
      expect(SKILLSFAN_PROVIDER_META[type].displayName).toBeTruthy()
    }
  })

  it('should have matching displayNames and defaultModels', () => {
    for (const config of SKILLSFAN_PROXY_CONFIGS) {
      const meta = SKILLSFAN_PROVIDER_META[config.type]
      expect(meta.displayName).toBe(config.displayName)
      expect(meta.defaultModel).toBe(config.defaultModel)
    }
  })

  it('should have ownedBy arrays for providers with modelFilter', () => {
    expect(SKILLSFAN_PROVIDER_META['glm'].ownedBy).toContain('zhipu')
    expect(SKILLSFAN_PROVIDER_META['minimax-oauth'].ownedBy).toContain('minimax')
  })
})
