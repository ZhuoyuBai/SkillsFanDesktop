import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initWebSocket: vi.fn(),
  shutdownWebSocket: vi.fn(),
  broadcastToWebSocket: vi.fn(),
  broadcastToAll: vi.fn(),
  getClientCount: vi.fn(() => 3),
  getSendStrategy: vi.fn(() => 'reliable'),
  checkSlowConsumer: vi.fn(() => 'ok'),
  sendToClientEnhanced: vi.fn(() => true),
  sendThrottled: vi.fn(),
  flushThrottled: vi.fn()
}))

vi.mock('../../../../src/main/http/websocket', () => ({
  initWebSocket: mocks.initWebSocket,
  shutdownWebSocket: mocks.shutdownWebSocket,
  broadcastToWebSocket: mocks.broadcastToWebSocket,
  broadcastToAll: mocks.broadcastToAll,
  getClientCount: mocks.getClientCount,
  getSendStrategy: mocks.getSendStrategy,
  checkSlowConsumer: mocks.checkSlowConsumer,
  sendToClientEnhanced: mocks.sendToClientEnhanced,
  sendThrottled: mocks.sendThrottled,
  flushThrottled: mocks.flushThrottled
}))

import {
  broadcastToAll,
  broadcastToWebSocket,
  getClientCount,
  initWebSocket,
  shutdownWebSocket
} from '../../../../src/gateway/server/ws'

describe('gateway websocket facade', () => {
  it('forwards websocket lifecycle and broadcast calls to the legacy implementation', () => {
    const server = {} as any

    initWebSocket(server)
    broadcastToWebSocket('agent:start', { conversationId: 'conv-1' })
    broadcastToAll({ type: 'ping' })
    shutdownWebSocket()

    expect(mocks.initWebSocket).toHaveBeenCalledWith(server)
    expect(mocks.broadcastToWebSocket).toHaveBeenCalledWith('agent:start', { conversationId: 'conv-1' })
    expect(mocks.broadcastToAll).toHaveBeenCalledWith({ type: 'ping' })
    expect(mocks.shutdownWebSocket).toHaveBeenCalledTimes(1)
    expect(getClientCount()).toBe(3)
  })
})
