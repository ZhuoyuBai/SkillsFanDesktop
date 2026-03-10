import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  send = vi.fn((payload: string) => {
    this.sent.push(payload)
  })

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
}

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    }
  }
}

describe('renderer transport websocket subscriptions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    MockWebSocket.instances = []

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { origin: 'http://example.test' }
      },
      configurable: true,
      writable: true
    })

    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true
    })

    Object.defineProperty(globalThis, 'WebSocket', {
      value: MockWebSocket,
      configurable: true,
      writable: true
    })

    globalThis.localStorage.setItem('skillsfan_remote_token', 'test-token')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('replays pending conversation subscriptions once the socket opens', async () => {
    const transport = await import('../../../../src/renderer/api/transport')

    transport.subscribeToConversation('conv-1')
    transport.subscribeToConversation('conv-1')
    transport.connectWebSocket()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].send).not.toHaveBeenCalled()

    MockWebSocket.instances[0].open()

    expect(MockWebSocket.instances[0].send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({
      type: 'subscribe',
      payload: { conversationId: 'conv-1' }
    })
  })

  it('replays subscriptions after an automatic reconnect', async () => {
    const transport = await import('../../../../src/renderer/api/transport')

    transport.subscribeToConversation('conv-1')
    transport.connectWebSocket()
    MockWebSocket.instances[0].open()

    expect(MockWebSocket.instances[0].send).toHaveBeenCalledTimes(1)

    MockWebSocket.instances[0].onclose?.()
    await vi.advanceTimersByTimeAsync(3000)

    expect(MockWebSocket.instances).toHaveLength(2)

    MockWebSocket.instances[1].open()

    expect(MockWebSocket.instances[1].send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(MockWebSocket.instances[1].sent[0])).toEqual({
      type: 'subscribe',
      payload: { conversationId: 'conv-1' }
    })
  })

  it('removes queued subscriptions before the socket opens', async () => {
    const transport = await import('../../../../src/renderer/api/transport')

    transport.subscribeToConversation('conv-1')
    transport.unsubscribeFromConversation('conv-1')
    transport.connectWebSocket()
    MockWebSocket.instances[0].open()

    expect(MockWebSocket.instances[0].send).not.toHaveBeenCalled()
  })
})
