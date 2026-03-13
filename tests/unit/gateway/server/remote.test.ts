import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  startHttpServer: vi.fn(async () => ({
    port: 3847,
    token: 'token-123'
  })),
  stopHttpServer: vi.fn(),
  isServerRunning: vi.fn(() => false),
  getServerInfo: vi.fn(() => ({
    running: false,
    port: 0,
    token: null,
    clients: 0
  })),
  startTunnel: vi.fn(async (port: number) => `https://tunnel.example.com/${port}`),
  stopTunnel: vi.fn(async () => {}),
  getTunnelStatus: vi.fn(() => ({
    status: 'stopped',
    url: null,
    error: null
  })),
  onTunnelStatusChange: vi.fn(),
  getConfig: vi.fn(() => ({
    remoteAccess: {
      enabled: false,
      port: 3456
    }
  })),
  saveConfig: vi.fn(),
  setCustomAccessToken: vi.fn(() => true),
  generateAccessToken: vi.fn(),
  networkInterfaces: vi.fn(() => ({
    en0: [
      {
        address: '192.168.1.8',
        family: 'IPv4',
        internal: false
      }
    ]
  }))
}))

vi.mock('os', () => ({
  networkInterfaces: mocks.networkInterfaces
}))

vi.mock('../../../../src/gateway/server/http', () => ({
  startHttpServer: mocks.startHttpServer,
  stopHttpServer: mocks.stopHttpServer,
  isServerRunning: mocks.isServerRunning,
  getServerInfo: mocks.getServerInfo
}))

vi.mock('../../../../src/main/services/tunnel.service', () => ({
  startTunnel: mocks.startTunnel,
  stopTunnel: mocks.stopTunnel,
  getTunnelStatus: mocks.getTunnelStatus,
  onTunnelStatusChange: mocks.onTunnelStatusChange
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig
}))

vi.mock('../../../../src/main/http/auth', () => ({
  setCustomAccessToken: mocks.setCustomAccessToken,
  generateAccessToken: mocks.generateAccessToken
}))

import {
  disableRemoteAccess,
  enableRemoteAccess,
  enableTunnel,
  getRemoteAccessStatus
} from '../../../../src/gateway/server/remote'

describe('gateway remote access service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isServerRunning.mockReturnValue(false)
    mocks.getConfig.mockReturnValue({
      remoteAccess: {
        enabled: false,
        port: 3456
      }
    })
    mocks.getServerInfo.mockReturnValue({
      running: false,
      port: 0,
      token: null,
      clients: 0
    })
    mocks.getTunnelStatus.mockReturnValue({
      status: 'stopped',
      url: null,
      error: null
    })
    mocks.networkInterfaces.mockReturnValue({
      en0: [
        {
          address: '192.168.1.8',
          family: 'IPv4',
          internal: false
        }
      ]
    })
  })

  it('enables remote access through the gateway http boundary and persists config', async () => {
    mocks.getServerInfo.mockReturnValue({
      running: true,
      port: 3847,
      token: 'token-123',
      clients: 2
    })

    const status = await enableRemoteAccess(null)

    expect(mocks.startHttpServer).toHaveBeenCalledWith(null, undefined)
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      remoteAccess: {
        enabled: true,
        port: 3847
      }
    }))
    expect(status).toEqual({
      enabled: true,
      server: {
        running: true,
        port: 3847,
        token: 'token-123',
        localUrl: 'http://localhost:3847',
        lanUrl: 'http://192.168.1.8:3847'
      },
      tunnel: {
        status: 'stopped',
        url: null,
        error: null
      },
      clients: 2
    })
  })

  it('disables remote access through the gateway http boundary and persists config', async () => {
    mocks.getConfig.mockReturnValue({
      remoteAccess: {
        enabled: true,
        port: 3847
      }
    })

    await disableRemoteAccess()

    expect(mocks.stopTunnel).toHaveBeenCalledTimes(1)
    expect(mocks.stopHttpServer).toHaveBeenCalledTimes(1)
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      remoteAccess: {
        enabled: false,
        port: 3847
      }
    }))
  })

  it('aggregates server and tunnel status from the gateway boundary', () => {
    mocks.getServerInfo.mockReturnValue({
      running: true,
      port: 4000,
      token: 'abc',
      clients: 1
    })
    mocks.getTunnelStatus.mockReturnValue({
      status: 'running',
      url: 'https://skillsfan.example.com',
      error: null
    })

    expect(getRemoteAccessStatus()).toEqual({
      enabled: true,
      server: {
        running: true,
        port: 4000,
        token: 'abc',
        localUrl: 'http://localhost:4000',
        lanUrl: 'http://192.168.1.8:4000'
      },
      tunnel: {
        status: 'running',
        url: 'https://skillsfan.example.com',
        error: null
      },
      clients: 1
    })
  })

  it('requires a running gateway http server before enabling the tunnel', async () => {
    await expect(enableTunnel()).rejects.toThrow('HTTP server is not running. Enable remote access first.')

    mocks.getServerInfo.mockReturnValue({
      running: true,
      port: 3847,
      token: 'token-123',
      clients: 0
    })

    await expect(enableTunnel()).resolves.toBe('https://tunnel.example.com/3847')
    expect(mocks.startTunnel).toHaveBeenCalledWith(3847)
  })
})
