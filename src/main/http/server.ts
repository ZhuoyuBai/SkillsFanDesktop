/**
 * HTTP Server - Remote access server for Halo
 * Exposes REST API and serves the frontend for remote access
 */

import express, { Express, Request, Response } from 'express'
import { createServer, Server, request as httpRequest, IncomingMessage } from 'http'
import { join } from 'path'
import { BrowserWindow, app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createConnection } from 'net'

import { existsSync, readFileSync } from 'fs'

import { authMiddleware, generateAccessToken, getAccessToken, clearAccessToken, validateToken } from './auth'
import { initWebSocket, shutdownWebSocket, getClientCount } from './websocket'
import { registerApiRoutes } from './routes'

// Cache logo as base64 data URL (read once from resources dir)
let _remoteLogoDataUrl = ''
function getRemoteLogoDataUrl(): string {
  if (_remoteLogoDataUrl) return _remoteLogoDataUrl
  try {
    const resourcesDir = is.dev
      ? join(app.getAppPath(), 'resources')
      : process.resourcesPath
    const logoPath = join(resourcesDir, 'logo-light.png')
    if (existsSync(logoPath)) {
      _remoteLogoDataUrl = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
    }
  } catch {}
  return _remoteLogoDataUrl
}

// Vite dev server URL
const VITE_DEV_SERVER = 'http://localhost:5173'
const VITE_DEV_HOST = 'localhost'
const VITE_DEV_PORT = 5173

// Server state
let httpServer: Server | null = null
let expressApp: Express | null = null
let serverPort: number = 0
let mainWindow: BrowserWindow | null = null

// Default port
const DEFAULT_PORT = 3847

/**
 * Start the HTTP server
 */
