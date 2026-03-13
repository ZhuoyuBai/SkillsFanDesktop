/**
 * Gateway Remote Access Service
 *
 * Phase 2 migration note:
 * This is the first gateway-owned facade for remote access. The implementation
 * still depends on existing main-process helpers, but callers can now depend on
 * src/gateway/server/* instead of src/main/services/*.
 */

import { BrowserWindow } from 'electron'
import { networkInterfaces } from 'os'
import {
  startHttpServer,
  stopHttpServer,
  isServerRunning,
  getServerInfo
} from './http'
import {
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  onTunnelStatusChange
} from '../../main/services/tunnel.service'
import { getConfig, saveConfig } from '../../main/services/config.service'
import { setCustomAccessToken, generateAccessToken } from '../../main/http/auth'

export interface RemoteAccessStatus {
  enabled: boolean
  server: {
    running: boolean
    port: number
    token: string | null
    localUrl: string | null
    lanUrl: string | null
  }
  tunnel: {
    status: 'stopped' | 'starting' | 'running' | 'error'
    url: string | null
    error: string | null
  }
  clients: number
}

type StatusCallback = (status: RemoteAccessStatus) => void

let statusCallback: StatusCallback | null = null

function getLocalIp(): string | null {
  const interfaces = networkInterfaces()

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (!iface) continue

    for (const info of iface) {
      if (info.internal || info.family !== 'IPv4') continue
      return info.address
    }
  }

  return null
}

export async function enableRemoteAccess(
  mainWindow: BrowserWindow | null,
  port?: number
): Promise<RemoteAccessStatus> {
  if (isServerRunning()) {
    return getRemoteAccessStatus()
  }

  const { port: actualPort } = await startHttpServer(mainWindow, port)
  const config = getConfig()
  saveConfig({
    ...config,
    remoteAccess: {
      ...config.remoteAccess,
      enabled: true,
      port: actualPort
    }
  })

  return getRemoteAccessStatus()
}

export async function disableRemoteAccess(): Promise<void> {
  await stopTunnel()
  stopHttpServer()

  const config = getConfig()
  saveConfig({
    ...config,
    remoteAccess: {
      ...config.remoteAccess,
      enabled: false
    }
  })
}

export async function enableTunnel(): Promise<string> {
  const serverInfo = getServerInfo()

  if (!serverInfo.running) {
    throw new Error('HTTP server is not running. Enable remote access first.')
  }

  return await startTunnel(serverInfo.port)
}

export async function disableTunnel(): Promise<void> {
  await stopTunnel()
}

export function getRemoteAccessStatus(): RemoteAccessStatus {
  const serverInfo = getServerInfo()
  const tunnelStatus = getTunnelStatus()
  const localIp = getLocalIp()

  return {
    enabled: serverInfo.running,
    server: {
      running: serverInfo.running,
      port: serverInfo.port,
      token: serverInfo.token,
      localUrl: serverInfo.running ? `http://localhost:${serverInfo.port}` : null,
      lanUrl: serverInfo.running && localIp ? `http://${localIp}:${serverInfo.port}` : null
    },
    tunnel: {
      status: tunnelStatus.status,
      url: tunnelStatus.url,
      error: tunnelStatus.error
    },
    clients: serverInfo.clients
  }
}

export function onRemoteAccessStatusChange(callback: StatusCallback): void {
  statusCallback = callback

  onTunnelStatusChange(() => {
    if (statusCallback) {
      statusCallback(getRemoteAccessStatus())
    }
  })
}

export async function generateQRCode(includeToken: boolean = false): Promise<string | null> {
  const status = getRemoteAccessStatus()

  if (!status.enabled) {
    return null
  }

  let url = status.tunnel.url || status.server.lanUrl
  if (!url) {
    return null
  }

  if (includeToken && status.server.token) {
    url = `${url}?token=${status.server.token}`
  }

  try {
    const QRCode = await import('qrcode')
    return await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
  } catch (error) {
    console.error('[Remote] Failed to generate QR code:', error)
    return null
  }
}

export function setCustomPassword(password: string): { success: boolean; error?: string } {
  if (!isServerRunning()) {
    return { success: false, error: 'Remote access is not enabled' }
  }

  const result = setCustomAccessToken(password)
  if (!result) {
    return { success: false, error: 'Password must be 4-32 alphanumeric characters' }
  }

  console.log('[Remote] Custom password set successfully')
  if (statusCallback) {
    statusCallback(getRemoteAccessStatus())
  }

  return { success: true }
}

export function regeneratePassword(): void {
  if (!isServerRunning()) {
    console.log('[Remote] Cannot regenerate password: remote access not enabled')
    return
  }

  generateAccessToken()
  console.log('[Remote] Password regenerated')

  if (statusCallback) {
    statusCallback(getRemoteAccessStatus())
  }
}

