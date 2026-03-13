import { getGatewayDaemonStatus } from '../daemon'
import { stepReporterRuntime } from '../host-runtime/step-reporter/runtime'
import { getGatewayProcessStatus } from '../process'
import {
  getGatewaySessionPersistenceStatus,
  type GatewaySessionStorePersistenceStatus
} from '../sessions/persistence'
import { getGatewayHealth, collectLocalGatewayHealth } from '../server/health'
import { loadGatewaySnapshot } from '../server/snapshots'

export type GatewayDoctorCheckState = 'ok' | 'warn' | 'fail'

const EXTERNAL_GATEWAY_DOCTOR_SNAPSHOT_MAX_AGE_MS = 15000

export interface GatewayDoctorCheck {
  key:
    | 'daemon'
    | 'gateway-launcher'
    | 'gateway-process'
    | 'command-runtime'
    | 'session-store'
    | 'step-journal'
    | 'runtime'
    | 'host-permissions'
  state: GatewayDoctorCheckState
  summary: string
  metadata?: Record<string, unknown>
}

export interface GatewayDoctorReport {
  generatedAt: string
  overallState: GatewayDoctorCheckState
  checks: GatewayDoctorCheck[]
}

function summarizeSessionStoreCheck(
  status: GatewaySessionStorePersistenceStatus
): GatewayDoctorCheck {
  if (!status.enabled) {
    return {
      key: 'session-store',
      state: 'warn',
      summary: 'Gateway session store persistence is not configured.'
    }
  }

  if (!status.hydrated) {
    return {
      key: 'session-store',
      state: 'warn',
      summary: 'Gateway session store persistence is configured but has not hydrated yet.',
      metadata: {
        filePath: status.filePath,
        fileExists: status.fileExists,
        backupExists: status.backupExists
      }
    }
  }

  if (status.lastLoadError || status.lastSaveError) {
    return {
      key: 'session-store',
      state: 'fail',
      summary: 'Gateway session store persistence reported load/save errors.',
      metadata: {
        filePath: status.filePath,
        fileExists: status.fileExists,
        backupExists: status.backupExists,
        lastLoadError: status.lastLoadError,
        lastSaveError: status.lastSaveError
      }
    }
  }

  return {
      key: 'session-store',
      state: 'ok',
      summary: `Gateway session store persistence is enabled (${status.sessionCount} sessions).`,
      metadata: {
        filePath: status.filePath,
        hydrated: status.hydrated,
        snapshotSavedAt: status.snapshotSavedAt,
        fileExists: status.fileExists,
        backupExists: status.backupExists,
        lastLoadedAt: status.lastLoadedAt,
        lastSavedAt: status.lastSavedAt
      }
  }
}

function resolveOverallState(checks: GatewayDoctorCheck[]): GatewayDoctorCheckState {
  if (checks.some((check) => check.state === 'fail')) {
    return 'fail'
  }

  if (checks.some((check) => check.state === 'warn')) {
    return 'warn'
  }

  return 'ok'
}

function buildGatewayLauncherCheck(health: Awaited<ReturnType<typeof collectLocalGatewayHealth>>): GatewayDoctorCheck {
  return health.gateway.mode === 'external'
    ? {
        key: 'gateway-launcher',
        state: health.launcher.state === 'error'
          ? 'fail'
          : health.launcher.state === 'connected'
            ? 'ok'
            : 'warn',
        summary: `Gateway launcher state is ${health.launcher.state}.`,
        metadata: health.launcher as unknown as Record<string, unknown>
      }
    : {
        key: 'gateway-launcher',
        state: 'ok',
        summary: 'Gateway launcher is not required in embedded mode.'
      }
}

function buildGatewayProcessCheck(): GatewayDoctorCheck {
  const processStatus = getGatewayProcessStatus()

  return processStatus.state === 'embedded-owner' || processStatus.state === 'external-observed'
    ? {
        key: 'gateway-process',
        state: 'ok',
        summary: `Gateway process status is ${processStatus.state}.`,
        metadata: {
          configuredMode: processStatus.configuredMode,
          pid: processStatus.pid,
          heartbeatAgeMs: processStatus.heartbeatAgeMs,
          filePath: processStatus.filePath
        }
      }
    : {
        key: 'gateway-process',
        state: processStatus.configuredMode === 'external' ? 'warn' : 'fail',
        summary: processStatus.configuredMode === 'external'
          ? 'Gateway is waiting for an external process to publish status.'
          : 'Current process does not own an active gateway runtime file.',
        metadata: {
          configuredMode: processStatus.configuredMode,
          lastError: processStatus.lastError,
          filePath: processStatus.filePath
        }
      }
}

function buildStepJournalCheck(): GatewayDoctorCheck {
  const stepJournalStatus = stepReporterRuntime.getPersistenceStatus()

  return stepJournalStatus.enabled
    ? {
        key: 'step-journal',
        state: stepJournalStatus.lastLoadError || stepJournalStatus.lastPersistError ? 'fail' : 'ok',
        summary: stepJournalStatus.lastLoadError || stepJournalStatus.lastPersistError
          ? 'Host step journal reported persistence errors.'
          : `Host step journal persistence is enabled (${stepJournalStatus.persistedStepCount} steps across ${stepJournalStatus.persistedTaskCount} tasks).`,
        metadata: stepJournalStatus
      }
    : {
        key: 'step-journal',
        state: 'warn',
        summary: 'Host step journal persistence is not configured.'
      }
}

