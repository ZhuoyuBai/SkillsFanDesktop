import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  ensureSessionWarm: vi.fn(),
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

import {
  runtimeOrchestrator,
  sendMessage,
  ensureSessionWarm
} from '../../../../src/gateway/runtime/orchestrator'

describe('runtime orchestrator', () => {
  beforeEach(() => {
    runtimeOrchestrator.setRuntimeForTests(null)
    vi.clearAllMocks()
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
  })

  it('routes ensureSessionWarm through the default claude runtime', async () => {
    await ensureSessionWarm('space-1', 'conv-1')

    expect(mocks.ensureSessionWarm).toHaveBeenCalledTimes(1)
    expect(mocks.ensureSessionWarm).toHaveBeenCalledWith({
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })
  })

  it('keeps using the claude runtime when config mode is native', async () => {
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
  })
})
