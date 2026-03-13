import type { BrowserWindow } from 'electron'
import {
  getMainWindow as getLegacyMainWindow,
  getServerInfo as getLegacyServerInfo,
  isServerRunning as isLegacyServerRunning,
  startHttpServer as startLegacyHttpServer,
  stopHttpServer as stopLegacyHttpServer
} from '../../main/http/server'

export interface GatewayServerInfo {
  running: boolean
  port: number
  token: string | null
  clients: number
}

export interface StartGatewayHttpServerResult {
  port: number
  token: string
}

// Phase 2 bridge: expose a gateway-owned server boundary before moving
// the underlying implementation out of src/main/http.
export async function startHttpServer(
  mainWindow: BrowserWindow | null,
  port?: number
): Promise<StartGatewayHttpServerResult> {
  return await startLegacyHttpServer(mainWindow, port)
}

export function stopHttpServer(): void {
  stopLegacyHttpServer()
}

export function isServerRunning(): boolean {
  return isLegacyServerRunning()
}

export function getServerInfo(): GatewayServerInfo {
  return getLegacyServerInfo()
}

export function getMainWindow(): BrowserWindow | null {
  return getLegacyMainWindow()
}

