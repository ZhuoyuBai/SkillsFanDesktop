import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  unstableV2CreateSession: vi.fn(),
  onApiConfigChange: vi.fn()
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  unstable_v2_createSession: mocks.unstableV2CreateSession
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: vi.fn(() => ({ mcpServers: {}, memory: { enabled: true } })),
  onApiConfigChange: mocks.onApiConfigChange
}))

vi.mock('../../../../src/main/services/conversation.service', () => ({
  getConversation: vi.fn(() => null)
}))

vi.mock('../../../../src/main/services/skill', () => ({
  ensureSkillsInitialized: vi.fn(async () => {}),
  getSkillsSignature: vi.fn(() => '')
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  getHeadlessElectronPath: vi.fn(() => '/mock/electron'),
  getWorkingDir: vi.fn(() => '/mock/workdir'),
  getApiCredentials: vi.fn(async () => ({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'mock-key'
  }))
}))

vi.mock('../../../../src/main/services/agent/sdk-options', () => ({
  buildSdkOptions: vi.fn(async () => ({ sdkOptions: {}, addedMcpServers: [] })),
  resolveSdkTransport: vi.fn(async () => ({
    anthropicBaseUrl: 'https://api.anthropic.com',
    anthropicApiKey: 'mock-key',
    sdkModel: 'claude-sonnet-4-20250514',
    routed: false
  }))
}))

import {
  activeSessions,
  closeAllV2Sessions,
  createSessionState,
  getActiveSession,
  getOrCreateV2Session,
  invalidateAllSessions,
  needsSessionRebuild,
  registerActiveSession,
  stopSessionCleanup,
  unregisterActiveSession,
  v2Sessions
} from '../../../../src/main/services/agent/session-manager'

function makeSessionInfo(session: { close: () => void }, config: {
  aiBrowserEnabled: boolean
  skillsSignature: string
  skillToolMode?: 'none' | 'mcp' | 'native'
  browserAutomationMode?: 'ai-browser' | 'system-browser'
}) {
  return {
    session,
    spaceId: 'space-1',
    conversationId: 'conv-1',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    config
  }
}

describe('session-manager', () => {
  beforeEach(() => {
    activeSessions.clear()
    v2Sessions.clear()
    stopSessionCleanup()
    mocks.unstableV2CreateSession.mockReset()
  })

  afterEach(() => {
    activeSessions.clear()
    v2Sessions.clear()
    stopSessionCleanup()
  })

  it('registers API config change callback on module init', () => {
    expect(mocks.onApiConfigChange).toHaveBeenCalledTimes(1)
    expect(mocks.onApiConfigChange).toHaveBeenCalledWith(expect.any(Function))
  })

  it('detects when a V2 session needs rebuild', () => {
    const existing = makeSessionInfo({ close: vi.fn() }, {
      aiBrowserEnabled: false,
      skillsSignature: '',
      skillToolMode: 'mcp',
      browserAutomationMode: 'ai-browser'
    })

    expect(needsSessionRebuild(existing as any, {
      aiBrowserEnabled: false,
      skillsSignature: '',
      skillToolMode: 'mcp',
      browserAutomationMode: 'ai-browser'
    })).toBe(false)
    expect(needsSessionRebuild(existing as any, {
      aiBrowserEnabled: true,
      skillsSignature: '',
      skillToolMode: 'mcp',
      browserAutomationMode: 'ai-browser'
    })).toBe(true)
    expect(needsSessionRebuild(existing as any, {
      aiBrowserEnabled: false,
      skillsSignature: 'sig-2',
      skillToolMode: 'mcp',
      browserAutomationMode: 'ai-browser'
    })).toBe(true)
    expect(needsSessionRebuild(existing as any, {
      aiBrowserEnabled: false,
      skillsSignature: '',
      skillToolMode: 'native',
      browserAutomationMode: 'ai-browser'
    })).toBe(true)
    expect(needsSessionRebuild(existing as any, {
      aiBrowserEnabled: false,
      skillsSignature: '',
      skillToolMode: 'mcp',
      browserAutomationMode: 'system-browser'
    })).toBe(true)
  })

  it('reuses existing session and rebuilds when config changes', async () => {
    const firstSession = { close: vi.fn() }
    const rebuiltSession = { close: vi.fn() }
    mocks.unstableV2CreateSession
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(rebuiltSession)

    const first = await getOrCreateV2Session(
      'space-1',
      'conv-1',
      { model: 'claude' },
      undefined,
      { aiBrowserEnabled: false, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }
    )
    expect(first).toBe(firstSession)
    expect(mocks.unstableV2CreateSession).toHaveBeenCalledTimes(1)

    const reused = await getOrCreateV2Session(
      'space-1',
      'conv-1',
      { model: 'claude' },
      undefined,
      { aiBrowserEnabled: false, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }
    )
    expect(reused).toBe(firstSession)
    expect(mocks.unstableV2CreateSession).toHaveBeenCalledTimes(1)

    const rebuilt = await getOrCreateV2Session(
      'space-1',
      'conv-1',
      { model: 'claude' },
      undefined,
      { aiBrowserEnabled: true, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }
    )
    expect(firstSession.close).toHaveBeenCalledTimes(1)
    expect(rebuilt).toBe(rebuiltSession)
    expect(mocks.unstableV2CreateSession).toHaveBeenCalledTimes(2)
  })

  it('defers invalidation for in-flight sessions and closes after unregister', () => {
    const idleSession = { close: vi.fn() }
    const activeSession = { close: vi.fn() }
    v2Sessions.set(
      'idle-conv',
      makeSessionInfo(idleSession, { aiBrowserEnabled: false, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }) as any
    )
    v2Sessions.set(
      'active-conv',
      makeSessionInfo(activeSession, { aiBrowserEnabled: false, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }) as any
    )

    const state = createSessionState('space-1', 'active-conv', new AbortController())
    registerActiveSession('active-conv', state)

    invalidateAllSessions()

    expect(idleSession.close).toHaveBeenCalledTimes(1)
    expect(activeSession.close).not.toHaveBeenCalled()
    expect(v2Sessions.has('idle-conv')).toBe(false)
    expect(v2Sessions.has('active-conv')).toBe(true)

    unregisterActiveSession('active-conv')

    expect(activeSession.close).toHaveBeenCalledTimes(1)
    expect(v2Sessions.has('active-conv')).toBe(false)
    expect(getActiveSession('active-conv')).toBeUndefined()
  })

  it('closes all sessions on shutdown', () => {
    const s1 = { close: vi.fn() }
    const s2 = { close: vi.fn() }
    v2Sessions.set('conv-1', makeSessionInfo(s1, { aiBrowserEnabled: false, skillsSignature: '', skillToolMode: 'mcp', browserAutomationMode: 'ai-browser' }) as any)
    v2Sessions.set('conv-2', makeSessionInfo(s2, { aiBrowserEnabled: true, skillsSignature: 'sig-2', skillToolMode: 'native', browserAutomationMode: 'system-browser' }) as any)

    closeAllV2Sessions()

    expect(s1.close).toHaveBeenCalledTimes(1)
    expect(s2.close).toHaveBeenCalledTimes(1)
    expect(v2Sessions.size).toBe(0)
  })
})
