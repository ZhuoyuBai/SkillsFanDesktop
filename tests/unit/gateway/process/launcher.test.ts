import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  getAppPath: vi.fn(() => '/app/path'),
  getConfig: vi.fn(() => ({
    gateway: {
      mode: 'external'
    }
  })),
  getGatewayProcessStatus: vi.fn(() => ({
    configuredMode: 'external',
    state: 'awaiting-external',
    managedByCurrentProcess: false,
    owner: null,
    filePath: '/tmp/gateway/process.json',
    pid: null,
    startedAt: null,
    lastHeartbeatAt: null,
    heartbeatAgeMs: null,
    lastError: null
  }))
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: mocks.getAppPath
  }
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/gateway/process/runtime', () => ({
  getGatewayProcessStatus: mocks.getGatewayProcessStatus,
  hasFreshObservedExternalGatewayProcess: vi.fn((status) => (
    status?.configuredMode === 'external'
    && status?.managedByCurrentProcess === false
    && typeof status?.pid === 'number'
    && typeof status?.heartbeatAgeMs === 'number'
    && status.heartbeatAgeMs <= 15000
  ))
}))

import {
  ensureExternalGatewayLauncher,
  getGatewayLauncherStatus,
  recoverExternalGatewayLauncher,
  resetGatewayLauncherForTests
} from '../../../../src/gateway/process'

class MockChildProcess extends EventEmitter {
  pid = 43210
  killed = false

  unref(): void {}
}

describe('external gateway launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGatewayLauncherForTests()
    mocks.getConfig.mockReturnValue({
      gateway: {
        mode: 'external'
      }
    })
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'awaiting-external',
      managedByCurrentProcess: false,
      owner: null,
      filePath: '/tmp/gateway/process.json',
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      heartbeatAgeMs: null,
      lastError: null
    })
  })

  it('spawns a detached gateway-only process when external mode is enabled and no process is observed', () => {
    const child = new MockChildProcess()
    mocks.spawn.mockReturnValue(child as any)

    const status = ensureExternalGatewayLauncher()

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/app/path', '--gateway-external'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          SKILLSFAN_GATEWAY_ROLE: 'external',
          SKILLSFAN_GATEWAY_ONLY: '1'
        })
      })
    )
    expect(status.state).toBe('launching')
  })

  it('does not spawn a new process when an external gateway heartbeat is already observed', () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 7777,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 100,
      lastError: null
    })

    const status = ensureExternalGatewayLauncher()

    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(status.state).toBe('connected')
    expect(status.observedExternalProcess).toBe(true)
  })

  it('schedules reconnect when the launched child exits', () => {
    vi.useFakeTimers()

    const child = new MockChildProcess()
    mocks.spawn.mockReturnValue(child as any)

    ensureExternalGatewayLauncher()
    child.emit('exit', 0)

    const status = getGatewayLauncherStatus()
    expect(status.state).toBe('reconnect-wait')
    expect(status.reconnectScheduled).toBe(true)

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('can recover immediately while reconnect is pending', () => {
    vi.useFakeTimers()

    const childA = new MockChildProcess()
    const childB = new MockChildProcess()
    mocks.spawn
      .mockReturnValueOnce(childA as any)
      .mockReturnValueOnce(childB as any)

    ensureExternalGatewayLauncher()
    childA.emit('exit', 0)

    const pendingStatus = getGatewayLauncherStatus()
    expect(pendingStatus.state).toBe('reconnect-wait')
    expect(pendingStatus.reconnectScheduled).toBe(true)

    const recoveredStatus = recoverExternalGatewayLauncher()

    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    expect(recoveredStatus.state).toBe('launching')
    expect(recoveredStatus.reconnectScheduled).toBe(false)

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })
})
