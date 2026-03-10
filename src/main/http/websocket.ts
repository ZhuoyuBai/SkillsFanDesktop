/**
 * WebSocket Manager - Handles real-time communication with remote clients
 *
 * Enhanced with:
 * - Delta throttling (150ms) for streaming text events
 * - Slow consumer protection via bufferedAmount monitoring
 * - Event classification (reliable / dropIfSlow / throttled)
 * - Per-client message sequence numbers for loss detection
 *
 * Inspired by OpenClaw's gateway broadcast patterns.
 */

import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'
import { v4 as uuidv4 } from 'uuid'
import { validateToken } from './auth'

// ============================================
// Event Strategy
// ============================================

/**
 * Event send strategy:
 * - reliable:   Must be delivered. Disconnect slow consumers rather than drop.
 * - dropIfSlow: Can be skipped for slow consumers.
 * - throttled:  Merge and throttle before sending.
 */
/** @internal - exported for testing */
export type SendStrategy = 'reliable' | 'dropIfSlow' | 'throttled'

const THROTTLE_INTERVAL_MS = 150
const SLOW_CONSUMER_THRESHOLD = 1024 * 1024       // 1MB: skip non-critical messages
const SLOW_CONSUMER_DISCONNECT = 4 * 1024 * 1024  // 4MB: disconnect

/** @internal - exported for testing */
export function getSendStrategy(channel: string): SendStrategy {
  switch (channel) {
    case 'agent:message':   return 'throttled'    // Streaming text delta
    case 'agent:thought':   return 'dropIfSlow'   // Thought process
    case 'agent:complete':                        // Completion
    case 'agent:error':                           // Error
    case 'agent:tool-call':                       // Tool call
    case 'agent:tool-result':                     // Tool result
    case 'agent:tool-approval-resolved':          // Tool approval decision
    case 'agent:compact':                         // Context compression
    case 'agent:queued':                          // Queue notification
    case 'agent:subagent-update':                 // Hosted subagent lifecycle
    case 'agent:start':     return 'reliable'     // Must deliver
    default:                return 'dropIfSlow'
  }
}

// ============================================
// Enhanced Client Interface
// ============================================

interface ThrottleState {
  pending: Record<string, unknown> | null
  timer: NodeJS.Timeout | null
  lastSentAt: number
}

/** @internal - exported for testing */
export interface WebSocketClient {
  id: string
  ws: WebSocket
  authenticated: boolean
  subscriptions: Set<string>
  seq: number                                  // Per-client message sequence number
  throttleState: Map<string, ThrottleState>    // Per-conversation throttle state
  isSlowConsumer: boolean
}

// Store all connected clients
const clients = new Map<string, WebSocketClient>()

// WebSocket server instance
let wss: WebSocketServer | null = null

interface WsUpgradeRequest extends IncomingMessage {
  wsAuthenticated?: boolean
}

// ============================================
// Slow Consumer Detection
// ============================================

/** @internal - exported for testing */
export function checkSlowConsumer(client: WebSocketClient): 'ok' | 'slow' | 'critical' {
  const buffered = client.ws.bufferedAmount
  if (buffered > SLOW_CONSUMER_DISCONNECT) return 'critical'
  if (buffered > SLOW_CONSUMER_THRESHOLD) return 'slow'
  return 'ok'
}

// ============================================
// Enhanced Send
// ============================================

/**
 * Send message to client with strategy-based handling.
 * Returns true if the message was actually sent.
 */
