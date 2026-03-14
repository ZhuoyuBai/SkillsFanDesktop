import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveRuntimeEndpoint: vi.fn(),
  getConfig: vi.fn(),
  getEnabledExtensions: vi.fn()
}))

vi.mock('../../../../src/main/services/ai-sources/manager', () => ({
  getAISourceManager: () => ({
    resolveRuntimeEndpoint: mocks.resolveRuntimeEndpoint
  })
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/main/services/extension', () => ({
  getEnabledExtensions: mocks.getEnabledExtensions
}))

import {
  resolveNativeRuntimeRegistrationState,
  syncNativeRuntimeRegistration
} from '../../../../src/gateway/runtime/registration'

describe('native runtime registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      browserAutomation: {
        mode: 'ai-browser'
      }
    })
    mocks.getEnabledExtensions.mockReturnValue([])
  })

  it('enables registration when the current AI source resolves to a supported Responses endpoint', () => {
    mocks.resolveRuntimeEndpoint.mockReturnValue({
      requestedSource: 'openai-codex',
      source: 'openai-codex',
      authMode: 'oauth',
      provider: 'oauth',
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: 'token',
      model: 'gpt-5.4',
      apiType: 'responses'
    })

    const state = resolveNativeRuntimeRegistrationState()
    const registerRuntime = vi.fn()
    const unregisterRuntime = vi.fn()

    syncNativeRuntimeRegistration({
      registerRuntime,
      unregisterRuntime
    })

    expect(state.enabled).toBe(true)
    expect(state.status).toEqual(expect.objectContaining({
      ready: true,
      adapterId: 'openai-codex-responses',
      providerNativeExecution: true,
      nativeToolProviderIds: ['local-tools', 'web-tools', 'ai-browser']
    }))
    expect(registerRuntime).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'native'
    }))
    expect(unregisterRuntime).not.toHaveBeenCalled()
  })

  it('unregisters native when the current AI source is outside the explicit native v1 scope', () => {
    mocks.resolveRuntimeEndpoint.mockReturnValue({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'key',
      model: 'gpt-4.1',
      apiType: 'chat_completions'
    })

    const registerRuntime = vi.fn()
    const unregisterRuntime = vi.fn()
    const state = syncNativeRuntimeRegistration({
      registerRuntime,
      unregisterRuntime
    })

    expect(state.enabled).toBe(false)
    expect(state.status).toEqual(expect.objectContaining({
      ready: false,
      adapterId: null,
      providerNativeExecution: false
    }))
    expect(registerRuntime).not.toHaveBeenCalled()
    expect(unregisterRuntime).toHaveBeenCalledWith('native')
  })
})
