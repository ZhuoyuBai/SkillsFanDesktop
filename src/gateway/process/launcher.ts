import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { getConfig } from '../../main/services/config.service'
import { getGatewayProcessStatus, hasFreshObservedExternalGatewayProcess } from './runtime'

export type GatewayLauncherState =
  | 'disabled'
  | 'idle'
  | 'launching'
  | 'connected'
  | 'reconnect-wait'
  | 'error'

export interface GatewayLauncherStatus {
  enabled: boolean
  state: GatewayLauncherState
  childPid: number | null
  launchedAt: string | null
  reconnectAttempts: number
  reconnectScheduled: boolean
  observedExternalProcess: boolean
  lastLaunchError: string | null
}

interface GatewayLauncherRuntimeState {
  child: ChildProcess | null
  childPid: number | null
  launchedAt: string | null
  reconnectAttempts: number
  reconnectTimer: NodeJS.Timeout | null
  lastLaunchError: string | null
  state: GatewayLauncherState
}

const RECONNECT_DELAY_MS = 2000

function isGatewayOnlyExternalProcess(): boolean {
  return (
    process.env.SKILLSFAN_GATEWAY_ONLY === '1'
    || process.env.SKILLSFAN_GATEWAY_ROLE === 'external'
    || process.argv.includes('--gateway-external')
  )
}

let launcherState: GatewayLauncherRuntimeState = {
  child: null,
  childPid: null,
  launchedAt: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  lastLaunchError: null,
  state: 'idle'
}

function isExternalGatewayEnabled(): boolean {
  return !isGatewayOnlyExternalProcess() && getConfig().gateway?.mode === 'external'
}

function clearReconnectTimer(): void {
  if (!launcherState.reconnectTimer) {
    return
  }

  clearTimeout(launcherState.reconnectTimer)
  launcherState.reconnectTimer = null
}

function hasObservedExternalProcess(): boolean {
  return hasFreshObservedExternalGatewayProcess(getGatewayProcessStatus())
}

function updateLauncherState(nextState: Partial<GatewayLauncherRuntimeState>): void {
  launcherState = {
    ...launcherState,
    ...nextState
  }
}

function resolveLaunchArgs(): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SKILLSFAN_GATEWAY_ROLE: 'external',
    SKILLSFAN_GATEWAY_ONLY: '1'
  }

  if (app.isPackaged) {
    return {
      command: process.execPath,
      args: ['--gateway-external'],
      env
    }
  }

  return {
    command: process.execPath,
    args: [app.getAppPath(), '--gateway-external'],
    env
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer()

  updateLauncherState({
    state: 'reconnect-wait'
  })

  launcherState.reconnectTimer = setTimeout(() => {
    launcherState.reconnectTimer = null
    ensureExternalGatewayLauncher()
  }, RECONNECT_DELAY_MS)
  launcherState.reconnectTimer.unref?.()
}

function attachChildLifecycle(child: ChildProcess): void {
  child.once('spawn', () => {
    updateLauncherState({
      state: hasObservedExternalProcess() ? 'connected' : 'launching',
      childPid: child.pid ?? null
    })
  })

  child.once('error', (error) => {
    updateLauncherState({
      child: null,
      childPid: null,
      state: 'error',
      lastLaunchError: error.message
    })
    if (isExternalGatewayEnabled()) {
      scheduleReconnect()
    }
  })

  child.once('exit', () => {
    updateLauncherState({
      child: null,
      childPid: null
    })

    if (isExternalGatewayEnabled()) {
      scheduleReconnect()
    } else {
      updateLauncherState({
        state: 'idle'
      })
    }
  })
}

export function ensureExternalGatewayLauncher(): GatewayLauncherStatus {
  if (!isExternalGatewayEnabled()) {
    clearReconnectTimer()
    updateLauncherState({
      child: null,
      childPid: null,
      state: 'disabled',
      lastLaunchError: null
    })
    return getGatewayLauncherStatus()
  }

  if (hasObservedExternalProcess()) {
    clearReconnectTimer()
    updateLauncherState({
      state: 'connected',
      lastLaunchError: null
    })
    return getGatewayLauncherStatus()
  }

  if (launcherState.child && !launcherState.child.killed) {
    updateLauncherState({
      state: 'launching'
    })
    return getGatewayLauncherStatus()
  }

  try {
    const { command, args, env } = resolveLaunchArgs()
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      env
    })
    child.unref()

    updateLauncherState({
      child,
      childPid: child.pid ?? null,
      launchedAt: new Date().toISOString(),
      reconnectAttempts: launcherState.reconnectAttempts + 1,
      state: 'launching',
      lastLaunchError: null
    })

    attachChildLifecycle(child)
  } catch (error) {
    updateLauncherState({
      child: null,
      childPid: null,
      state: 'error',
      lastLaunchError: error instanceof Error ? error.message : String(error)
    })
  }

  return getGatewayLauncherStatus()
}

export function recoverExternalGatewayLauncher(): GatewayLauncherStatus {
  clearReconnectTimer()

  if (!isExternalGatewayEnabled()) {
    updateLauncherState({
      child: null,
      childPid: null,
      state: 'disabled'
    })
    return getGatewayLauncherStatus()
  }

  if (hasObservedExternalProcess()) {
    updateLauncherState({
      state: 'connected',
      lastLaunchError: null
    })
    return getGatewayLauncherStatus()
  }

  if (launcherState.child && !launcherState.child.killed) {
    updateLauncherState({
      state: 'launching',
      lastLaunchError: null
    })
    return getGatewayLauncherStatus()
  }

  updateLauncherState({
    state: 'idle',
    child: null,
    childPid: null
  })

  return ensureExternalGatewayLauncher()
}

export function getGatewayLauncherStatus(): GatewayLauncherStatus {
  const observedExternalProcess = hasObservedExternalProcess()

  return {
    enabled: isExternalGatewayEnabled(),
    state: !isExternalGatewayEnabled()
      ? 'disabled'
      : observedExternalProcess
        ? 'connected'
        : launcherState.state,
    childPid: launcherState.childPid,
    launchedAt: launcherState.launchedAt,
    reconnectAttempts: launcherState.reconnectAttempts,
    reconnectScheduled: Boolean(launcherState.reconnectTimer),
    observedExternalProcess,
    lastLaunchError: launcherState.lastLaunchError
  }
}

export function shutdownExternalGatewayLauncher(): void {
  clearReconnectTimer()
  updateLauncherState({
    child: null,
    childPid: null,
    state: isExternalGatewayEnabled() ? 'idle' : 'disabled'
  })
}

export function resetGatewayLauncherForTests(): void {
  clearReconnectTimer()
  launcherState = {
    child: null,
    childPid: null,
    launchedAt: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    lastLaunchError: null,
    state: 'idle'
  }
}
