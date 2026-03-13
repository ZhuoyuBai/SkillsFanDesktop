import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const channels = new Map<string, any>()

  const manager = {
    registerChannel: vi.fn((channel: any) => {
      channels.set(channel.id, channel)
    }),
    getChannel: vi.fn((id: string) => channels.get(id)),
    getChannelIds: vi.fn(() => Array.from(channels.keys()))
  }

  class MockElectronChannel {
    readonly id = 'electron'
    readonly name = 'Electron IPC'
    initialize = vi.fn(async () => {})
    setMainWindow = vi.fn()
  }

  class MockRemoteWebChannel {
    readonly id = 'remote-web'
    readonly name = 'Remote Web'
    initialize = vi.fn(async () => {})
  }

  class MockFeishuChannel {
    readonly id = 'feishu'
    readonly name = 'Feishu Bot'
    initialize = vi.fn(async () => {})
    shutdown = vi.fn(async () => {})
    getBotService = vi.fn(() => ({
      getStatus: () => ({
        enabled: true,
        connected: true,
        botName: 'Test Bot',
        activeSessions: 0
      })
    }))
    getSessionRouter = vi.fn(() => ({
      getSessionCount: () => 2
    }))
  }

  return {
    channels,
    manager,
    MockElectronChannel,
    MockRemoteWebChannel,
    MockFeishuChannel
  }
})

vi.mock('../../../../src/main/services/channel', () => ({
  getChannelManager: () => mocks.manager,
  ElectronChannel: mocks.MockElectronChannel,
  RemoteWebChannel: mocks.MockRemoteWebChannel,
  FeishuChannel: mocks.MockFeishuChannel
}))

import {
  getGatewayChannelStatus,
  getGatewayFeishuChannel,
  initializeGatewayCoreChannels,
  initializeGatewayOptionalChannels,
  resetGatewayChannelsForTests,
  shutdownGatewayOptionalChannels
} from '../../../../src/gateway/channels'

describe('gateway channel runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.channels.clear()
    resetGatewayChannelsForTests()
  })

  it('registers the core channels and wires the Electron main window', async () => {
    const mainWindow = { id: 1 } as any

    const status = await initializeGatewayCoreChannels(mainWindow)

    expect(status.coreInitialized).toBe(true)
    expect(status.registeredChannelIds).toEqual(['electron', 'remote-web'])

    const electronChannel = mocks.channels.get('electron')
    expect(electronChannel.setMainWindow).toHaveBeenCalledWith(mainWindow)
  })

  it('registers and initializes the Feishu channel once through the optional gateway path', async () => {
    await initializeGatewayOptionalChannels()
    await initializeGatewayOptionalChannels()

    const feishuChannel = getGatewayFeishuChannel() as any

    expect(feishuChannel).toBeTruthy()
    expect(feishuChannel.initialize).toHaveBeenCalledTimes(1)
    expect(getGatewayChannelStatus()).toEqual({
      coreInitialized: false,
      optionalInitialized: true,
      registeredChannelIds: ['feishu'],
      feishu: {
        registered: true,
        enabled: true,
        connected: true,
        botName: 'Test Bot',
        activeSessions: 2
      }
    })
  })

  it('shuts down the optional Feishu channel without clearing core registration state', async () => {
    await initializeGatewayOptionalChannels()

    const feishuChannel = getGatewayFeishuChannel() as any
    await shutdownGatewayOptionalChannels()

    expect(feishuChannel.shutdown).toHaveBeenCalledTimes(1)
    expect(getGatewayChannelStatus().optionalInitialized).toBe(false)
    expect(getGatewayChannelStatus().registeredChannelIds).toEqual(['feishu'])
  })
})
