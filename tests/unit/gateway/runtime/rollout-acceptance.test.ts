import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({
    browserAutomation: {
      mode: 'system-browser'
    }
  })),
  ensureInitialized: vi.fn(),
  resolveRuntimeEndpoint: vi.fn(),
  getEnabledExtensions: vi.fn(() => []),
  executeNativePreparedRequest: vi.fn(),
  runDesktopSmokeFlow: vi.fn(),
  buildRuntimeToolBundle: vi.fn(),
  resolveConfiguredSharedToolProviders: vi.fn()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/main/services/ai-sources', () => ({
  getAISourceManager: () => ({
    ensureInitialized: mocks.ensureInitialized,
    resolveRuntimeEndpoint: mocks.resolveRuntimeEndpoint
  })
}))

vi.mock('../../../../src/main/services/extension', () => ({
  getEnabledExtensions: mocks.getEnabledExtensions
}))

vi.mock('../../../../src/gateway/tools', () => ({
  buildRuntimeToolBundle: mocks.buildRuntimeToolBundle,
  resolveConfiguredSharedToolProviders: mocks.resolveConfiguredSharedToolProviders
}))

vi.mock('../../../../src/gateway/runtime/native/client', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/gateway/runtime/native/client')>(
    '../../../../src/gateway/runtime/native/client'
  )

  return {
    ...actual,
    executeNativePreparedRequest: mocks.executeNativePreparedRequest
  }
})

vi.mock('../../../../src/gateway/host-runtime/desktop/smoke-flows', () => ({
  runDesktopSmokeFlow: mocks.runDesktopSmokeFlow
}))

import {
  clearNativeRolloutTrialSnapshotsForTests,
  getNativeRolloutTrialSnapshot
} from '../../../../src/gateway/runtime/rollout-trials'
import { runNativeRolloutAcceptance } from '../../../../src/gateway/runtime/rollout-acceptance'

describe('native rollout acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearNativeRolloutTrialSnapshotsForTests()
    mocks.ensureInitialized.mockResolvedValue(undefined)
    mocks.resolveConfiguredSharedToolProviders.mockReturnValue([
      {
        id: 'local-tools',
        kind: 'mcp',
        source: 'app',
        description: 'local tools',
        runtimeKinds: ['claude-sdk', 'native']
      }
    ])
    mocks.buildRuntimeToolBundle.mockResolvedValue({
      native: {
        providers: [
          {
            id: 'local-tools',
            kind: 'mcp',
            source: 'app',
            description: 'local tools',
            runtimeKinds: ['claude-sdk', 'native']
          }
        ],
        functionTools: [],
        sharedToolRegistryReady: true
      }
    })
    mocks.resolveRuntimeEndpoint.mockReturnValue({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
      apiType: 'responses'
    })
  })

  it('runs the chat-simple acceptance check and stores the latest result', async () => {
    mocks.executeNativePreparedRequest.mockResolvedValue({
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      streamEvents: [],
      response: {
        responseId: 'resp_1',
        model: 'gpt-5.4',
        status: 'completed',
        outputText: 'READY',
        refusalText: null,
        toolCalls: [],
        usage: null,
        incompleteReason: null,
        error: null
      }
    })

    const results = await runNativeRolloutAcceptance({
      targetId: 'chat-simple'
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      id: 'chat-simple',
      state: 'passed',
      summary: 'Short chat tasks are ready to try on the new route.'
    }))
    expect(getNativeRolloutTrialSnapshot('chat-simple')).toEqual(expect.objectContaining({
      state: 'passed'
    }))
  })

  it('runs browser and terminal checks when targetId is all', async () => {
    mocks.executeNativePreparedRequest.mockResolvedValue({
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      streamEvents: [],
      response: {
        responseId: 'resp_1',
        model: 'gpt-5.4',
        status: 'completed',
        outputText: 'READY',
        refusalText: null,
        toolCalls: [],
        usage: null,
        incompleteReason: null,
        error: null
      }
    })
    mocks.runDesktopSmokeFlow
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Chrome tab roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Chrome discovery roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Terminal command roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Terminal session targeting passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Finder navigation roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'SkillsFan settings roundtrip passed.',
        error: null
      })

    const results = await runNativeRolloutAcceptance({
      targetId: 'all'
    })

    expect(results.map((item) => item.id)).toEqual([
      'chat-simple',
      'browser-simple',
      'terminal-simple',
      'finder-simple',
      'skillsfan-simple'
    ])
    expect(mocks.runDesktopSmokeFlow.mock.calls.map((call) => call[0].flowId)).toEqual([
      'chrome.tab-roundtrip',
      'chrome.discovery-roundtrip',
      'terminal.command-roundtrip',
      'terminal.session-targeting',
      'finder.navigation-roundtrip',
      'skillsfan.settings-roundtrip'
    ])
  })

  it('stores a failed browser-simple result when a smoke flow fails', async () => {
    mocks.runDesktopSmokeFlow
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Chrome tab roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'failed',
        summary: 'Chrome discovery roundtrip failed.',
        error: 'Chrome did not find the tab.'
      })

    const results = await runNativeRolloutAcceptance({
      targetId: 'browser-simple'
    })

    expect(results[0]).toEqual(expect.objectContaining({
      id: 'browser-simple',
      state: 'failed',
      error: 'Chrome did not find the tab.'
    }))
    expect(results[0].checks).toHaveLength(2)
    expect(getNativeRolloutTrialSnapshot('browser-simple')).toEqual(expect.objectContaining({
      state: 'failed'
    }))
  })

  it('runs dedicated Finder and SkillsFan checks when requested', async () => {
    mocks.runDesktopSmokeFlow
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'Finder navigation roundtrip passed.',
        error: null
      })
      .mockResolvedValueOnce({
        state: 'passed',
        summary: 'SkillsFan settings roundtrip passed.',
        error: null
      })

    const finderResult = await runNativeRolloutAcceptance({
      targetId: 'finder-simple'
    })
    const skillsfanResult = await runNativeRolloutAcceptance({
      targetId: 'skillsfan-simple'
    })

    expect(finderResult[0]).toEqual(expect.objectContaining({
      id: 'finder-simple',
      state: 'passed'
    }))
    expect(skillsfanResult[0]).toEqual(expect.objectContaining({
      id: 'skillsfan-simple',
      state: 'passed'
    }))
  })
})
