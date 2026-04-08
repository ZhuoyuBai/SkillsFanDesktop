import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getApiCredentialsForSource: vi.fn(),
  resolveSdkTransport: vi.fn()
}))

vi.mock('../../../src/main/services/pty-credentials', () => ({
  getApiCredentialsForSource: mocks.getApiCredentialsForSource,
  getWorkingDir: vi.fn(),
  resolveSdkTransport: mocks.resolveSdkTransport
}))

import { initializeApp, saveConfig } from '../../../src/main/services/config.service'
import { resolveClaudeCliEnv } from '../../../src/main/services/pty-manager.service'

describe('PTY Manager', () => {
  beforeEach(async () => {
    await initializeApp()
    mocks.getApiCredentialsForSource.mockReset()
    mocks.resolveSdkTransport.mockReset()
  })

  it('uses native Claude Code login without injecting persisted custom API credentials', async () => {
    saveConfig({
      terminal: { skipClaudeLogin: false },
      aiSources: {
        current: 'zhipu',
        zhipu: {
          provider: 'anthropic',
          apiKey: 'test-key',
          apiUrl: 'https://open.bigmodel.cn/api/anthropic',
          model: 'GLM-5-Turbo'
        }
      }
    } as any)

    const result = await resolveClaudeCliEnv({
      workDir: '/tmp/project'
    })

    expect(result).toEqual({
      env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
      },
      model: '',
      skipClaudeLogin: false
    })
    expect(mocks.getApiCredentialsForSource).not.toHaveBeenCalled()
    expect(mocks.resolveSdkTransport).not.toHaveBeenCalled()
  })

  it('injects configured API credentials in custom API terminal mode', async () => {
    mocks.getApiCredentialsForSource.mockResolvedValue({
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiKey: 'test-key',
      model: 'GLM-5-Turbo',
      provider: 'anthropic'
    })
    mocks.resolveSdkTransport.mockResolvedValue({
      anthropicBaseUrl: 'http://127.0.0.1:3457',
      anthropicApiKey: 'encoded-backend-config',
      sdkModel: 'claude-sonnet-4-20250514',
      routed: true
    })

    saveConfig({
      terminal: { skipClaudeLogin: true },
      aiSources: {
        current: 'zhipu',
        zhipu: {
          provider: 'anthropic',
          apiKey: 'test-key',
          apiUrl: 'https://open.bigmodel.cn/api/anthropic',
          model: 'GLM-5-Turbo'
        }
      }
    } as any)

    const result = await resolveClaudeCliEnv({
      workDir: '/tmp/project'
    })

    expect(mocks.getApiCredentialsForSource).toHaveBeenCalledTimes(1)
    expect(mocks.resolveSdkTransport).toHaveBeenCalledTimes(1)
    expect(result.model).toBe('GLM-5-Turbo')
    expect(result.skipClaudeLogin).toBe(true)
    expect(result.env).toMatchObject({
      ANTHROPIC_API_KEY: 'encoded-backend-config',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:3457',
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    })
  })
})
