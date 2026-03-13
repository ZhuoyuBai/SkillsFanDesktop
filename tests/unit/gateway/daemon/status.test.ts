import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteJsonSync } from '../../../../src/main/utils/atomic-write'

import {
  clearGatewayDaemonObservedLock,
  configureGatewayDaemonStatus,
  getGatewayDaemonStatus,
  initializeGatewayDaemonLockRuntime,
  registerGatewayDaemon,
  resetGatewayDaemonStatusForTests,
  setGatewayDaemonError,
  shutdownGatewayDaemonLockRuntime,
  unregisterGatewayDaemon
} from '../../../../src/gateway/daemon'

describe('gateway daemon status', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skillsfan-daemon-status-'))
  const statusFilePath = join(tempRoot, 'daemon.json')
  const lockFilePath = join(tempRoot, 'daemon.lock')

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
    mkdirSync(tempRoot, { recursive: true })
    resetGatewayDaemonStatusForTests()
    configureGatewayDaemonStatus({
      desiredMode: 'manual',
      statusFilePath,
      lockFilePath
    })
  })

  it('reports manual mode by default', () => {
    const status = getGatewayDaemonStatus()

    expect(status.desiredMode).toBe('manual')
    expect(status.state).toBe('manual-only')
  })

  it('reports daemon availability when configured for daemon mode on supported platforms', () => {
    const status = configureGatewayDaemonStatus({
      desiredMode: 'daemon',
      statusFilePath,
      lockFilePath
    })

    if (process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32') {
      expect(status.supported).toBe(true)
      expect(status.state).toBe('available')
    } else {
      expect(status.supported).toBe(false)
      expect(status.state).toBe('manual-only')
    }
  })

  it('surfaces runtime errors in daemon status', () => {
    configureGatewayDaemonStatus({
      desiredMode: 'daemon'
    })
    setGatewayDaemonError('launch failed')

    expect(getGatewayDaemonStatus()).toEqual(expect.objectContaining({
      state: 'error',
      lastError: 'launch failed'
    }))
  })

  it('registers and unregisters the daemon descriptor file', () => {
    const registered = registerGatewayDaemon()
    expect(registered.desiredMode).toBe('daemon')
    expect(registered.registered).toBe(true)
    expect(registered.statusFileExists).toBe(true)
    expect(registered.registeredAt).toBeTruthy()

    const unregistered = unregisterGatewayDaemon()
    expect(unregistered.desiredMode).toBe('manual')
    expect(unregistered.registered).toBe(false)
    expect(unregistered.statusFileExists).toBe(false)
  })

  it('publishes and clears daemon lock heartbeats', () => {
    const owned = initializeGatewayDaemonLockRuntime({
      processRole: 'external-gateway'
    })

    expect(owned.lockState).toBe('owned')
    expect(owned.lockOwner).toBe('external-gateway')
    expect(owned.lockPid).toBe(process.pid)
    expect(owned.lockFileExists).toBe(true)

    shutdownGatewayDaemonLockRuntime()

    expect(getGatewayDaemonStatus()).toEqual(expect.objectContaining({
      lockState: 'inactive',
      lockOwner: null,
      lockFileExists: false
    }))
  })

  it('clears an observed stale lock file', () => {
    atomicWriteJsonSync(lockFilePath, {
      version: 1,
      pid: 12345,
      owner: 'external-gateway',
      acquiredAt: '2000-01-01T00:00:00.000Z',
      lastHeartbeatAt: '2000-01-01T00:00:00.000Z'
    })

    expect(getGatewayDaemonStatus()).toEqual(expect.objectContaining({
      lockState: 'stale',
      lockFileExists: true
    }))

    expect(clearGatewayDaemonObservedLock()).toEqual(expect.objectContaining({
      lockState: 'inactive',
      lockFileExists: false,
      lastError: null
    }))
  })

  it('does not clear a lock owned by the current process', () => {
    initializeGatewayDaemonLockRuntime({
      processRole: 'external-gateway'
    })

    expect(clearGatewayDaemonObservedLock()).toEqual(expect.objectContaining({
      lockState: 'error',
      lastError: 'Cannot clear a gateway daemon lock owned by the current process.'
    }))
  })
})
