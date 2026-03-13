import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  startEmbeddedGateway: vi.fn(async () => {}),
  stopEmbeddedGateway: vi.fn(async () => {}),
  initializeGatewayCoreChannels: vi.fn(async () => {}),
  initializeGatewayChannelRelayRuntime: vi.fn(() => {}),
  initializeGatewayOptionalChannels: vi.fn(async () => {}),
  shutdownGatewayChannelRelayRuntime: vi.fn(() => {}),
  shutdownGatewayOptionalChannels: vi.fn(async () => {}),
  initializeGatewayProcessRuntime: vi.fn(() => ({
    state: 'embedded-owner'
  })),
  shutdownGatewayProcessRuntime: vi.fn(() => {}),
  configureGatewayCommandBus: vi.fn(() => {}),
  configureGatewayChannelRelay: vi.fn(() => {}),
  configureGatewayDaemonStatus: vi.fn(() => {}),
  initializeGatewayDaemonLockRuntime: vi.fn(() => {}),
  shutdownGatewayDaemonLockRuntime: vi.fn(() => {}),
  initializeGatewayCommandRuntime: vi.fn(() => {}),
  shutdownGatewayCommandRuntime: vi.fn(() => {}),
  ensureExternalGatewayLauncher: vi.fn(() => ({
    state: 'connected'
  })),
  shutdownExternalGatewayLauncher: vi.fn(() => {}),
  configureGatewaySnapshotStore: vi.fn(() => {}),
  initializeGatewaySnapshotSync: vi.fn(() => {}),
  shutdownGatewaySnapshotSync: vi.fn(() => {}),
  configureGatewaySessionStorePersistence: vi.fn(() => {}),
  hydrateGatewaySessionStoreFromDisk: vi.fn(() => []),
  initializeGatewayAutomation: vi.fn(() => ({
    initialized: true
  })),
  shutdownGatewayAutomation: vi.fn(() => {}),
  getHaloDir: vi.fn(() => '/tmp/skillsfan-test'),
  getConfig: vi.fn(() => ({
    gateway: {
      mode: 'embedded'
    }
  }))
}))

vi.mock('../../../src/gateway/server/embedded', () => ({
  startEmbeddedGateway: mocks.startEmbeddedGateway,
  stopEmbeddedGateway: mocks.stopEmbeddedGateway
}))

vi.mock('../../../src/gateway/server', () => ({
  configureGatewaySnapshotStore: mocks.configureGatewaySnapshotStore,
  initializeGatewaySnapshotSync: mocks.initializeGatewaySnapshotSync,
  shutdownGatewaySnapshotSync: mocks.shutdownGatewaySnapshotSync
}))

vi.mock('../../../src/gateway/channels', () => ({
  configureGatewayChannelRelay: mocks.configureGatewayChannelRelay,
  initializeGatewayCoreChannels: mocks.initializeGatewayCoreChannels,
  initializeGatewayChannelRelayRuntime: mocks.initializeGatewayChannelRelayRuntime,
  initializeGatewayOptionalChannels: mocks.initializeGatewayOptionalChannels,
  shutdownGatewayChannelRelayRuntime: mocks.shutdownGatewayChannelRelayRuntime,
  shutdownGatewayOptionalChannels: mocks.shutdownGatewayOptionalChannels
}))

vi.mock('../../../src/gateway/commands', () => ({
  configureGatewayCommandBus: mocks.configureGatewayCommandBus,
  initializeGatewayCommandRuntime: mocks.initializeGatewayCommandRuntime,
  shutdownGatewayCommandRuntime: mocks.shutdownGatewayCommandRuntime
}))

vi.mock('../../../src/gateway/daemon', () => ({
  configureGatewayDaemonStatus: mocks.configureGatewayDaemonStatus,
  initializeGatewayDaemonLockRuntime: mocks.initializeGatewayDaemonLockRuntime,
  shutdownGatewayDaemonLockRuntime: mocks.shutdownGatewayDaemonLockRuntime
}))

vi.mock('../../../src/gateway/process', () => ({
  ensureExternalGatewayLauncher: mocks.ensureExternalGatewayLauncher,
  initializeGatewayProcessRuntime: mocks.initializeGatewayProcessRuntime,
  shutdownExternalGatewayLauncher: mocks.shutdownExternalGatewayLauncher,
  shutdownGatewayProcessRuntime: mocks.shutdownGatewayProcessRuntime
}))

vi.mock('../../../src/gateway/sessions', () => ({
  configureGatewaySessionStorePersistence: mocks.configureGatewaySessionStorePersistence,
  hydrateGatewaySessionStoreFromDisk: mocks.hydrateGatewaySessionStoreFromDisk
}))

vi.mock('../../../src/gateway/automation', () => ({
  initializeGatewayAutomation: mocks.initializeGatewayAutomation,
  shutdownGatewayAutomation: mocks.shutdownGatewayAutomation
}))

vi.mock('../../../src/main/services/config.service', () => ({
  getHaloDir: mocks.getHaloDir,
  getConfig: mocks.getConfig
}))

