import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getGatewayProcessStatus: vi.fn(() => ({
    configuredMode: 'external',
    state: 'external-observed',
    managedByCurrentProcess: true,
    owner: 'external-gateway',
    filePath: '/tmp/gateway/process.json',
    pid: 5252,
    startedAt: '2026-03-12T08:00:00.000Z',
    lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
    heartbeatAgeMs: 10,
    lastError: null
  })),
  dispatchEvent: vi.fn(() => {}),
  dispatchGlobal: vi.fn(() => {})
}))

vi.mock('../../../../src/gateway/process', () => ({
  getGatewayProcessStatus: mocks.getGatewayProcessStatus
}))

vi.mock('../../../../src/main/services/channel/channel-manager', () => ({
  getChannelManager: () => ({
    dispatchEvent: mocks.dispatchEvent,
    dispatchGlobal: mocks.dispatchGlobal
  })
}))

import {
  configureGatewayChannelRelay,
  getGatewayChannelRelayStatus,
  initializeGatewayChannelRelayRuntime,
  processGatewayChannelRelayNow,
  relayGatewayConversationEvent,
  relayGatewayGlobalEvent,
  resetGatewayChannelRelayForTests,
  shouldRelayGatewayChannelEvents,
  shutdownGatewayChannelRelayRuntime
} from '../../../../src/gateway/channels/relay'

describe('gateway channel relay', () => {
  const relayDir = join(tmpdir(), `skillsfan-channel-relay-${process.pid}`)

  beforeEach(() => {
    vi.clearAllMocks()
    rmSync(relayDir, { recursive: true, force: true })
    mkdirSync(relayDir, { recursive: true })
    resetGatewayChannelRelayForTests()
    configureGatewayChannelRelay(relayDir)
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: true,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 5252,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
  })

  afterEach(() => {
    shutdownGatewayChannelRelayRuntime()
    resetGatewayChannelRelayForTests()
    rmSync(relayDir, { recursive: true, force: true })
  })

  it('publishes outbound events when the current process owns the external gateway', () => {
    expect(shouldRelayGatewayChannelEvents()).toBe(true)

    relayGatewayConversationEvent({
      type: 'agent:start',
      spaceId: 'space-1',
      conversationId: 'conv-1',
      payload: {
        spaceId: 'space-1',
        conversationId: 'conv-1'
      },
      timestamp: Date.now()
    })

    relayGatewayGlobalEvent('agent:mcp-status', {
      providers: 1
    })

    expect(getGatewayChannelRelayStatus()).toEqual(expect.objectContaining({
      mode: 'publishing',
      queuedEventCount: 2
    }))
  })

  it('consumes relayed events through the local channel manager in observer mode', async () => {
    relayGatewayConversationEvent({
      type: 'agent:message',
      spaceId: 'space-1',
      conversationId: 'conv-1',
      payload: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        content: 'hello'
      },
      timestamp: Date.now()
    })
    relayGatewayGlobalEvent('agent:mcp-status', {
      providers: 1
    })

    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 5252,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })

    await processGatewayChannelRelayNow({
      processRole: 'desktop-app'
    })

    expect(mocks.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent:message',
      conversationId: 'conv-1'
    }))
    expect(mocks.dispatchGlobal).toHaveBeenCalledWith('agent:mcp-status', {
      providers: 1
    })
    expect(getGatewayChannelRelayStatus()).toEqual(expect.objectContaining({
      mode: 'inactive',
      queuedEventCount: 0
    }))
  })

  it('starts a polling consumer only for the desktop app observer role', () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 5252,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })

    initializeGatewayChannelRelayRuntime({
      processRole: 'desktop-app'
    })

    expect(getGatewayChannelRelayStatus()).toEqual(expect.objectContaining({
      mode: 'consuming',
      consumerActive: true
    }))
  })
})
