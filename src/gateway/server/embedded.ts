import type { BrowserWindow } from 'electron'
import { getConfig } from '../../main/services/config.service'
import { disableRemoteAccess, getRemoteAccessStatus } from './remote'

export interface EmbeddedGatewayStatus {
  state: 'stopped' | 'running' | 'external'
  mode: 'embedded' | 'external'
  featureEnabled: boolean
  startedAt: string | null
  remoteAccess: {
    enabled: boolean
    running: boolean
    clients: number
    tunnelStatus: 'stopped' | 'starting' | 'running' | 'error'
  }
}

interface EmbeddedGatewayLifecycleState {
  mainWindow: BrowserWindow | null
  state: EmbeddedGatewayStatus['state']
  mode: EmbeddedGatewayStatus['mode']
  featureEnabled: boolean
  startedAt: string | null
}

let lifecycle: EmbeddedGatewayLifecycleState = {
  mainWindow: null,
  state: 'stopped',
  mode: 'embedded',
  featureEnabled: false,
  startedAt: null
}

function resolveGatewayConfig(): Pick<EmbeddedGatewayStatus, 'mode' | 'featureEnabled'> {
  const gatewayConfig = getConfig().gateway

  return {
    mode: gatewayConfig?.mode || 'embedded',
    featureEnabled: gatewayConfig?.enabled ?? false
  }
}

export async function startEmbeddedGateway(mainWindow: BrowserWindow | null): Promise<EmbeddedGatewayStatus> {
  const gatewayConfig = resolveGatewayConfig()

  lifecycle.mode = gatewayConfig.mode
  lifecycle.featureEnabled = gatewayConfig.featureEnabled

  if (gatewayConfig.mode === 'external') {
    lifecycle.mainWindow = null
    lifecycle.state = 'external'
    lifecycle.startedAt = null
    console.log('[Gateway] External gateway mode configured. Embedded gateway not started.')
    return getEmbeddedGatewayStatus()
  }

  lifecycle.mainWindow = mainWindow
  lifecycle.state = 'running'
  lifecycle.startedAt = lifecycle.startedAt || new Date().toISOString()

  console.log(
    `[Gateway] Embedded gateway started (${gatewayConfig.featureEnabled ? 'feature-enabled' : 'compat-bridge'}).`
  )

  return getEmbeddedGatewayStatus()
}

export async function stopEmbeddedGateway(): Promise<void> {
  if (lifecycle.state === 'running') {
    await disableRemoteAccess()
  }

  lifecycle = {
    mainWindow: null,
    state: 'stopped',
    mode: lifecycle.mode,
    featureEnabled: lifecycle.featureEnabled,
    startedAt: null
  }

  console.log('[Gateway] Embedded gateway stopped.')
}

export function getEmbeddedGatewayStatus(): EmbeddedGatewayStatus {
  const gatewayConfig = resolveGatewayConfig()
  lifecycle.mode = gatewayConfig.mode
  lifecycle.featureEnabled = gatewayConfig.featureEnabled

  const remoteAccess = getRemoteAccessStatus()

  return {
    state: lifecycle.state,
    mode: lifecycle.mode,
    featureEnabled: lifecycle.featureEnabled,
    startedAt: lifecycle.startedAt,
    remoteAccess: {
      enabled: remoteAccess.enabled,
      running: remoteAccess.server.running,
      clients: remoteAccess.clients,
      tunnelStatus: remoteAccess.tunnel.status
    }
  }
}

export function getEmbeddedGatewayMainWindow(): BrowserWindow | null {
  return lifecycle.mainWindow
}

export function resetEmbeddedGatewayForTests(): void {
  lifecycle = {
    mainWindow: null,
    state: 'stopped',
    mode: 'embedded',
    featureEnabled: false,
    startedAt: null
  }
}
