import { getGatewayDoctorReport } from '../../gateway/doctor'
import {
  clearGatewayDaemonObservedLock,
  executeGatewayDaemonPreparedBundle,
  getGatewayDaemonStatus,
  getGatewayDaemonInstallPlan,
  prepareGatewayDaemonInstallBundle,
  registerGatewayDaemon,
  unregisterGatewayDaemon
} from '../../gateway/daemon'
import { getGatewaySessionStepJournal } from '../../gateway/host-runtime'
import { runDesktopSmokeFlow } from '../../gateway/host-runtime/desktop/smoke-flows'
import {
  clearGatewayObservedProcessRecord,
  getGatewayLauncherStatus,
  getGatewayProcessStatus,
  recoverExternalGatewayLauncher
} from '../../gateway/process'
import { getGatewayHealth, listGatewayServices } from '../../gateway/server/health'
import { ipcHandle } from './utils'

export function registerGatewayHandlers(): void {
  ipcHandle('gateway:health', async () => {
    return await getGatewayHealth()
  })

  ipcHandle('gateway:services', async () => {
    return await listGatewayServices()
  })

  ipcHandle('gateway:doctor', async () => {
    return await getGatewayDoctorReport()
  })

  ipcHandle('gateway:process-status', async () => {
    return getGatewayProcessStatus()
  })

  ipcHandle('gateway:launcher-status', async () => {
    return getGatewayLauncherStatus()
  })

  ipcHandle('gateway:launcher-recover', async () => {
    const processStatus = getGatewayProcessStatus()
    const daemonStatus = getGatewayDaemonStatus()

    if (
      processStatus.configuredMode === 'external'
      && !processStatus.managedByCurrentProcess
      && processStatus.state === 'awaiting-external'
      && processStatus.pid !== null
    ) {
      clearGatewayObservedProcessRecord()
    }

    if (
      daemonStatus.lockFileExists
      && (daemonStatus.lockState === 'stale' || daemonStatus.lockState === 'error')
    ) {
      clearGatewayDaemonObservedLock()
    }

    return recoverExternalGatewayLauncher()
  })

  ipcHandle('gateway:daemon-status', async () => {
    return getGatewayDaemonStatus()
  })

  ipcHandle('gateway:daemon-install-plan', async () => {
    return getGatewayDaemonInstallPlan()
  })

  ipcHandle('gateway:daemon-prepare-install', async () => {
    return prepareGatewayDaemonInstallBundle()
  })

  ipcHandle('gateway:daemon-run-install', async (_event, bundleDir?: string) => {
    return await executeGatewayDaemonPreparedBundle({
      action: 'install',
      bundleDir
    })
  })

  ipcHandle('gateway:daemon-run-uninstall', async (_event, bundleDir?: string) => {
    return await executeGatewayDaemonPreparedBundle({
      action: 'uninstall',
      bundleDir
    })
  })

  ipcHandle('gateway:daemon-clear-lock', async () => {
    return clearGatewayDaemonObservedLock()
  })

  ipcHandle('gateway:daemon-register', async () => {
    return registerGatewayDaemon()
  })

  ipcHandle('gateway:daemon-unregister', async () => {
    return unregisterGatewayDaemon()
  })

  ipcHandle('gateway:step-journal', async (_event, sessionKey: string) => {
    return getGatewaySessionStepJournal(sessionKey, {
      includeRelatedSessions: true
    })
  })

  ipcHandle('gateway:desktop-smoke-flow-run', async (_event, flowId?: string) => {
    if (!flowId || !flowId.trim()) {
      throw new Error('Please specify which test flow to run')
    }

    return await runDesktopSmokeFlow({
      flowId: flowId.trim(),
      workDir: process.cwd()
    })
  })
}