export async function startHttpServer(
  window: BrowserWindow | null,
  port: number = DEFAULT_PORT
): Promise<{ port: number; token: string }> {
  // Store reference to main window for agent calls
  mainWindow = window

  // Create Express app
  expressApp = express()

  // Middleware
  expressApp.use(express.json())
  expressApp.use(express.urlencoded({ extended: true }))

  // CORS for remote access
  expressApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    next()
  })

  // Login endpoint (before auth middleware)
  expressApp.post('/api/remote/login', (req: Request, res: Response) => {
    const { token } = req.body

    if (validateToken(token)) {
      res.json({ success: true })
    } else {
      res.status(401).json({ success: false, error: 'Invalid token' })
    }
  })

  // Status endpoint (public)
  expressApp.get('/api/remote/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        active: true,
        clients: getClientCount(),
        version: '1.0.0'
      }
    })
  })

  // Auth middleware for API routes
  expressApp.use('/api', authMiddleware)

  // Register API routes
  registerApiRoutes(expressApp, mainWindow)

  // Serve static files (frontend)
  if (is.dev) {
    // In development, proxy to Vite dev server
    expressApp.use('/{*path}', (req, res) => {
      const urlToken = req.query.token as string
      const authHeader = req.headers.authorization
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader

      if (req.path === '/') {
        // URL token: validate and bridge into SPA (sets localStorage + cookie, then redirects to /)
        if (urlToken && validateToken(urlToken)) {
          return res.send(getAutoLoginPage(urlToken))
        }

        // No cookie and no valid header token → show login page
        const cookies = req.headers.cookie || ''
        const hasToken = cookies.includes('halo_authenticated=true')
        if (!hasToken && !headerToken) {
          return res.send(getRemoteLoginPage())
        }
      }

      // Proxy to Vite dev server
      const viteUrl = new URL(req.originalUrl, VITE_DEV_SERVER)

      const proxyReq = httpRequest(viteUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(VITE_DEV_SERVER).host
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err) => {
        console.error('[HTTP] Proxy error:', err)
        res.status(502).send('Vite dev server not available')
      })

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq)
      } else {
        proxyReq.end()
      }
    })
  } else {
    // In production, serve built files
    const staticPath = join(__dirname, '../renderer')

    // Authentication check middleware for production
    expressApp.use((req, res, next) => {
      // Skip for API routes (handled by authMiddleware)
      if (req.path.startsWith('/api')) {
        return next()
      }

      // Skip for static assets
      if (
        req.path.startsWith('/assets') ||
        req.path.endsWith('.js') ||
        req.path.endsWith('.css') ||
        req.path.endsWith('.svg') ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.ico') ||
        req.path.endsWith('.woff') ||
        req.path.endsWith('.woff2')
      ) {
        return next()
      }

      // URL token: validate and bridge into SPA (sets localStorage + cookie, then redirects to /)
      const urlToken = req.query.token as string
      if (urlToken && validateToken(urlToken)) {
        return res.send(getAutoLoginPage(urlToken))
      }

      // Check if authenticated via cookie
      const cookies = req.headers.cookie || ''
      const hasToken = cookies.includes('halo_authenticated=true')

      // If not authenticated, show login page
      if (!hasToken) {
        return res.send(getRemoteLoginPage())
      }

      next()
    })

    expressApp.use(express.static(staticPath))

    // SPA fallback - Express 5.x requires named wildcard parameters
    expressApp.get('/{*path}', (req, res) => {
      // Auth already checked by middleware above
      res.sendFile(join(staticPath, 'index.html'))
    })
  }

  // Create HTTP server
  httpServer = createServer(expressApp)

  // Initialize WebSocket (for Halo communication on /ws path)
  initWebSocket(httpServer)

  // In dev mode, proxy Vite HMR WebSocket connections
  if (is.dev) {
    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)

      // Don't intercept Halo's WebSocket connections
      if (url.pathname === '/ws') {
        // Let the wss server handle it (already done by initWebSocket)
        return
      }

      // Proxy other WebSocket connections to Vite dev server
      console.log(`[HTTP] Proxying WebSocket upgrade: ${url.pathname}`)

      const viteSocket = createConnection(VITE_DEV_PORT, VITE_DEV_HOST, () => {
        // Forward the upgrade request to Vite
        const upgradeRequest = [
          `GET ${req.url} HTTP/1.1`,
          `Host: ${VITE_DEV_HOST}:${VITE_DEV_PORT}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
          `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`,
          '',
          ''
        ].join('\r\n')

        viteSocket.write(upgradeRequest)
        viteSocket.write(head)

        // Pipe data between client and Vite
        socket.pipe(viteSocket)
        viteSocket.pipe(socket)
      })

      viteSocket.on('error', (err) => {
        console.error('[HTTP] Vite WebSocket proxy error:', err.message)
        socket.end()
      })

      socket.on('error', (err) => {
        console.error('[HTTP] Client WebSocket error:', err.message)
        viteSocket.end()
      })
    })
  }

  // Generate access token
  const token = generateAccessToken()

  // Start listening
  return new Promise((resolve, reject) => {
    httpServer!.listen(port, '0.0.0.0', () => {
      serverPort = port
      console.log(`[HTTP] Server started on port ${port}`)
      console.log(`[HTTP] Access token: ${token}`)
      resolve({ port, token })
    })

    httpServer!.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        // Try next port
        console.log(`[HTTP] Port ${port} in use, trying ${port + 1}`)
        startHttpServer(window, port + 1)
          .then(resolve)
          .catch(reject)
      } else {
        reject(error)
      }
    })
  })
}

/**
 * Stop the HTTP server
 */
export function stopHttpServer(): void {
  if (httpServer) {
    shutdownWebSocket()
    httpServer.close()
    httpServer = null
    expressApp = null
    serverPort = 0
    clearAccessToken()
    console.log('[HTTP] Server stopped')
  }
}

/**
 * Check if server is running
 */
export function isServerRunning(): boolean {
  return httpServer !== null
}

/**
 * Get server info
 */
export function getServerInfo(): {
  running: boolean
  port: number
  token: string | null
  clients: number
} {
  return {
    running: isServerRunning(),
    port: serverPort,
    token: getAccessToken(),
    clients: getClientCount()
  }
}

/**
 * Get main window reference (for agent controller)
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Simple login page HTML for remote access
 */
function getRemoteLoginPage(): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>技能范 · 远程访问</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      min-height: 100vh;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1a1a1a;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    .card {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
      text-align: center;
      width: 100%;
      max-width: 380px;
      padding: 2.5rem 2rem;
      margin: 1rem;
    }
    .logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo svg {
      width: 80px;
      height: 80px;
      border-radius: 50%;
    }
    .brand-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.02em;
    }
    .brand-en {
      font-size: 0.8rem;
      color: #aaaaaa;
      letter-spacing: 0.05em;
      margin-top: 0.15rem;
      margin-bottom: 0.75rem;
    }
    .divider {
      width: 32px;
      height: 2px;
      background: #c95f12;
      margin: 0.75rem auto 1rem;
      border-radius: 2px;
    }
    .subtitle {
      color: #999999;
      font-size: 0.875rem;
      margin-bottom: 1.75rem;
      line-height: 1.5;
    }
    input {
      width: 100%;
      padding: 0.875rem 1.25rem;
      border: 1.5px solid #e0e0e0;
      border-radius: 12px;
      background: #f8f8f8;
      color: #1a1a1a;
      font-size: 1.375rem;
      text-align: center;
      letter-spacing: 0.5em;
      min-height: 56px;
      transition: border-color 0.2s, background 0.2s;
    }
    input::placeholder { color: #cccccc; letter-spacing: 0.5em; }
    input:focus { outline: none; border-color: #c95f12; background: #ffffff; }
    button {
      width: 100%;
      padding: 0.875rem 2rem;
      border: none;
      border-radius: 12px;
      background: #c95f12;
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
      min-height: 50px;
      margin-top: 0.875rem;
      letter-spacing: 0.05em;
    }
    button:hover { background: #b5500a; }
    button:active { transform: scale(0.98); background: #a04509; }
    .msg { margin-top: 1rem; font-size: 0.875rem; min-height: 1.25rem; }
    .msg.error { color: #dc2626; }
    .msg.success { color: #16a34a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="${getRemoteLogoDataUrl()}" alt="技能范" width="80" height="80" style="object-fit:contain;">
    </div>
    <div class="brand-name">技能范</div>
    <div class="brand-en">SkillsFan</div>
    <div class="divider"></div>
    <p class="subtitle">远程访问<br>输入访问码连接到桌面</p>
    <input type="text" id="token" maxlength="32" placeholder="000000" autocomplete="off" inputmode="numeric">
    <button onclick="login()">连接</button>
    <p id="msg" class="msg"></p>
  </div>
  <script>
    async function login() {
      const token = document.getElementById('token').value;
      const msg = document.getElementById('msg');

      if (!token || token.length < 4) {
        msg.className = 'msg error';
        msg.textContent = '请输入访问码';
        return;
      }

      try {
        const res = await fetch('/api/remote/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        if (res.ok) {
          localStorage.setItem('halo_remote_token', token);
          document.cookie = 'halo_authenticated=true; path=/';
          msg.className = 'msg success';
          msg.textContent = '连接成功，加载中…';
          setTimeout(() => location.reload(), 500);
        } else {
          msg.className = 'msg error';
          msg.textContent = '访问码无效，请重试';
        }
      } catch (e) {
        msg.className = 'msg error';
        msg.textContent = '连接失败，请重试';
      }
    }

    document.getElementById('token').focus();
    document.getElementById('token').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
    });
  </script>
</body>
</html>
  `
}

/**
 * Auto-login bridge page: writes token to localStorage + cookie, then redirects to /
 * Used when QR code URL contains ?token= parameter
 */
function getAutoLoginPage(token: string): string {
  const safeToken = JSON.stringify(token)
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>技能范 · 连接中…</title>
<style>
  body { margin: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
  .tip { color: #999; font-size: 0.9rem; }
</style>
</head>
<body>
<p class="tip">连接中…</p>
<script>
  try {
    localStorage.setItem('halo_remote_token', ${safeToken});
    document.cookie = 'halo_authenticated=true; path=/';
  } catch(e) {}
  location.replace('/');
</script>
</body></html>`
}
