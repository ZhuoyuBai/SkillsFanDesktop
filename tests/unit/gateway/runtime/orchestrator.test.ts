import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGatewaySessionStoreForTests, getGatewaySession, listGatewaySessions } from '../../../../src/gateway/sessions'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  ensureSessionWarm: vi.fn(),
  nativeSendMessage: vi.fn(),
  nativeEnsureSessionWarm: vi.fn(),
  syncNativeRuntimeRegistration: vi.fn(),
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async () => ({ accepted: true, conversationId: 'conv-1' })),
  getConfig: vi.fn(() => ({
    runtime: {
      mode: 'claude-sdk'
    }
  }))
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/gateway/runtime/claude-sdk/runtime', () => ({
  claudeSdkRuntime: {
    kind: 'claude-sdk',
    sendMessage: mocks.sendMessage,
    ensureSessionWarm: mocks.ensureSessionWarm
  }
}))

vi.mock('../../../../src/gateway/runtime/registration', () => ({
  syncNativeRuntimeRegistration: mocks.syncNativeRuntimeRegistration
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

import {
  runtimeOrchestrator,
  sendMessage,
  ensureSessionWarm
} from '../../../../src/gateway/runtime/orchestrator'

describe('runtime orchestrator', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    runtimeOrchestrator.resetForTests()
    clearGatewaySessionStoreForTests()
    vi.clearAllMocks()
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
    mocks.executeGatewayCommand.mockResolvedValue({
      accepted: true,
      conversationId: 'conv-1'
    })
    mocks.syncNativeRuntimeRegistration.mockImplementation(() => ({
      enabled: false,
      status: {
        ready: false,
        readinessReasonId: 'adapter-unavailable',
        note: 'The current model is not in the automatic handling range yet.'
      }
    }))
    mocks.getConfig.mockReturnValue({
      runtime: {
        mode: 'claude-sdk'
      }
    })
  })

  it('routes sendMessage through the default claude runtime', async () => {
    const request = {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello'
    } as any

    await sendMessage(null, request)

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      mainWindow: null,
      request
    })
    expect(mocks.syncNativeRuntimeRegistration).toHaveBeenCalledTimes(1)
    expect(getGatewaySession('agent=main|workspace=space-1|account=local-user|peerType=direct|peerId=conv-1')).toMatchObject({
      status: 'active',
      conversationIds: ['conv-1']
    })
  })

  it('routes ensureSessionWarm through the default claude runtime', async () => {
    await ensureSessionWarm('space-1', 'conv-1')

    expect(mocks.ensureSessionWarm).toHaveBeenCalledTimes(1)
    expect(mocks.ensureSessionWarm).toHaveBeenCalledWith({
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })
    expect(getGatewaySession('agent=main|workspace=space-1|account=local-user|peerType=direct|peerId=conv-1')).toMatchObject({
      status: 'idle'
    })
  })

  it('falls back to the claude runtime when config mode is native without a registered native runtime', async () => {
    mocks.getConfig.mockReturnValue({
      runtime: {
        mode: 'native'
      }
    })

    const request = {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello'
    } as any

    await sendMessage(null, request)

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      mainWindow: null,
      request
    })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Runtime] runtime.mode="native" is configured, but no native runtime is registered. Falling back to claude-sdk. (runtime.mode prefers native, but it is currently held back (The current model is not in the automatic handling range yet.))'
    )
  })

  it('routes through the registered native runtime when config mode is native', async () => {
    runtimeOrchestrator.registerRuntime({
      kind: 'native',
      sendMessage: mocks.nativeSendMessage,
      ensureSessionWarm: mocks.nativeEnsureSessionWarm
    })
    mocks.getConfig.mockReturnValue({
      runtime: {
        mode: 'native'
      }
    })

    await sendMessage(null, {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello'
    } as any)
    await ensureSessionWarm('space-1', 'conv-1')

    expect(mocks.nativeSendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.nativeEnsureSessionWarm).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('routes lightweight hybrid requests through the registered native runtime', async () => {
    runtimeOrchestrator.registerRuntime({
      kind: 'native',
      sendMessage: mocks.nativeSendMessage,
      ensureSessionWarm: mocks.nativeEnsureSessionWarm
    })
    mocks.getConfig.mockReturnValue({
      runtime: {
        mode: 'hybrid'
      }
    })

    await sendMessage(null, {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello'
    } as any)

    expect(mocks.nativeSendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('reports registered runtime kinds for health consumers', () => {
    runtimeOrchestrator.registerRuntime({
      kind: 'native',
      sendMessage: mocks.nativeSendMessage,
      ensureSessionWarm: mocks.nativeEnsureSessionWarm
    })

    expect(runtimeOrchestrator.listRegisteredRuntimeKinds()).toEqual(['claude-sdk', 'native'])
    expect(runtimeOrchestrator.hasRuntime('native')).toBe(true)
  })

  it('keeps complex hybrid requests on the claude runtime', async () => {
    runtimeOrchestrator.registerRuntime({
      kind: 'native',
      sendMessage: mocks.nativeSendMessage,
      ensureSessionWarm: mocks.nativeEnsureSessionWarm
    })
    mocks.getConfig.mockReturnValue({
      runtime: {
        mode: 'hybrid'
      }
    })

    await sendMessage(null, {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'ralph task',
      runtimeTaskHint: {
        complexity: 'complex',
        tags: ['ralph'],
        requiresClaudeSdkOrchestration: true
      }
    } as any)

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.nativeSendMessage).not.toHaveBeenCalled()
  })

  it('stores route-hinted sessions separately from the default local route', async () => {
    await sendMessage(null, {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello',
      routeHint: {
        channel: 'feishu',
        accountId: 'open-user-1',
        peerType: 'group',
        peerId: 'chat-1'
      }
    } as any)

    expect(listGatewaySessions().map((session) => session.route.channel)).toEqual(['feishu'])
    expect(listGatewaySessions()[0]).toMatchObject({
      route: {
        channel: 'feishu',
        accountId: 'open-user-1',
        peerType: 'group',
        peerId: 'chat-1'
      }
    })
  })

  it('delegates sendMessage to the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    const request = {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      message: 'hello from ui'
    } as any

    await sendMessage(null, request)

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.send-message', {
      request
    })
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('delegates ensureSessionWarm to the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)
    mocks.executeGatewayCommand.mockResolvedValue({
      warmed: true,
      conversationId: 'conv-1'
    })

    await ensureSessionWarm('space-1', 'conv-1', {
      channel: 'electron'
    })

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.ensure-session-warm', {
      spaceId: 'space-1',
      conversationId: 'conv-1',
      routeHint: {
        channel: 'electron'
      }
    })
    expect(mocks.ensureSessionWarm).not.toHaveBeenCalled()
  })
})
