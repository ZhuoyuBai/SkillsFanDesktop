import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAISourceManager: vi.fn(),
  manager: {
    ensureInitialized: vi.fn(),
    ensureValidToken: vi.fn(),
    resolveRuntimeEndpoint: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/skillsfan-test')
  },
  BrowserWindow: class {}
}))

vi.mock('../../../../src/main/services/ai-sources', () => ({
  getAISourceManager: mocks.getAISourceManager
}))

import { getApiCredentials } from '../../../../src/main/services/agent/helpers'

describe('agent/helpers.getApiCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAISourceManager.mockReturnValue(mocks.manager)
    mocks.manager.ensureInitialized.mockResolvedValue(undefined)
    mocks.manager.ensureValidToken.mockResolvedValue({ success: true })
    mocks.manager.resolveRuntimeEndpoint.mockReturnValue({
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
      apiType: 'chat_completions'
    })
  })

  it('returns oauth credentials from resolved runtime endpoint', async () => {
    const config = {
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: true,
          model: 'glm-4.5'
        }
      }
    } as any

    const credentials = await getApiCredentials(config)

    expect(mocks.manager.ensureInitialized).toHaveBeenCalledTimes(1)
    expect(mocks.manager.ensureValidToken).toHaveBeenCalledWith('glm')
    expect(mocks.manager.resolveRuntimeEndpoint).toHaveBeenCalledWith('glm')
    expect(credentials).toEqual({
      baseUrl: 'https://glm.example/v1/chat/completions',
      apiKey: 'oauth-token',
      model: 'glm-4.5',
      provider: 'oauth',
      nativeAnthropicServerTools: false,
      customHeaders: {
        'x-user-id': 'u_123'
      },
      apiType: 'chat_completions'
    })
  })

  it('returns fallback custom-api credentials when oauth token is invalid but fallback exists', async () => {
    mocks.manager.ensureValidToken.mockResolvedValue({ success: false, error: 'expired' })
    mocks.manager.resolveRuntimeEndpoint.mockReturnValue({
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

    const config = {
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: true,
          model: 'glm-4.5'
        }
      }
    } as any

    const credentials = await getApiCredentials(config)

    expect(credentials).toEqual({
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
      apiKey: 'zhipu-key',
      model: 'glm-4.5',
      provider: 'openai',
      nativeAnthropicServerTools: false,
      customHeaders: {
        'x-app-id': 'app-123'
      },
      apiType: 'responses'
    })
  })

  it('throws oauth-expired error when no endpoint can be resolved', async () => {
    mocks.manager.ensureValidToken.mockResolvedValue({ success: false, error: 'expired' })
    mocks.manager.resolveRuntimeEndpoint.mockReturnValue(null)

    const config = {
      aiSources: {
        current: 'glm',
        glm: {
          loggedIn: true,
          model: 'glm-4.5'
        }
      }
    } as any

    await expect(getApiCredentials(config)).rejects.toThrow(
      'OAuth token expired or invalid. Please login again.'
    )
  })
})
