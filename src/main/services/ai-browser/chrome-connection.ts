/**
 * Chrome Connection - Launch real Chrome and connect via CDP WebSocket
 *
 * Enables AI Browser to control the user's real Chrome browser instead of
 * an embedded Electron BrowserView, avoiding automation detection.
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import WebSocket from 'ws'

// ============================================
// CDP Client
// ============================================

export class CDPClient {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (reason: Error) => void
  }>()
  private eventHandlers = new Map<string, Set<(params: Record<string, unknown>) => void>>()
  private _closed = false

  constructor(ws: WebSocket) {
    this.ws = ws

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())

        // Response to a command
        if (msg.id !== undefined) {
          const pending = this.pending.get(msg.id)
          if (pending) {
            this.pending.delete(msg.id)
            if (msg.error) {
              pending.reject(new Error(`CDP error: ${msg.error.message}`))
            } else {
              pending.resolve(msg.result)
            }
          }
          return
        }

        // Event notification
        if (msg.method) {
          const handlers = this.eventHandlers.get(msg.method)
          if (handlers) {
            for (const handler of handlers) {
              handler(msg.params || {})
            }
          }
          // Also emit to wildcard handlers
          const allHandlers = this.eventHandlers.get('*')
          if (allHandlers) {
            for (const handler of allHandlers) {
              handler({ method: msg.method, params: msg.params || {} })
            }
          }
        }
      } catch (e) {
        console.error('[CDPClient] Failed to parse message:', e)
      }
    })

    ws.on('close', () => {
      this._closed = true
      // Reject all pending commands
      for (const [id, pending] of this.pending) {
        pending.reject(new Error('WebSocket closed'))
        this.pending.delete(id)
      }
    })

    ws.on('error', (err) => {
      console.error('[CDPClient] WebSocket error:', err.message)
    })
  }

  get closed(): boolean {
    return this._closed
  }

  async sendCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (this._closed) {
      throw new Error('CDP connection closed')
    }

    const id = this.nextId++
    const message = JSON.stringify({ id, method, params })

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })

      this.ws.send(message, (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP command timeout: ${method}`))
        }
      }, 30000)
    })
  }

  on(event: string, handler: (params: Record<string, unknown>) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: (params: Record<string, unknown>) => void): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  close(): void {
    if (!this._closed) {
      this._closed = true
      this.ws.close()
    }
  }
}

// ============================================
// Chrome Launcher
// ============================================

const DEFAULT_DEBUG_PORT = 9222

/**
 * Find Chrome executable on the system
 */
export function findChrome(): string | null {
  if (process.platform === 'darwin') {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    for (const p of paths) {
      if (existsSync(p)) return p
    }
  } else if (process.platform === 'win32') {
    const paths = [
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    for (const p of paths) {
      if (existsSync(p)) return p
    }
  } else {
    // Linux
    try {
      return execSync('which google-chrome || which chromium || which chromium-browser', {
        encoding: 'utf-8'
      }).trim()
    } catch {
      return null
    }
  }
  return null
}

/**
 * Check if Chrome is already running with remote debugging on the given port
 */
async function isDebugPortOpen(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Wait for Chrome's debug port to become available
 */
async function waitForDebugPort(port: number, timeout: number = 10000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await isDebugPortOpen(port)) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Chrome debug port ${port} not available after ${timeout}ms`)
}

// ============================================
// Chrome Connection Manager
// ============================================

export interface ChromePage {
  id: string           // target ID
  url: string
  title: string
  type: string
  webSocketDebuggerUrl: string
}

export class ChromeConnection {
  private port: number
  private chromeProcess: ChildProcess | null = null
  private pageSessions = new Map<string, CDPClient>()
  private _connected = false

  constructor(port: number = DEFAULT_DEBUG_PORT) {
    this.port = port
  }

  get connected(): boolean {
    return this._connected
  }

  /**
   * Launch Chrome with remote debugging enabled.
   * If Chrome is already running with debugging on this port, reuse it.
   */
  async launch(): Promise<void> {
    // Check if Chrome is already running with debugging
    if (await isDebugPortOpen(this.port)) {
      console.log(`[ChromeConnection] Chrome already running on port ${this.port}`)
      this._connected = true
      return
    }

    const chromePath = findChrome()
    if (!chromePath) {
      throw new Error('Chrome not found. Please install Google Chrome.')
    }

    const args = [
      `--remote-debugging-port=${this.port}`,
      '--remote-allow-origins=*',
      // Don't add --enable-automation (causes the banner)
      // Don't add --no-first-run or --no-default-browser-check
      // Let Chrome use the user's default profile for login state
    ]

    console.log(`[ChromeConnection] Launching Chrome: ${chromePath}`)
    this.chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    })

    // Don't let Chrome process prevent app from exiting
    this.chromeProcess.unref()

    this.chromeProcess.on('error', (err) => {
      console.error('[ChromeConnection] Chrome launch error:', err)
    })

    this.chromeProcess.on('exit', (code) => {
      console.log(`[ChromeConnection] Chrome exited with code ${code}`)
      this.chromeProcess = null
    })

    // Wait for debug port
    await waitForDebugPort(this.port)
    this._connected = true
    console.log('[ChromeConnection] Chrome connected')
  }

  /**
   * List all open pages
   */
  async listPages(): Promise<ChromePage[]> {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`)
    const targets = await response.json() as ChromePage[]
    return targets.filter(t => t.type === 'page')
  }

  /**
   * Create a new page (tab) and optionally navigate to a URL
   */
  async createPage(url?: string): Promise<ChromePage> {
    const targetUrl = url || 'about:blank'
    const response = await fetch(
      `http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(targetUrl)}`
    )
    return await response.json() as ChromePage
  }

  /**
   * Close a page by target ID
   */
  async closePage(targetId: string): Promise<void> {
    // Disconnect CDP session first
    const session = this.pageSessions.get(targetId)
    if (session) {
      session.close()
      this.pageSessions.delete(targetId)
    }

    await fetch(`http://127.0.0.1:${this.port}/json/close/${targetId}`)
  }

  /**
   * Get or create a CDP session for a specific page
   */
  async getPageSession(targetId: string): Promise<CDPClient> {
    // Return existing session if still open
    const existing = this.pageSessions.get(targetId)
    if (existing && !existing.closed) {
      return existing
    }

    // Get page info for WebSocket URL
    const pages = await this.listPages()
    const page = pages.find(p => p.id === targetId)
    if (!page) {
      throw new Error(`Page not found: ${targetId}`)
    }

    if (!page.webSocketDebuggerUrl) {
      throw new Error(`No WebSocket URL for page: ${targetId}`)
    }

    // Connect via WebSocket
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
    })

    const client = new CDPClient(ws)
    this.pageSessions.set(targetId, client)
    return client
  }

  /**
   * Activate (bring to front) a page by target ID
   */
  async activatePage(targetId: string): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/json/activate/${targetId}`)
  }

  /**
   * Disconnect all CDP sessions (does NOT close Chrome)
   */
  close(): void {
    for (const [id, session] of this.pageSessions) {
      session.close()
      this.pageSessions.delete(id)
    }
    this._connected = false
    console.log('[ChromeConnection] Disconnected from Chrome')
  }
}

// Singleton
export const chromeConnection = new ChromeConnection()
