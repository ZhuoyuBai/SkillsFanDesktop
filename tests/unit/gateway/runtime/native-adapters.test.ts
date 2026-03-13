import { describe, expect, it } from 'vitest'
import {
  getNativeRuntimeAdapter,
  listNativeRuntimeAdapters,
  resolveNativeRuntimeAdapter
} from '../../../../src/gateway/runtime/native/adapters'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('native runtime adapters', () => {
  it('lists explicit OpenAI-family adapters instead of collapsing them into one generic compat lane', () => {
    expect(listNativeRuntimeAdapters().map((adapter) => adapter.id)).toEqual([
      'openai-responses',
      'openai-codex-responses'
    ])
  })

  it('resolves the OpenAI Responses adapter by endpoint contract', () => {
    const resolution = resolveNativeRuntimeAdapter({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      apiKey: 'key',
      model: 'gpt-5.4',
      apiType: 'responses'
    })

    expect(resolution.adapter?.id).toBe('openai-responses')
    expect(resolution.reason).toBe(getNativeUserFacingMessage('openAIReady'))
  })

  it('resolves the OpenAI Codex Responses adapter by explicit source family', () => {
    const resolution = resolveNativeRuntimeAdapter({
      requestedSource: 'openai-codex',
      source: 'openai-codex',
      authMode: 'oauth',
      provider: 'oauth',
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: 'token',
      model: 'gpt-5.4',
      apiType: 'responses'
    })

    expect(resolution.adapter?.id).toBe('openai-codex-responses')
    expect(resolution.reason).toBe(getNativeUserFacingMessage('codexReady'))
  })

  it('keeps unsupported providers out of the explicit native adapter scope', () => {
    const resolution = resolveNativeRuntimeAdapter({
      requestedSource: 'zai',
      source: 'zai',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
      apiKey: 'key',
      model: 'glm-5',
      apiType: 'responses'
    })

    expect(resolution.adapter).toBeNull()
    expect(resolution.reason).toBe(getNativeUserFacingMessage('outsideScope'))
  })

  it('can look up a native adapter directly by id', () => {
    expect(getNativeRuntimeAdapter('openai-responses')).toEqual(
      expect.objectContaining({
        id: 'openai-responses',
        stage: 'ready',
        providerNativeExecution: true
      })
    )
  })
})