function buildCommandRuntimeCheck(
  health: Awaited<ReturnType<typeof collectLocalGatewayHealth>>
): GatewayDoctorCheck {
  if (health.process.configuredMode !== 'external') {
    return {
      key: 'command-runtime',
      state: 'ok',
      summary: 'Gateway command runtime is not required in embedded mode.'
    }
  }

  if (health.commands.lastError) {
    return {
      key: 'command-runtime',
      state: 'fail',
      summary: 'Gateway command runtime reported a command execution error.',
      metadata: health.commands as unknown as Record<string, unknown>
    }
  }

  if (!health.commands.initialized) {
    return {
      key: 'command-runtime',
      state: 'warn',
      summary: 'Gateway command runtime is not initialized yet.',
      metadata: health.commands as unknown as Record<string, unknown>
    }
  }

  return {
    key: 'command-runtime',
    state: 'ok',
    summary: `Gateway command runtime is active (${health.commands.processedCount} processed, ${health.commands.pendingCount} pending).`,
    metadata: health.commands as unknown as Record<string, unknown>
  }
}

function buildDaemonCheck(): GatewayDoctorCheck {
  const daemonStatus = getGatewayDaemonStatus()

  if (daemonStatus.lastError) {
    return {
      key: 'daemon',
      state: 'fail',
      summary: 'Gateway daemon status reported an error.',
      metadata: daemonStatus as unknown as Record<string, unknown>
    }
  }

  if (daemonStatus.lockState === 'stale' || daemonStatus.lockState === 'error') {
    return {
      key: 'daemon',
      state: 'warn',
      summary: 'Gateway daemon lock is stale or unhealthy.',
      metadata: daemonStatus as unknown as Record<string, unknown>
    }
  }

  if (!daemonStatus.supported) {
    return {
      key: 'daemon',
      state: 'ok',
      summary: 'Gateway daemon integration is not available on this platform.',
      metadata: daemonStatus as unknown as Record<string, unknown>
    }
  }

  if (daemonStatus.registered) {
    return {
      key: 'daemon',
      state: 'ok',
      summary: `Gateway daemon is registered via ${daemonStatus.manager}.`,
      metadata: daemonStatus as unknown as Record<string, unknown>
    }
  }

  return {
    key: 'daemon',
    state: 'ok',
    summary: `Gateway daemon integration is available via ${daemonStatus.manager}, but manual mode is active.`,
    metadata: daemonStatus as unknown as Record<string, unknown>
  }
}

