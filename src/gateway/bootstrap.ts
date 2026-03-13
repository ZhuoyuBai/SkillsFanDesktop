import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import {
  initializeGatewayAutomation,
  shutdownGatewayAutomation
} from './automation'
import {
  configureGatewayChannelRelay,
  initializeGatewayCoreChannels,
  initializeGatewayChannelRelayRuntime,
  initializeGatewayOptionalChannels,
  shutdownGatewayChannelRelayRuntime,
  shutdownGatewayOptionalChannels
} from './channels'
import {
  configureGatewayCommandBus,
  initializeGatewayCommandRuntime,
  shutdownGatewayCommandRuntime
} from './commands'
import {
  configureGatewayDaemonStatus,
  initializeGatewayDaemonLockRuntime,
  shutdownGatewayDaemonLockRuntime
} from './daemon'
import { stepReporterRuntime } from './host-runtime/step-reporter/runtime'
import {
  ensureExternalGatewayLauncher,
  shutdownExternalGatewayLauncher,
  initializeGatewayProcessRuntime,
  shutdownGatewayProcessRuntime
} from './process'
import { startEmbeddedGateway, stopEmbeddedGateway } from './server/embedded'
import {
  configureGatewaySnapshotStore,
  initializeGatewaySnapshotSync,
  shutdownGatewaySnapshotSync
} from './server'
import {
  configureGatewaySessionStorePersistence,
  hydrateGatewaySessionStoreFromDisk
} from './sessions'

function throwGatewayBootstrapErrors(label: string, errors: unknown[]): void {
  if (errors.length === 0) {
    return
  }

  if (errors.length === 1) {
    throw errors[0]
  }

  throw new AggregateError(errors, `[Gateway] Failed to ${label}.`)
}

export async function initializeGatewayCore(
  mainWindow: BrowserWindow | null,
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  try {
    const { getHaloDir, getConfig } = await import('../main/services/config.service')
    const haloDir = getHaloDir()
    const gatewayMode = getConfig().gateway?.mode || 'embedded'
    const processRole = options?.processRole || 'desktop-app'
    const isExternalGatewayProcess = processRole === 'external-gateway'

    initializeGatewayProcessRuntime({
      filePath: join(haloDir, 'gateway', 'process.json'),
      mode: gatewayMode,
      manageCurrentProcess: isExternalGatewayProcess || gatewayMode === 'embedded',
      owner: isExternalGatewayProcess ? 'external-gateway' : 'electron-main'
    })

    configureGatewayChannelRelay(join(haloDir, 'gateway', 'channel-relay'))
    configureGatewayCommandBus(join(haloDir, 'gateway', 'commands'))
    configureGatewayDaemonStatus({
      desiredMode: 'manual',
      statusFilePath: join(haloDir, 'gateway', 'daemon.json'),
      lockFilePath: join(haloDir, 'gateway', 'daemon.lock')
    })
    configureGatewaySnapshotStore(join(haloDir, 'gateway', 'snapshots'))
    configureGatewaySessionStorePersistence(join(haloDir, 'gateway', 'session-store.json'))
    hydrateGatewaySessionStoreFromDisk()

    stepReporterRuntime.setPersistenceDir(join(haloDir, 'host-steps'))

    if (!isExternalGatewayProcess && gatewayMode === 'external') {
      ensureExternalGatewayLauncher()
    }
  } catch {
    // Non-critical: persistence and process metadata are best-effort during bootstrap
  }

  await startEmbeddedGateway(mainWindow)
  await initializeGatewayCoreChannels(mainWindow)
}

export async function initializeGatewayDeferred(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  const processRole = options?.processRole || 'desktop-app'

  if ((options?.processRole || 'desktop-app') === 'desktop-app') {
    try {
      const { getConfig } = await import('../main/services/config.service')
      if (getConfig().gateway?.mode === 'external') {
        initializeGatewayChannelRelayRuntime({ processRole })
        return
      }
    } catch {
      // Ignore config read errors and continue with embedded defaults.
    }
  }

  const errors: unknown[] = []

  try {
    initializeGatewayAutomation()
  } catch (error) {
    errors.push(error)
  }

  try {
    await initializeGatewayOptionalChannels()
  } catch (error) {
    errors.push(error)
  }

  if (processRole === 'external-gateway') {
    try {
      initializeGatewayDaemonLockRuntime({ processRole })
    } catch (error) {
      errors.push(error)
    }

    try {
      initializeGatewayCommandRuntime({ processRole })
    } catch (error) {
      errors.push(error)
    }

    try {
      initializeGatewaySnapshotSync({ processRole })
    } catch (error) {
      errors.push(error)
    }
  }

  throwGatewayBootstrapErrors('initialize deferred services', errors)
}

export async function shutdownGatewayDeferred(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  const processRole = options?.processRole || 'desktop-app'

  if ((options?.processRole || 'desktop-app') === 'desktop-app') {
    try {
      const { getConfig } = await import('../main/services/config.service')
      if (getConfig().gateway?.mode === 'external') {
        if (processRole === 'external-gateway') {
          shutdownGatewayCommandRuntime()
          shutdownGatewaySnapshotSync()
        }
        shutdownGatewayChannelRelayRuntime()
        shutdownExternalGatewayLauncher()
        return
      }
    } catch {
      // Ignore config read errors and continue with embedded defaults.
    }
  }

  const errors: unknown[] = []

  try {
    await shutdownGatewayOptionalChannels()
  } catch (error) {
    errors.push(error)
  }

  try {
    shutdownGatewayAutomation()
  } catch (error) {
    errors.push(error)
  }

  if (processRole === 'external-gateway') {
    try {
      shutdownGatewayDaemonLockRuntime()
    } catch (error) {
      errors.push(error)
    }

    try {
      shutdownGatewayCommandRuntime()
    } catch (error) {
      errors.push(error)
    }

    try {
      shutdownGatewaySnapshotSync()
    } catch (error) {
      errors.push(error)
    }
  }

  throwGatewayBootstrapErrors('shutdown deferred services', errors)
}

export async function shutdownGateway(): Promise<void> {
  await shutdownGatewayDeferred()
  await stopEmbeddedGateway()
  shutdownGatewayDaemonLockRuntime()
  shutdownGatewayChannelRelayRuntime()
  shutdownGatewayCommandRuntime()
  shutdownGatewaySnapshotSync()
  shutdownExternalGatewayLauncher()
  shutdownGatewayProcessRuntime()
}
