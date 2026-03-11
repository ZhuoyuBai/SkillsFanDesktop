import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const customProvider = {
    type: 'custom',
    displayName: 'Custom',
    isConfigured: vi.fn(() => false),
    getBackendConfig: vi.fn(() => null),
    getCurrentModel: vi.fn(() => null),
    getAvailableModels: vi.fn(async () => [])
  }

  const githubCopilotProvider = {
    type: 'github-copilot',
    displayName: 'GitHub Copilot',
    isConfigured: vi.fn(() => false),
    getBackendConfig: vi.fn(() => null),
    getCurrentModel: vi.fn(() => null),
    getAvailableModels: vi.fn(async () => []),
    startLogin: vi.fn(),
    completeLogin: vi.fn()
  }

  const openaiCodexProvider = {
    type: 'openai-codex',
    displayName: 'OpenAI Codex',
    isConfigured: vi.fn(() => false),
    getBackendConfig: vi.fn(() => null),
    getCurrentModel: vi.fn(() => null),
    getAvailableModels: vi.fn(async () => []),
    startLogin: vi.fn(),
    completeLogin: vi.fn()
  }

  const glmProvider = {
    type: 'glm',
    displayName: 'GLM',
    isConfigured: vi.fn(() => true),
    getBackendConfig: vi.fn(() => null),
    getCurrentModel: vi.fn(() => 'glm-4.5'),
    getAvailableModels: vi.fn(async () => ['glm-4.5']),
    startLogin: vi.fn(),
    completeLogin: vi.fn()
  }

  return {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    getCustomProvider: vi.fn(() => customProvider),
    getGitHubCopilotProvider: vi.fn(() => githubCopilotProvider),
    getOpenAICodexProvider: vi.fn(() => openaiCodexProvider),
    createAllSkillsFanProviders: vi.fn(() => [glmProvider]),
    getOAuthToCustomFallbackMap: vi.fn(() => ({ glm: 'zhipu' })),
    loadAuthProvidersAsync: vi.fn(async () => []),
    decryptString: vi.fn((value: string) => value),
    decryptTokens: vi.fn((value: string) => value),
    glmProvider
  }
})

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig
}))

vi.mock('../../../../src/main/services/ai-sources/providers/custom.provider', () => ({
  getCustomProvider: mocks.getCustomProvider
}))

vi.mock('../../../../src/main/services/ai-sources/providers/github-copilot.provider', () => ({
  getGitHubCopilotProvider: mocks.getGitHubCopilotProvider
}))

vi.mock('../../../../src/main/services/ai-sources/providers/openai-codex.provider', () => ({
  getOpenAICodexProvider: mocks.getOpenAICodexProvider
}))

vi.mock('../../../../src/main/services/ai-sources/providers/skillsfan-providers', () => ({
  createAllSkillsFanProviders: mocks.createAllSkillsFanProviders,
  getOAuthToCustomFallbackMap: mocks.getOAuthToCustomFallbackMap
}))

vi.mock('../../../../src/main/services/ai-sources/auth-loader', () => ({
  loadAuthProvidersAsync: mocks.loadAuthProvidersAsync,
  isOAuthProvider: vi.fn(() => false)
}))

vi.mock('../../../../src/main/services/secure-storage.service', () => ({
  decryptString: mocks.decryptString,
  decryptTokens: mocks.decryptTokens
}))

import { AISourceManager } from '../../../../src/main/services/ai-sources/manager'

describe('AISourceManager runtime resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: true,
          model: 'glm-4.5',
          availableModels: ['glm-4.5']
        }
      }
    })
    mocks.glmProvider.isConfigured.mockReturnValue(true)
    mocks.glmProvider.getBackendConfig.mockReturnValue({
      url: 'https://glm.example/v1/chat/completions',
      key: 'oauth-token',
      model: 'glm-4.5',
      headers: {
        'x-user-id': 'u_123'
      },
      apiType: 'chat_completions',
      forceStream: true
    })
  })

  it('returns a runtime endpoint for the active configured provider', () => {
    const manager = new AISourceManager()

    const endpoint = manager.resolveRuntimeEndpoint()

    expect(endpoint).toEqual({
      requestedSource: 'glm',
      source: 'glm',
      authMode: 'oauth',
      provider: 'oauth',
      baseUrl: 'https://glm.example/v1/chat/completions',
      apiKey: 'oauth-token',
      model: 'glm-4.5',
      headers: {
        'x-user-id': 'u_123'
      },
      apiType: 'chat_completions',
      forceStream: true
    })
  })

  it('returns a fallback runtime endpoint when oauth source is unavailable', () => {
    mocks.getConfig.mockReturnValue({
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: false,
          model: 'glm-4.5',
          availableModels: ['glm-4.5']
        },
        zhipu: {
          provider: 'openai',
          apiKey: 'zhipu-key',
          apiUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
          model: 'glm-4.5',
          customHeaders: {
            'x-app-id': 'app-123'
          },
          apiType: 'responses'
        }
      }
    })
    mocks.glmProvider.isConfigured.mockReturnValue(false)

    const manager = new AISourceManager()

    const endpoint = manager.resolveRuntimeEndpoint()

    expect(endpoint).toEqual({
      requestedSource: 'glm',
      source: 'zhipu',
      authMode: 'fallback',
      provider: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
      apiKey: 'zhipu-key',
      model: 'glm-4.5',
      headers: {
        'x-app-id': 'app-123'
      },
      apiType: 'responses'
    })
  })

  it('derives backend config from the resolved runtime endpoint', () => {
    const manager = new AISourceManager()

    const backendConfig = manager.getBackendConfig()

    expect(backendConfig).toEqual({
      url: 'https://glm.example/v1/chat/completions',
      key: 'oauth-token',
      model: 'glm-4.5',
      headers: {
        'x-user-id': 'u_123'
      },
      apiType: 'chat_completions',
      forceStream: true
    })
  })

  it('derives fallback backend config from the resolved runtime endpoint', () => {
    mocks.getConfig.mockReturnValue({
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: false,
          model: 'glm-4.5',
          availableModels: ['glm-4.5']
        },
        zhipu: {
          provider: 'openai',
          apiKey: 'zhipu-key',
          apiUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
          model: 'glm-4.5',
          customHeaders: {
            'x-app-id': 'app-123'
          },
          apiType: 'responses'
        }
      }
    })
    mocks.glmProvider.isConfigured.mockReturnValue(false)

    const manager = new AISourceManager()

    const backendConfig = manager.getBackendConfig()

    expect(backendConfig).toEqual({
      url: 'https://open.bigmodel.cn/api/paas/v4/responses',
      key: 'zhipu-key',
      model: 'glm-4.5',
      headers: {
        'x-app-id': 'app-123'
      },
      apiType: 'responses',
      forceStream: undefined
    })
  })
})
