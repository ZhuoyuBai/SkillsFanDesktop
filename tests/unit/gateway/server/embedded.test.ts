import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({
    gateway: {
      enabled: false,
      mode: 'embedded'
    }
  })),
  disableRemoteAccess: vi.fn(async () => {}),
  getRemoteAccessStatus: vi.fn(() => ({
    enabled: false,
    server: {
      running: false,
      port: 0,
      token: null,
      localUrl: null,
      lanUrl: null
    },
    tunnel: {
      status: 'stopped',
      url: null,
      error: null
    },
    clients: 0
  }))
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/gateway/server/remote', () => ({
  disableRemoteAccess: mocks.disableRemoteAccess,
  getRemoteAccessStatus: mocks.getRemoteAccessStatus
}))

import {
  getEmbeddedGatewayMainWindow,
  getEmbeddedGatewayStatus,
  resetEmbeddedGatewayForTests,
  startEmbeddedGateway,
  stopEmbeddedGateway
} from '../../../../src/gateway/server/embedded'

describe('embedded gateway lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetEmbeddedGatewayForTests()
    mocks.getConfig.mockReturnValue({
      gateway: {
        enabled: false,
        mode: 'embedded'
      }
    })
    mocks.getRemoteAccessStatus.mockReturnValue({
      enabled: false,
      server: {
        running: false,
        port: 0,
        token: null,
        localUrl: null,
        lanUrl: null
      },
      tunnel: {
        status: 'stopped',
        url: null,
        error: null
      },
      clients: 0
    })
  })

  it('starts the embedded gateway in embedded mode and keeps the main window reference', async () => {
    const mainWindow = { id: 1 } as any

    const status = await startEmbeddedGateway(mainWindow)

    expect(status.state).toBe('running')
    expect(status.mode).toBe('embedded')
    expect(status.featureEnabled).toBe(false)
    expect(status.startedAt).toBeTruthy()
    expect(getEmbeddedGatewayMainWindow()).toBe(mainWindow)
  })

  it('reports external mode without starting the embedded gateway', async () => {
    mocks.getConfig.mockReturnValue({
      gateway: {
        enabled: true,
        mode: 'external'
      }
    })

    const status = await startEmbeddedGateway({ id: 2 } as any)

    expect(status).toEqual({
      state: 'external',
      mode: 'external',
      featureEnabled: true,
      startedAt: null,
      remoteAccess: {
        enabled: false,
        running: false,
        clients: 0,
        tunnelStatus: 'stopped'
      }
    })
    expect(getEmbeddedGatewayMainWindow()).toBeNull()
  })

  it('aggregates remote access state in gateway status', async () => {
    await startEmbeddedGateway({ id: 3 } as any)
    mocks.getRemoteAccessStatus.mockReturnValue({
      enabled: true,
      server: {
        running: true,
        port: 3847,
        token: 'token-123',
        localUrl: 'http://localhost:3847',
        lanUrl: 'http://192.168.0.8:3847'
      },
      tunnel: {
        status: 'running',
        url: 'https://example.com',
        error: null
      },
      clients: 2
    })

    expect(getEmbeddedGatewayStatus()).toEqual({
      state: 'running',
      mode: 'embedded',
      featureEnabled: false,
      startedAt: expect.any(String),
      remoteAccess: {
        enabled: true,
        running: true,
        clients: 2,
        tunnelStatus: 'running'
      }
    })
  })

  it('stops the embedded gateway and shuts down remote access when running', async () => {
    await startEmbeddedGateway({ id: 4 } as any)

    await stopEmbeddedGateway()

    expect(mocks.disableRemoteAccess).toHaveBeenCalledTimes(1)
    expect(getEmbeddedGatewayMainWindow()).toBeNull()
    expect(getEmbeddedGatewayStatus()).toEqual({
      state: 'stopped',
      mode: 'embedded',
      featureEnabled: false,
      startedAt: null,
      remoteAccess: {
        enabled: false,
        running: false,
        clients: 0,
        tunnelStatus: 'stopped'
      }
    })
  })
})
