import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureInitialized: vi.fn(),
  resolveRuntimeEndpoint: vi.fn()
}))

vi.mock('../../../../src/main/services/ai-sources', () => ({
  getAISourceManager: () => ({
    ensureInitialized: mocks.ensureInitialized,
    resolveRuntimeEndpoint: mocks.resolveRuntimeEndpoint
  })
}))
import { resolveNativeRuntimeAdapter } from '../../../../src/gateway/runtime/native/adapters'
import {
  getNativeRuntimeStatus,
  nativeRuntime,
  resolveNativeRuntimeStatus,
  setNativeRuntimeStatusForTests
} from '../../../../src/gateway/runtime/native/runtime'
import { resolveNativeProviderCapability } from '../../../../src/gateway/runtime/native/capabilities'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('native runtime scaffold', () => {
  mocks.ensureInitialized.mockResolvedValue(undefined)
  mocks.resolveRuntimeEndpoint.mockReturnValue(null)

  it('exposes scaffold status without provider-native execution enabled', () => {
    const status = getNativeRuntimeStatus()

    expect(status).toEqual({
      scaffolded: true,
      ready: false,
      readinessReasonId: null,
      endpointSupported: false,
      adapterResolved: false,
      adapterStage: null,
      transportResolved: false,
      providerNativeExecution: false,
      sharedToolRegistryReady: true,
      taskRoutingReady: true,
      supportedProviders: ['anthropic', 'openai', 'openai-codex'],
      supportedApiTypes: ['messages', 'responses'],
      availableAdapterIds: ['anthropic-messages', 'openai-responses', 'openai-codex-responses'],
      currentSource: null,
      currentProvider: null,
      currentApiType: null,
      sharedToolProviderIds: [],
      nativeToolProviderIds: [],
      adapterId: null,
      transport: null,
      supportsStreaming: false,
      supportsToolCalls: false,
      supportsUsage: false,
      interaction: {
        pendingToolApprovalCount: 0,
        pendingUserQuestionCount: 0,
        pendingConversationIds: [],
        pendingUserQuestionPreview: null,
        pendingUserQuestionHeader: null,
        lastToolApprovalRequestedAt: null,
        lastToolApprovalResolvedAt: null,
        lastUserQuestionRequestedAt: null,
        lastUserQuestionResolvedAt: null
      },
      note: getNativeUserFacingMessage('scaffoldReadyButInactive')
    })
  })

  it('throws a clear error if no native-compatible runtime endpoint is available', async () => {
    await expect(nativeRuntime.sendMessage({
      mainWindow: null,
      request: {} as any
    })).rejects.toThrow(getNativeUserFacingMessage('noEndpoint'))
  })

  it('can be reset in tests without mutating the default status object', () => {
    setNativeRuntimeStatusForTests({
      ready: true,
      providerNativeExecution: true,
      supportedProviders: ['openai']
    })

    expect(getNativeRuntimeStatus()).toEqual(expect.objectContaining({
      ready: true,
      providerNativeExecution: true,
      supportedProviders: ['openai']
    }))

    setNativeRuntimeStatusForTests(null)

    expect(getNativeRuntimeStatus()).toEqual(expect.objectContaining({
      ready: false,
      providerNativeExecution: false,
      supportedProviders: ['anthropic', 'openai', 'openai-codex']
    }))
  })

  it('marks native runtime as ready-for-adapter when an OpenAI-family Responses endpoint and shared native tools are available', () => {
    const status = resolveNativeRuntimeStatus({
      endpoint: {
        requestedSource: 'openai-codex',
        source: 'openai-codex',
        authMode: 'oauth',
        provider: 'oauth',
        baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: 'token',
        model: 'gpt-5.4',
        apiType: 'responses'
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        },
        {
          id: 'skill',
          kind: 'mcp',
          source: 'app',
          description: 'skill tools',
          runtimeKinds: ['claude-sdk']
        }
      ]
    })

    expect(status).toEqual(expect.objectContaining({
      ready: true,
      readinessReasonId: 'ready',
      endpointSupported: true,
      adapterResolved: true,
      adapterStage: 'ready',
      transportResolved: true,
      currentSource: 'openai-codex',
      currentProvider: 'oauth',
      currentApiType: 'responses',
      availableAdapterIds: ['anthropic-messages', 'openai-responses', 'openai-codex-responses'],
      sharedToolProviderIds: ['local-tools', 'skill'],
      nativeToolProviderIds: ['local-tools'],
      adapterId: 'openai-codex-responses',
      transport: {
        adapterId: 'openai-codex-responses',
        endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
        requestTimeoutMs: 300000,
        apiType: 'responses',
        defaultTransport: 'auto',
        supportsWebSocket: true,
        websocketWarmup: false,
        storePolicy: 'force-false',
        serverCompactionCapable: false,
        serverCompactionDefault: false,
        authHeaderMode: 'bearer',
        extraHeaderKeys: [],
        note: 'OpenAI Codex Responses uses auto transport, disables warmup by default, and forces store=false.'
      },
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsUsage: true
    }))
    expect(status.note).toBe(getNativeUserFacingMessage('codexReady'))
  })

  it('marks native runtime as ready for anthropic-compatible custom sources with shared native tools', () => {
    const status = resolveNativeRuntimeStatus({
      endpoint: {
        requestedSource: 'zhipu',
        source: 'zhipu',
        authMode: 'api-key',
        provider: 'anthropic',
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        apiKey: 'key',
        model: 'GLM-5',
        apiType: undefined
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        }
      ]
    })

    expect(status).toEqual(expect.objectContaining({
      ready: true,
      readinessReasonId: 'ready',
      endpointSupported: true,
      currentProvider: 'anthropic',
      currentApiType: 'messages',
      adapterId: 'anthropic-messages',
      transport: {
        adapterId: 'anthropic-messages',
        endpointUrl: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
        requestTimeoutMs: 300000,
        apiType: 'messages',
        defaultTransport: 'auto',
        supportsWebSocket: false,
        websocketWarmup: false,
        storePolicy: 'force-false',
        serverCompactionCapable: false,
        serverCompactionDefault: false,
        authHeaderMode: 'x-api-key',
        extraHeaderKeys: [],
        note: 'Anthropic-compatible Messages uses direct HTTPS requests, disables warmup, and keeps tool roundtrips on the messages endpoint.'
      }
    }))
    expect(status.note).toBe(getNativeUserFacingMessage('anthropicReady'))
  })

  it('derives provider capability contracts for OpenAI Responses and Codex Responses', () => {
    expect(resolveNativeProviderCapability({
      requestedSource: 'zhipu',
      source: 'zhipu',
      authMode: 'api-key',
      provider: 'anthropic',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiKey: 'key',
      model: 'GLM-5',
      apiType: undefined
    })).toEqual({
      supported: true,
      reasonId: 'supported',
      adapterId: 'anthropic-messages',
      adapterStage: 'ready',
      providerNativeExecution: true,
      supportsStreaming: false,
      supportsToolCalls: true,
      supportsUsage: true,
      reason: getNativeUserFacingMessage('anthropicReady')
    })

    expect(resolveNativeProviderCapability({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      apiKey: 'key',
      model: 'gpt-5.4',
      apiType: 'responses'
    })).toEqual({
      supported: true,
      reasonId: 'supported',
      adapterId: 'openai-responses',
      adapterStage: 'ready',
      providerNativeExecution: true,
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsUsage: true,
      reason: getNativeUserFacingMessage('openAIReady')
    })

    expect(resolveNativeProviderCapability({
      requestedSource: 'openai-codex',
      source: 'openai-codex',
      authMode: 'oauth',
      provider: 'oauth',
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: 'token',
      model: 'gpt-5.4',
      apiType: 'responses'
    })).toEqual({
      supported: true,
      reasonId: 'supported',
      adapterId: 'openai-codex-responses',
      adapterStage: 'ready',
      providerNativeExecution: true,
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsUsage: true,
      reason: getNativeUserFacingMessage('codexReady')
    })
  })

  it('keeps adapter scope narrow so non-OpenAI providers do not silently reuse the same adapter', () => {
    expect(resolveNativeRuntimeAdapter({
      requestedSource: 'moonshot',
      source: 'moonshot',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.moonshot.ai/v1/responses',
      apiKey: 'key',
      model: 'kimi-k2.5',
      apiType: 'responses'
    })).toEqual({
      adapter: null,
      reason: getNativeUserFacingMessage('outsideScope')
    })
  })
})