/** @internal - exported for testing */
export function sendToClientEnhanced(
  client: WebSocketClient,
  message: object,
  strategy: SendStrategy
): boolean {
  if (client.ws.readyState !== WebSocket.OPEN) return false

  const status = checkSlowConsumer(client)

  if (status === 'critical') {
    if (strategy === 'reliable') {
      console.warn(`[WS] Disconnecting slow consumer ${client.id} (buffered: ${client.ws.bufferedAmount})`)
      cleanupClientThrottles(client)
      client.ws.close(4001, 'Slow consumer')
      clients.delete(client.id)
    }
    return false
  }

  if (status === 'slow' && strategy === 'dropIfSlow') {
    if (!client.isSlowConsumer) {
      client.isSlowConsumer = true
      console.log(`[WS] Client ${client.id} marked as slow consumer`)
    }
    return false
  }

  // Recover from slow state
  if (status === 'ok' && client.isSlowConsumer) {
    client.isSlowConsumer = false
  }

  // Attach sequence number
  client.seq++
  const envelope = { ...message, seq: client.seq }

  try {
    client.ws.send(JSON.stringify(envelope))
    return true
  } catch (error) {
    console.error(`[WS] Send error to ${client.id}:`, error)
    return false
  }
}

/**
 * Legacy sendToClient for internal protocol messages (auth, pong)
 * that don't need strategy handling.
 */
function sendToClient(client: WebSocketClient, message: object): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message))
  }
}

// ============================================
// Delta Throttling
// ============================================

/** @internal - exported for testing */
export function sendThrottled(
  client: WebSocketClient,
  conversationId: string,
  channel: string,
  data: Record<string, unknown>
): void {
  let state = client.throttleState.get(conversationId)
  if (!state) {
    state = { pending: null, timer: null, lastSentAt: 0 }
    client.throttleState.set(conversationId, state)
  }

  state.pending = data // Keep only the latest (overwrites previous)

  const now = Date.now()
  if (now - state.lastSentAt >= THROTTLE_INTERVAL_MS) {
    flushThrottled(client, conversationId, channel)
    return
  }

  if (!state.timer) {
    const remaining = THROTTLE_INTERVAL_MS - (now - state.lastSentAt)
    state.timer = setTimeout(() => {
      flushThrottled(client, conversationId, channel)
    }, remaining)
  }
}

/** @internal - exported for testing */
export function flushThrottled(
  client: WebSocketClient,
  conversationId: string,
  channel: string
): void {
  const state = client.throttleState.get(conversationId)
  if (!state?.pending) return

  const data = state.pending
  state.pending = null
  state.lastSentAt = Date.now()
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }

  sendToClientEnhanced(client, { type: 'event', channel, data }, 'throttled')
}

function cleanupClientThrottles(client: WebSocketClient): void {
  for (const [, state] of Array.from(client.throttleState.entries())) {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
  }
  client.throttleState.clear()
}