export async function collectLocalGatewayDoctorReport(
  options?: { health?: Awaited<ReturnType<typeof collectLocalGatewayHealth>> }
): Promise<GatewayDoctorReport> {
  const health = options?.health || await collectLocalGatewayHealth()
  const sessionStoreStatus = getGatewaySessionPersistenceStatus()

  const checks: GatewayDoctorCheck[] = [
    buildDaemonCheck(),
    buildGatewayLauncherCheck(health),
    buildGatewayProcessCheck(),
    buildCommandRuntimeCheck(health),
    summarizeSessionStoreCheck(sessionStoreStatus),
    buildStepJournalCheck(),
    health.runtime.fallbackActive
      ? {
          key: 'runtime',
          state: 'warn',
          summary: `Configured runtime.mode=${health.runtime.configuredMode}, but active runtime is ${health.runtime.activeKind}.`,
          metadata: health.runtime as unknown as Record<string, unknown>
        }
      : ((health.runtime.native?.interaction.pendingToolApprovalCount || 0) > 0
          || (health.runtime.native?.interaction.pendingUserQuestionCount || 0) > 0)
        ? {
            key: 'runtime',
            state: 'ok',
            summary: `Runtime is healthy (${health.runtime.activeKind}); native lane has ${health.runtime.native?.interaction.pendingToolApprovalCount || 0} pending approval(s) and ${health.runtime.native?.interaction.pendingUserQuestionCount || 0} pending question(s).${health.runtime.native?.interaction.pendingUserQuestionPreview ? ` Waiting for: ${health.runtime.native.interaction.pendingUserQuestionPreview}` : ''}`,
            metadata: health.runtime as unknown as Record<string, unknown>
          }
      : {
          key: 'runtime',
          state: 'ok',
          summary: health.runtime.nativeRegistered
            ? `Runtime is healthy (${health.runtime.activeKind}); native lane is registered.`
            : `Runtime is healthy (${health.runtime.activeKind}); native lane is scaffolded but not registered yet.`,
          metadata: health.runtime as unknown as Record<string, unknown>
        },
    (
      health.host.permissions.accessibility.state === 'needs_permission'
      || health.host.permissions.screenRecording.state === 'needs_permission'
    )
      ? {
          key: 'host-permissions',
          state: 'warn',
          summary: 'Host permissions are incomplete for full desktop automation.',
          metadata: {
            accessibility: health.host.permissions.accessibility.state,
            screenRecording: health.host.permissions.screenRecording.state,
            blockedActionIds: health.host.desktop.actions
              .filter((action) => action.blockedByPermission)
              .map((action) => action.id),
            activeAdapterIds: health.host.desktop.adapters
              .filter((adapter) => adapter.stage === 'active')
              .map((adapter) => adapter.id),
            plannedAdapterIds: health.host.desktop.adapters
              .filter((adapter) => adapter.stage === 'planned')
              .map((adapter) => adapter.id),
            activeMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'active' || method.supported)
              .map((method) => method.id),
            scaffoldedMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'scaffolded')
              .map((method) => method.id),
            plannedMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'planned')
              .map((method) => method.id),
            activeWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.stage === 'active' && workflow.supported)
              .map((workflow) => workflow.id),
            plannedWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.stage === 'planned' || !workflow.supported)
              .map((workflow) => workflow.id),
            blockedWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.blockedByPermission)
              .map((workflow) => workflow.id),
            activeSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.stage === 'active' && smokeFlow.supported)
              .map((smokeFlow) => smokeFlow.id),
            blockedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.blockedByPermission)
              .map((smokeFlow) => smokeFlow.id),
            runningSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'running')
              .map((smokeFlow) => smokeFlow.id),
            passedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'passed')
              .map((smokeFlow) => smokeFlow.id),
            failedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'failed')
              .map((smokeFlow) => smokeFlow.id)
          }
        }
      : {
          key: 'host-permissions',
          state: 'ok',
          summary: 'Host permissions are ready for current automation capabilities.',
          metadata: {
            activeAdapterIds: health.host.desktop.adapters
              .filter((adapter) => adapter.stage === 'active')
              .map((adapter) => adapter.id),
            plannedAdapterIds: health.host.desktop.adapters
              .filter((adapter) => adapter.stage === 'planned')
              .map((adapter) => adapter.id),
            activeMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'active' || method.supported)
              .map((method) => method.id),
            scaffoldedMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'scaffolded')
              .map((method) => method.id),
            plannedMethodIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.methods || [])
              .filter((method) => method.stage === 'planned')
              .map((method) => method.id),
            activeWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.stage === 'active' && workflow.supported)
              .map((workflow) => workflow.id),
            plannedWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.stage === 'planned' || !workflow.supported)
              .map((workflow) => workflow.id),
            blockedWorkflowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.workflows || [])
              .filter((workflow) => workflow.blockedByPermission)
              .map((workflow) => workflow.id),
            activeSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.stage === 'active' && smokeFlow.supported)
              .map((smokeFlow) => smokeFlow.id),
            blockedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.blockedByPermission)
              .map((smokeFlow) => smokeFlow.id),
            runningSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'running')
              .map((smokeFlow) => smokeFlow.id),
            passedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'passed')
              .map((smokeFlow) => smokeFlow.id),
            failedSmokeFlowIds: health.host.desktop.adapters
              .flatMap((adapter) => adapter.smokeFlows || [])
              .filter((smokeFlow) => smokeFlow.lastRun?.state === 'failed')
              .map((smokeFlow) => smokeFlow.id)
          }
        }
  ]

  return {
    generatedAt: new Date().toISOString(),
    overallState: resolveOverallState(checks),
    checks
  }
}

function shouldReadExternalDoctorSnapshot(): boolean {
  const processStatus = getGatewayProcessStatus()
  return processStatus.configuredMode === 'external' && !processStatus.managedByCurrentProcess
}

function mergeSnapshotChecks(
  snapshotChecks: GatewayDoctorCheck[],
  localHealth: Awaited<ReturnType<typeof getGatewayHealth>>
): GatewayDoctorCheck[] {
  const localLauncherCheck = buildGatewayLauncherCheck(localHealth)
  const localProcessCheck = buildGatewayProcessCheck()
  const localDaemonCheck = buildDaemonCheck()

  const mergedChecks = snapshotChecks.filter((check) => (
    check.key !== 'daemon' && check.key !== 'gateway-launcher' && check.key !== 'gateway-process'
  ))

  return [
    localDaemonCheck,
    localLauncherCheck,
    localProcessCheck,
    ...mergedChecks
  ]
}

export async function getGatewayDoctorReport(): Promise<GatewayDoctorReport> {
  const health = await getGatewayHealth()

  if (shouldReadExternalDoctorSnapshot()) {
    const snapshot = loadGatewaySnapshot<GatewayDoctorReport>('doctor', {
      maxAgeMs: EXTERNAL_GATEWAY_DOCTOR_SNAPSHOT_MAX_AGE_MS
    })

    if (snapshot) {
      const checks = mergeSnapshotChecks(snapshot.checks, health)
      return {
        ...snapshot,
        overallState: resolveOverallState(checks),
        checks
      }
    }
  }

  return await collectLocalGatewayDoctorReport({ health })
}
