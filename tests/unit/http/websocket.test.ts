/**
 * WebSocket Network Optimization Unit Tests
 *
 * Tests for event classification, slow consumer detection, enhanced send,
 * delta throttling, and broadcast functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ws module before importing websocket module
vi.mock('ws', () => ({
  WebSocket: { OPEN: 1, CLOSED: 3 },
  WebSocketServer: vi.fn()
}))

// Mock auth module
vi.mock('../../../src/main/http/auth', () => ({
  validateToken: vi.fn(() => true)
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid')
}))

import { WebSocket } from 'ws'
import type { WebSocketClient, SendStrategy } from '../../../src/main/http/websocket'
import {
  getSendStrategy,
  getUpgradeToken,
  checkSlowConsumer,
  sendToClientEnhanced,
  sendThrottled,
  flushThrottled
} from '../../../src/main/http/websocket'

// ============================================
// Mock Helpers
// ============================================

function createMockClient(overrides?: Partial<WebSocketClient>): WebSocketClient {
  return {
    id: 'test-client-1',
    ws: {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn()
    } as any,
    authenticated: true,
    subscriptions: new Set(['conv-1']),
    seq: 0,
    throttleState: new Map(),
    isSlowConsumer: false,
    ...overrides
  }
}

// ============================================
// 1. getSendStrategy Event Classification
// ============================================

describe('getSendStrategy', () => {
  it('1.1: agent:message returns throttled', () => {
    expect(getSendStrategy('agent:message')).toBe('throttled')
  })

  it('1.2: agent:thought returns dropIfSlow', () => {
    expect(getSendStrategy('agent:thought')).toBe('dropIfSlow')
  })

  it('1.3: agent:complete returns reliable', () => {
    expect(getSendStrategy('agent:complete')).toBe('reliable')
  })

  it('1.4: agent:error returns reliable', () => {
    expect(getSendStrategy('agent:error')).toBe('reliable')
  })

  it('1.5: agent:tool-call returns reliable', () => {
    expect(getSendStrategy('agent:tool-call')).toBe('reliable')
  })

  it('1.6: agent:tool-result returns reliable', () => {
    expect(getSendStrategy('agent:tool-result')).toBe('reliable')
  })

  it('1.7: agent:compact returns reliable', () => {
    expect(getSendStrategy('agent:compact')).toBe('reliable')
  })

  it('1.8: agent:queued returns reliable', () => {
    expect(getSendStrategy('agent:queued')).toBe('reliable')
  })

  it('1.9: agent:start returns reliable', () => {
    expect(getSendStrategy('agent:start')).toBe('reliable')
  })

  it('1.10: unknown channel returns dropIfSlow', () => {
    expect(getSendStrategy('some:unknown:channel')).toBe('dropIfSlow')
  })
})

// ============================================
// 2. checkSlowConsumer Detection
// ============================================

describe('getUpgradeToken', () => {
  it('2.0.1: should read token from Authorization Bearer header', () => {
    const req = {
      headers: { authorization: 'Bearer test-token', host: 'localhost:3000' },
      url: '/ws'
    } as any

    expect(getUpgradeToken(req)).toBe('test-token')
  })

  it('2.0.2: should read token from raw Authorization header', () => {
    const req = {
      headers: { authorization: 'raw-token', host: 'localhost:3000' },
      url: '/ws'
    } as any

    expect(getUpgradeToken(req)).toBe('raw-token')
  })

  it('2.0.3: should fallback to token query param', () => {
    const req = {
      headers: { host: 'localhost:3000' },
      url: '/ws?token=query-token'
    } as any

    expect(getUpgradeToken(req)).toBe('query-token')
  })

  it('2.0.4: should return null when no token provided', () => {
    const req = {
      headers: { host: 'localhost:3000' },
      url: '/ws'
    } as any

    expect(getUpgradeToken(req)).toBeNull()
  })
})

describe('checkSlowConsumer', () => {
  it('2.1: bufferedAmount=0 returns ok', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 0
    expect(checkSlowConsumer(client)).toBe('ok')
  })

  it('2.2: bufferedAmount=500KB returns ok', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 500 * 1024
    expect(checkSlowConsumer(client)).toBe('ok')
  })

  it('2.3: bufferedAmount=1MB+1 returns slow', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 1024 * 1024 + 1
    expect(checkSlowConsumer(client)).toBe('slow')
  })

  it('2.4: bufferedAmount=2MB returns slow', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 2 * 1024 * 1024
    expect(checkSlowConsumer(client)).toBe('slow')
  })

  it('2.5: bufferedAmount=4MB+1 returns critical', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 4 * 1024 * 1024 + 1
    expect(checkSlowConsumer(client)).toBe('critical')
  })
})

// ============================================
// 3. sendToClientEnhanced Strategy Execution
// ============================================

describe('sendToClientEnhanced', () => {
  it('3.1: normal client + reliable sends successfully with seq increment', () => {
    const client = createMockClient()
    const message = { type: 'event', data: 'test' }

    const result = sendToClientEnhanced(client, message, 'reliable')

    expect(result).toBe(true)
    expect(client.ws.send).toHaveBeenCalledTimes(1)
    const sent = JSON.parse((client.ws.send as any).mock.calls[0][0])
    expect(sent.seq).toBe(1)
  })

  it('3.2: closed connection returns false, no send', () => {
    const client = createMockClient()
    ;(client.ws as any).readyState = 3 // WebSocket.CLOSED

    const result = sendToClientEnhanced(client, { data: 'test' }, 'reliable')

    expect(result).toBe(false)
    expect(client.ws.send).not.toHaveBeenCalled()
  })

  it('3.3: critical + reliable disconnects client', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 5 * 1024 * 1024

    const result = sendToClientEnhanced(client, { data: 'test' }, 'reliable')

    expect(result).toBe(false)
    expect(client.ws.close).toHaveBeenCalledWith(4001, 'Slow consumer')
  })

  it('3.4: critical + dropIfSlow skips without disconnect', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 5 * 1024 * 1024

    const result = sendToClientEnhanced(client, { data: 'test' }, 'dropIfSlow')

    expect(result).toBe(false)
    expect(client.ws.close).not.toHaveBeenCalled()
    expect(client.ws.send).not.toHaveBeenCalled()
  })

  it('3.5: slow + dropIfSlow skips message and marks as slow consumer', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 2 * 1024 * 1024

    const result = sendToClientEnhanced(client, { data: 'test' }, 'dropIfSlow')

    expect(result).toBe(false)
    expect(client.ws.send).not.toHaveBeenCalled()
    expect(client.isSlowConsumer).toBe(true)
  })

  it('3.6: slow + reliable still sends', () => {
    const client = createMockClient()
    ;(client.ws as any).bufferedAmount = 2 * 1024 * 1024

    const result = sendToClientEnhanced(client, { data: 'test' }, 'reliable')

    expect(result).toBe(true)
    expect(client.ws.send).toHaveBeenCalled()
  })

  it('3.7: slow consumer recovers when buffer clears', () => {
    const client = createMockClient()
    client.isSlowConsumer = true
    ;(client.ws as any).bufferedAmount = 0

    const result = sendToClientEnhanced(client, { data: 'test' }, 'dropIfSlow')

    expect(result).toBe(true)
    expect(client.isSlowConsumer).toBe(false)
    expect(client.ws.send).toHaveBeenCalled()
  })

  it('3.8: seq increments consecutively', () => {
    const client = createMockClient()

    sendToClientEnhanced(client, { data: '1' }, 'reliable')
    sendToClientEnhanced(client, { data: '2' }, 'reliable')
    sendToClientEnhanced(client, { data: '3' }, 'reliable')

    const calls = (client.ws.send as any).mock.calls
    expect(JSON.parse(calls[0][0]).seq).toBe(1)
    expect(JSON.parse(calls[1][0]).seq).toBe(2)
    expect(JSON.parse(calls[2][0]).seq).toBe(3)
  })
})

// ============================================
// 4. sendThrottled Delta Throttling
// ============================================

describe('sendThrottled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('4.1: first call sends immediately', () => {
    const client = createMockClient()

    sendThrottled(client, 'conv-1', 'agent:message', { text: 'hello' })

    expect(client.ws.send).toHaveBeenCalledTimes(1)
  })

  it('4.2: second call within 150ms is buffered', () => {
    const client = createMockClient()

    sendThrottled(client, 'conv-1', 'agent:message', { text: 'hello' })
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'world' })

    // Only first call should have been sent
    expect(client.ws.send).toHaveBeenCalledTimes(1)
  })

  it('4.3: buffered message flushes after throttle interval', () => {
    const client = createMockClient()

    sendThrottled(client, 'conv-1', 'agent:message', { text: 'hello' })
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'world' })

    // Advance past throttle interval
    vi.advanceTimersByTime(150)

    expect(client.ws.send).toHaveBeenCalledTimes(2)
    // Second message should contain latest data
    const secondMsg = JSON.parse((client.ws.send as any).mock.calls[1][0])
    expect(secondMsg.data.text).toBe('world')
  })

  it('4.4: multiple updates during throttle only keeps latest', () => {
    const client = createMockClient()

    sendThrottled(client, 'conv-1', 'agent:message', { text: 'data-1' })
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'data-2' })
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'data-3' })

    vi.advanceTimersByTime(150)

    // First immediate send + one throttled flush
    expect(client.ws.send).toHaveBeenCalledTimes(2)
    const lastMsg = JSON.parse((client.ws.send as any).mock.calls[1][0])
    expect(lastMsg.data.text).toBe('data-3')
  })

  it('4.5: different conversationIds throttle independently', () => {
    const client = createMockClient()

    sendThrottled(client, 'conv-1', 'agent:message', { text: 'msg-1' })
    sendThrottled(client, 'conv-2', 'agent:message', { text: 'msg-2' })

    // Both should send immediately (different conversations)
    expect(client.ws.send).toHaveBeenCalledTimes(2)
  })
})

// ============================================
// 6. Message Sequence Number Integrity
// ============================================

describe('message sequence numbers', () => {
  it('6.1: each client has independent seq counter', () => {
    const clientA = createMockClient({ id: 'client-a' })
    const clientB = createMockClient({ id: 'client-b' })

    sendToClientEnhanced(clientA, { data: 'a' }, 'reliable')
    sendToClientEnhanced(clientB, { data: 'b' }, 'reliable')

    const seqA = JSON.parse((clientA.ws.send as any).mock.calls[0][0]).seq
    const seqB = JSON.parse((clientB.ws.send as any).mock.calls[0][0]).seq
    expect(seqA).toBe(1)
    expect(seqB).toBe(1)
  })

  it('6.2: seq increments correctly through throttled messages', () => {
    vi.useFakeTimers()
    const client = createMockClient()

    // Send via throttled path
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'msg-1' })
    vi.advanceTimersByTime(150)
    sendThrottled(client, 'conv-1', 'agent:message', { text: 'msg-2' })

    const calls = (client.ws.send as any).mock.calls
    const seq1 = JSON.parse(calls[0][0]).seq
    const seq2 = JSON.parse(calls[1][0]).seq
    expect(seq2).toBe(seq1 + 1)

    vi.useRealTimers()
  })
})