import {
  initializeGatewayCore,
  initializeGatewayDeferred,
  shutdownGateway,
  shutdownGatewayDeferred
} from '../../../src/gateway/bootstrap'

describe('gateway bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      gateway: {
        mode: 'embedded'
      }
    })
  })

  it('initializes embedded gateway before the core channel runtime', async () => {
    const mainWindow = { id: 1 } as any

    await initializeGatewayCore(mainWindow)

    expect(mocks.initializeGatewayProcessRuntime).toHaveBeenCalledWith({
      filePath: '/tmp/skillsfan-test/gateway/process.json',
      mode: 'embedded',
      manageCurrentProcess: true,
      owner: 'electron-main'
    })
    expect(mocks.configureGatewayChannelRelay).toHaveBeenCalledWith(
      '/tmp/skillsfan-test/gateway/channel-relay'
    )
    expect(mocks.configureGatewayCommandBus).toHaveBeenCalledWith(
      '/tmp/skillsfan-test/gateway/commands'
    )
    expect(mocks.configureGatewayDaemonStatus).toHaveBeenCalledWith({
      desiredMode: 'manual',
      statusFilePath: '/tmp/skillsfan-test/gateway/daemon.json',
      lockFilePath: '/tmp/skillsfan-test/gateway/daemon.lock'
    })
    expect(mocks.configureGatewaySnapshotStore).toHaveBeenCalledWith(
      '/tmp/skillsfan-test/gateway/snapshots'
    )
    expect(mocks.configureGatewaySessionStorePersistence).toHaveBeenCalledWith(
      '/tmp/skillsfan-test/gateway/session-store.json'
    )
    expect(mocks.hydrateGatewaySessionStoreFromDisk).toHaveBeenCalledTimes(1)
    expect(mocks.startEmbeddedGateway).toHaveBeenCalledWith(mainWindow)
    expect(mocks.initializeGatewayCoreChannels).toHaveBeenCalledWith(mainWindow)
    expect(mocks.ensureExternalGatewayLauncher).not.toHaveBeenCalled()
  })

  it('launches the external gateway and skips deferred runtime startup in external mode', async () => {
    mocks.getConfig.mockReturnValue({
      gateway: {
        mode: 'external'
      }
    })

    const mainWindow = { id: 2 } as any

    await initializeGatewayCore(mainWindow)
    await initializeGatewayDeferred()

    expect(mocks.initializeGatewayProcessRuntime).toHaveBeenCalledWith({
      filePath: '/tmp/skillsfan-test/gateway/process.json',
      mode: 'external',
      manageCurrentProcess: false,
      owner: 'electron-main'
    })
    expect(mocks.ensureExternalGatewayLauncher).toHaveBeenCalledTimes(1)
    expect(mocks.initializeGatewayChannelRelayRuntime).toHaveBeenCalledWith({
      processRole: 'desktop-app'
    })
    expect(mocks.initializeGatewayAutomation).not.toHaveBeenCalled()
    expect(mocks.initializeGatewayOptionalChannels).not.toHaveBeenCalled()
    expect(mocks.initializeGatewaySnapshotSync).not.toHaveBeenCalled()
  })

  it('initializes deferred gateway services through automation and optional channels', async () => {
    await initializeGatewayDeferred()

    expect(mocks.initializeGatewayAutomation).toHaveBeenCalledTimes(1)
    expect(mocks.initializeGatewayOptionalChannels).toHaveBeenCalledTimes(1)
    expect(mocks.initializeGatewayChannelRelayRuntime).not.toHaveBeenCalled()
    expect(mocks.initializeGatewaySnapshotSync).not.toHaveBeenCalled()
    expect(mocks.initializeGatewayCommandRuntime).not.toHaveBeenCalled()
  })

  it('starts snapshot sync for the external gateway process role', async () => {
    await initializeGatewayDeferred({
      processRole: 'external-gateway'
    })

    expect(mocks.initializeGatewayAutomation).toHaveBeenCalledTimes(1)
    expect(mocks.initializeGatewayOptionalChannels).toHaveBeenCalledTimes(1)
    expect(mocks.initializeGatewayDaemonLockRuntime).toHaveBeenCalledWith({
      processRole: 'external-gateway'
    })
    expect(mocks.initializeGatewayCommandRuntime).toHaveBeenCalledWith({
      processRole: 'external-gateway'
    })
    expect(mocks.initializeGatewaySnapshotSync).toHaveBeenCalledWith({
      processRole: 'external-gateway'
    })
  })

  it('shuts down deferred services separately from the full gateway shutdown', async () => {
    await shutdownGatewayDeferred()
    await shutdownGateway()

    expect(mocks.shutdownGatewayOptionalChannels).toHaveBeenCalledTimes(2)
    expect(mocks.shutdownGatewayAutomation).toHaveBeenCalledTimes(2)
    expect(mocks.stopEmbeddedGateway).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownGatewayChannelRelayRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownGatewayDaemonLockRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownGatewayCommandRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownExternalGatewayLauncher).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownGatewaySnapshotSync).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownGatewayProcessRuntime).toHaveBeenCalledTimes(1)
  })
})
