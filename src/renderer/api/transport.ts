/**
 * Transport Layer - Abstracts IPC vs HTTP communication
 * Automatically selects the appropriate transport based on environment
 */

import { createLogger } from '../lib/logger'

const transportLogger = createLogger('Transport')
const REMOTE_TOKEN_KEY = 'skillsfan_remote_token'
const LEGACY_REMOTE_TOKEN_KEY = 'halo_remote_token'
const REMOTE_AUTH_COOKIE_KEY = 'skillsfan_authenticated'
const LEGACY_REMOTE_AUTH_COOKIE_KEY = 'halo_authenticated'

// Detect if running in Electron (has window.skillsfan via preload)
export function isElectron(): boolean {
  return typeof window !== 'undefined' && 'skillsfan' in window
}

// Detect if running as remote web client
export function isRemoteClient(): boolean {
  return !isElectron()
}

// Get the remote server URL (for remote clients)
export function getRemoteServerUrl(): string {
  // In remote mode, use the current origin
  return window.location.origin
}

// Get stored auth token
export function getAuthToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem(REMOTE_TOKEN_KEY) || localStorage.getItem(LEGACY_REMOTE_TOKEN_KEY)
    if (token) {
      // Migrate legacy key to new key name.
      localStorage.setItem(REMOTE_TOKEN_KEY, token)
      localStorage.removeItem(LEGACY_REMOTE_TOKEN_KEY)
    }
    return token
  }
  return null
}

// Set auth token
export function setAuthToken(token: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(REMOTE_TOKEN_KEY, token)
    localStorage.removeItem(LEGACY_REMOTE_TOKEN_KEY)
  }
}

// Clear auth token
export function clearAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(REMOTE_TOKEN_KEY)
    localStorage.removeItem(LEGACY_REMOTE_TOKEN_KEY)
  }
}

/**
 * HTTP Transport - Makes API calls to remote server
 */
export async function httpRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getAuthToken()
  const url = `${getRemoteServerUrl()}${path}`

  transportLogger.debug(`[HTTP] ${method} ${path} - token: ${token ? 'present' : 'missing'}`)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })

    // Handle 401 - token expired or invalid, redirect to login
    if (response.status === 401) {
      transportLogger.warn(`[HTTP] ${method} ${path} - 401 Unauthorized, clearing token and redirecting to login`)
      clearAuthToken()
      // Clear the auth cookie
      document.cookie = `${REMOTE_AUTH_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      document.cookie = `${LEGACY_REMOTE_AUTH_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      // Reload page - server will show login page
      window.location.reload()
      return { success: false, error: 'Token expired, please login again' }
    }

    const data = await response.json()
    transportLogger.debug(`[HTTP] ${method} ${path} - status: ${response.status}, success: ${data.success}`)

    if (!response.ok) {
      transportLogger.warn(`[HTTP] ${method} ${path} - error:`, data.error)
    }

    return data
  } catch (error) {
    transportLogger.error(`[HTTP] ${method} ${path} - exception:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * WebSocket connection for real-time events (remote mode)
 */
let wsConnection: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
const wsEventListeners = new Map<string, Set<(data: unknown) => void>>()

export function connectWebSocket(): void {
  if (!isRemoteClient()) return
  if (wsConnection?.readyState === WebSocket.OPEN) return

  const token = getAuthToken()
  if (!token) {
    transportLogger.warn('[WS] No auth token, cannot connect')
    return
  }

  const wsUrl = `${getRemoteServerUrl().replace('http', 'ws')}/ws?token=${encodeURIComponent(token)}`
  transportLogger.debug('[WS] Connecting to remote WebSocket /ws')

  wsConnection = new WebSocket(wsUrl)

  wsConnection.onopen = () => {
    transportLogger.debug('[WS] Connected')
  }

  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)

      if (message.type === 'auth:success') {
        transportLogger.debug('[WS] Authenticated')
        return
      }

      if (message.type === 'event') {
        // Dispatch to registered listeners
        const listeners = wsEventListeners.get(message.channel)
        if (listeners) {
          for (const callback of listeners) {
            callback(message.data)
          }
        }
      }
    } catch (error) {
      transportLogger.error('[WS] Failed to parse message:', error)
    }
  }

  wsConnection.onclose = () => {
    transportLogger.debug('[WS] Disconnected')
    wsConnection = null

    // Attempt to reconnect after 3 seconds
    if (isRemoteClient() && getAuthToken()) {
      wsReconnectTimer = setTimeout(connectWebSocket, 3000)
    }
  }

  wsConnection.onerror = (error) => {
    transportLogger.error('[WS] Error:', error)
  }
}

export function disconnectWebSocket(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }

  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }
}

export function subscribeToConversation(conversationId: string): void {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(
      JSON.stringify({
        type: 'subscribe',
        payload: { conversationId }
      })
    )
  }
}

export function unsubscribeFromConversation(conversationId: string): void {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(
      JSON.stringify({
        type: 'unsubscribe',
        payload: { conversationId }
      })
    )
  }
}

/**
 * Register event listener (works for both IPC and WebSocket)
 */
export function onEvent(channel: string, callback: (data: unknown) => void): () => void {
  if (isElectron()) {
    // Use IPC in Electron
    const methodMap: Record<string, keyof typeof window.skillsfan> = {
      'agent:start': 'onAgentStart',
      'agent:message': 'onAgentMessage',
      'agent:tool-call': 'onAgentToolCall',
      'agent:tool-result': 'onAgentToolResult',
      'agent:error': 'onAgentError',
      'agent:complete': 'onAgentComplete',
      'agent:thought': 'onAgentThought',
      'agent:mcp-status': 'onAgentMcpStatus',
      'agent:compact': 'onAgentCompact',
      'agent:user-question': 'onAgentUserQuestion',
      'agent:user-question-answered': 'onAgentUserQuestionAnswered',
      'remote:status-change': 'onRemoteStatusChange',
      'browser:state-change': 'onBrowserStateChange',
      'browser:zoom-changed': 'onBrowserZoomChanged',
      'canvas:tab-action': 'onCanvasTabAction',
      'ai-browser:active-view-changed': 'onAIBrowserActiveViewChanged',
      'perf:snapshot': 'onPerfSnapshot',
      'perf:warning': 'onPerfWarning',
      'updater:status': 'onUpdaterStatus',
      'updater:download-progress': 'onDownloadProgress'
    }

    const method = methodMap[channel]
    if (method && typeof window.skillsfan[method] === 'function') {
      return (window.skillsfan[method] as (cb: (data: unknown) => void) => () => void)(callback)
    }

    return () => {}
  } else {
    // Use WebSocket in remote mode
    if (!wsEventListeners.has(channel)) {
      wsEventListeners.set(channel, new Set())
    }
    wsEventListeners.get(channel)!.add(callback)

    return () => {
      wsEventListeners.get(channel)?.delete(callback)
    }
  }
}
