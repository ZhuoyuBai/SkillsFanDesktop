import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearGatewayObservedProcessRecord,
  getGatewayProcessStatus,
  initializeGatewayProcessRuntime,
  resetGatewayProcessRuntimeForTests,
  shutdownGatewayProcessRuntime
} from '../../../../src/gateway/process'

describe('gateway process runtime', () => {
  const testDir = join(tmpdir(), `skillsfan-gateway-process-${process.pid}`)
  const filePath = join(testDir, 'process.json')

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    resetGatewayProcessRuntimeForTests()
  })

  afterEach(() => {
    shutdownGatewayProcessRuntime()
    resetGatewayProcessRuntimeForTests()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('owns and persists gateway process metadata in embedded mode', () => {
    const status = initializeGatewayProcessRuntime({
      filePath,
      mode: 'embedded'
    })

    expect(status.state).toBe('embedded-owner')
    expect(status.managedByCurrentProcess).toBe(true)
    expect(status.pid).toBe(process.pid)
    expect(existsSync(filePath)).toBe(true)

    const payload = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(payload).toMatchObject({
      version: 1,
      pid: process.pid,
      mode: 'embedded',
      owner: 'electron-main'
    })
  })

  it('observes external gateway metadata when running in external mode', () => {
    writeFileSync(filePath, JSON.stringify({
      version: 1,
      pid: 99999,
      mode: 'external',
      owner: 'external-gateway',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString()
    }))

    initializeGatewayProcessRuntime({
      filePath,
      mode: 'external'
    })

    const status = getGatewayProcessStatus()
    expect(status.state).toBe('external-observed')
    expect(status.managedByCurrentProcess).toBe(false)
    expect(status.pid).toBe(99999)
  })

  it('treats stale external process metadata as awaiting external process', () => {
    writeFileSync(filePath, JSON.stringify({
      version: 1,
      pid: 99999,
      mode: 'external',
      owner: 'external-gateway',
      startedAt: '2025-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2025-03-12T08:00:05.000Z'
    }))

    initializeGatewayProcessRuntime({
      filePath,
      mode: 'external'
    })

    const status = getGatewayProcessStatus()
    expect(status.state).toBe('awaiting-external')
    expect(status.managedByCurrentProcess).toBe(false)
    expect(status.pid).toBe(99999)
  })

  it('clears observed process metadata when requested', () => {
    writeFileSync(filePath, JSON.stringify({
      version: 1,
      pid: 99999,
      mode: 'external',
      owner: 'external-gateway',
      startedAt: '2025-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2025-03-12T08:00:05.000Z'
    }))

    initializeGatewayProcessRuntime({
      filePath,
      mode: 'external'
    })

    const status = clearGatewayObservedProcessRecord()

    expect(existsSync(filePath)).toBe(false)
    expect(status.state).toBe('awaiting-external')
    expect(status.pid).toBe(null)
  })

  it('cleans up managed process metadata on shutdown', () => {
    initializeGatewayProcessRuntime({
      filePath,
      mode: 'embedded'
    })

    shutdownGatewayProcessRuntime()

    expect(existsSync(filePath)).toBe(false)
    expect(getGatewayProcessStatus().state).toBe('inactive')
  })
})