// ============================================
// Server Initialization
// ============================================

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: any): WebSocketServer {
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
    let pathname = ''
    try {
      const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      pathname = parsed.pathname
    } catch {
      return
    }

    if (pathname !== '/ws') {
      return
    }

    const token = getUpgradeToken(req)
    if (!token || !validateToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const wsReq = req as WsUpgradeRequest
    wsReq.wsAuthenticated = true

    wss?.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss?.emit('connection', ws, wsReq)
    })
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = uuidv4()
    const authenticated = (req as WsUpgradeRequest).wsAuthenticated === true
    const client: WebSocketClient = {
      id: clientId,
      ws,
      authenticated,
      subscriptions: new Set(),
      seq: 0,
      throttleState: new Map(),
      isSlowConsumer: false
    }

    clients.set(clientId, client)
    console.log(`[WS] Client connected: ${clientId}, authenticated=${authenticated}`)

    if (authenticated) {
      sendToClient(client, { type: 'auth:success' })
    }

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        handleClientMessage(client, message)
      } catch (error) {
        console.error('[WS] Invalid message:', error)
      }
    })

    // Handle disconnection
    ws.on('close', () => {
      cleanupClientThrottles(client)
      clients.delete(clientId)
      console.log(`[WS] Client disconnected: ${clientId}`)
    })

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WS] Client error ${clientId}:`, error)
      cleanupClientThrottles(client)
      clients.delete(clientId)
    })
  })

  console.log('[WS] WebSocket server initialized')
  return wss
}

// ============================================
// Client Message Handling
// ============================================

/**
 * Handle incoming message from client
 */
function handleClientMessage(
  client: WebSocketClient,
  message: { type: string; payload?: any }
): void {
  switch (message.type) {
    case 'auth':
      if (client.authenticated) {
        sendToClient(client, { type: 'auth:success' })
        break
      }

      // Validate the token before marking as authenticated
      if (message.payload?.token && validateToken(message.payload.token)) {
        client.authenticated = true
        sendToClient(client, { type: 'auth:success' })
        console.log(`[WS] Client ${client.id} authenticated successfully`)
      } else {
        sendToClient(client, { type: 'auth:failed', error: 'Invalid token' })
        console.log(`[WS] Client ${client.id} authentication failed`)
        // Close connection after failed auth
        setTimeout(() => client.ws.close(), 100)
      }
      break

    case 'subscribe':
      // Subscribe to conversation events (requires authentication)
      if (!client.authenticated) {
        sendToClient(client, { type: 'error', error: 'Not authenticated' })
        break
      }
      if (message.payload?.conversationId) {
        client.subscriptions.add(message.payload.conversationId)
        console.log(`[WS] Client ${client.id} subscribed to ${message.payload.conversationId}`)
      }
      break

    case 'unsubscribe':
      // Unsubscribe from conversation events
      if (message.payload?.conversationId) {
        client.subscriptions.delete(message.payload.conversationId)
        // Clean up throttle state for this conversation
        const state = client.throttleState.get(message.payload.conversationId)
        if (state?.timer) clearTimeout(state.timer)
        client.throttleState.delete(message.payload.conversationId)
      }
      break

    case 'ping':
      sendToClient(client, { type: 'pong' })
      break

    default:
      console.log(`[WS] Unknown message type: ${message.type}`)
  }
}

// ============================================
// Broadcast Functions
// ============================================

/**
 * Broadcast event to all subscribed clients
 * Enhanced with strategy-based sending and delta throttling.
 */
export function broadcastToWebSocket(
  channel: string,
  data: Record<string, unknown>
): void {
  const conversationId = data.conversationId
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    console.warn(`[WS] broadcastToWebSocket called without conversationId for channel: ${channel}`)
    return
  }

  const strategy = getSendStrategy(channel)

  for (const client of Array.from(clients.values())) {
    if (!client.authenticated || !client.subscriptions.has(conversationId)) continue

    if (strategy === 'throttled') {
      sendThrottled(client, conversationId, channel, data)
    } else {
      sendToClientEnhanced(client, { type: 'event', channel, data }, strategy)
    }
  }
}

/**
 * Broadcast to all authenticated clients (for global events)
 */
export function broadcastToAll(channel: string, data: Record<string, unknown>): void {
  for (const client of Array.from(clients.values())) {
    if (client.authenticated) {
      sendToClientEnhanced(client, { type: 'event', channel, data }, 'reliable')
    }
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return clients.size
}

/**
 * Get authenticated client count
 */
export function getAuthenticatedClientCount(): number {
  let count = 0
  for (const client of Array.from(clients.values())) {
    if (client.authenticated) count++
  }
  return count
}

/**
 * Shutdown WebSocket server
 */
export function shutdownWebSocket(): void {
  if (wss) {
    for (const client of Array.from(clients.values())) {
      cleanupClientThrottles(client)
      client.ws.close()
    }
    clients.clear()
    wss.close()
    wss = null
    console.log('[WS] WebSocket server shutdown')
  }
}

/**
 * Extract token from WebSocket upgrade request.
 * Supports Authorization header and `?token=` query for browser clients.
 */
export function getUpgradeToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string' && authHeader.length > 0) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return authHeader
  }

  try {
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const token = parsed.searchParams.get('token')
    return token && token.length > 0 ? token : null
  } catch {
    return null
  }
}
