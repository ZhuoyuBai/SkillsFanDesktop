import { describe, expect, it } from 'vitest'
import { resolveNativeRuntimeTransportPlan } from '../../../../src/gateway/runtime/native/transport'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('native runtime transport plan', () => {
  it('builds the OpenAI Responses transport plan with warmup and store=true defaults', () => {
    const resolution = resolveNativeRuntimeTransportPlan({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      apiKey: 'key',
      model: 'gpt-5.4',
      apiType: 'responses'
    })

    expect(resolution.plan).toEqual({
      adapterId: 'openai-responses',
      endpointUrl: 'https://api.openai.com/v1/responses',
      apiType: 'responses',
      defaultTransport: 'auto',
      supportsWebSocket: true,
      websocketWarmup: true,
      storePolicy: 'force-true',
      serverCompactionCapable: true,
      serverCompactionDefault: true,
      authHeaderMode: 'bearer',
      extraHeaderKeys: [],
      note: 'OpenAI Responses uses auto transport, enables WebSocket warmup, and can apply server-side compaction rules.'
    })
  })

  it('builds the Codex transport plan with store=false and no warmup', () => {
    const resolution = resolveNativeRuntimeTransportPlan({
      requestedSource: 'openai-codex',
      source: 'openai-codex',
      authMode: 'oauth',
      provider: 'oauth',
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: 'token',
      model: 'gpt-5.4',
      apiType: 'responses',
      headers: {
        'ChatGPT-Account-ID': 'acct-1'
      }
    })

    expect(resolution.plan).toEqual({
      adapterId: 'openai-codex-responses',
      endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiType: 'responses',
      defaultTransport: 'auto',
      supportsWebSocket: true,
      websocketWarmup: false,
      storePolicy: 'force-false',
      serverCompactionCapable: false,
      serverCompactionDefault: false,
      authHeaderMode: 'bearer',
      extraHeaderKeys: ['ChatGPT-Account-ID'],
      note: 'OpenAI Codex Responses uses auto transport, disables warmup by default, and forces store=false.'
    })
  })

  it('does not build a transport plan for providers outside the explicit v1 scope', () => {
    const resolution = resolveNativeRuntimeTransportPlan({
      requestedSource: 'zai',
      source: 'zai',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/responses',
      apiKey: 'key',
      model: 'glm-5',
      apiType: 'responses'
    })

    expect(resolution).toEqual({
      plan: null,
      reason: getNativeUserFacingMessage('outsideScope')
    })
  })
})
