import { getConfig } from '../../main/services/config.service'
import { getEnabledExtensions } from '../../main/services/extension'
import { getAISourceManager } from '../../main/services/ai-sources/manager'
import { getGatewayAutomationStatus, type GatewayAutomationStatus } from '../automation'
import { getGatewayChannelStatus, type GatewayChannelStatus } from '../channels'
import {
  getGatewayCommandRuntimeStatus,
  type GatewayCommandRuntimeStatus
} from '../commands'
import { getGatewayDaemonStatus, type GatewayDaemonStatus } from '../daemon'
import { hostRuntime } from '../host-runtime'
import { stepReporterRuntime, type StepJournalPersistenceStatus } from '../host-runtime/step-reporter/runtime'
import {
  getGatewayLauncherStatus,
  getGatewayProcessStatus,
  type GatewayLauncherStatus,
  type GatewayProcessStatus
} from '../process'
import { runtimeOrchestrator } from '../runtime/orchestrator'
import { getNativeRuntimeStatus } from '../runtime/native/runtime'
import { runNativeRolloutAcceptance } from '../runtime/rollout-acceptance'
import { resolveNativeRolloutStatus } from '../runtime/routing'
import {
  getGatewaySessionStorePersistenceStatus,
  type GatewaySessionStorePersistenceStatus
} from '../sessions'
import type { HostEnvironmentStatus } from '../../shared/types/host-runtime'
import { getEmbeddedGatewayStatus, type EmbeddedGatewayStatus } from './embedded'
import { getRemoteAccessStatus, type RemoteAccessStatus } from './remote'
import { loadGatewaySnapshot } from './snapshots'
import {
  buildGatewayServiceRegistry,
  type GatewayRuntimeStatus,
  type GatewayServiceDescriptor
} from './services'
import { buildSharedToolProviderDefinitions } from '../tools/providers'

const EXTERNAL_GATEWAY_SNAPSHOT_MAX_AGE_MS = 15000

export interface GatewayHealthStatus {
  checkedAt: string
  gateway: EmbeddedGatewayStatus
  launcher: GatewayLauncherStatus
  process: GatewayProcessStatus
  daemon: GatewayDaemonStatus
  channels: GatewayChannelStatus
  commands: GatewayCommandRuntimeStatus
  remote: RemoteAccessStatus
  runtime: GatewayRuntimeStatus
  automation: GatewayAutomationStatus
  host: HostEnvironmentStatus
  sessionStore: GatewaySessionStorePersistenceStatus
  stepJournal: StepJournalPersistenceStatus
  services: GatewayServiceDescriptor[]
}

function getGatewayRuntimeStatus(host: HostEnvironmentStatus): GatewayRuntimeStatus {
  const config = getConfig()
  const configuredMode = config.runtime?.mode || 'claude-sdk'
  const activeKind = runtimeOrchestrator.getRuntime().kind
  const registeredKinds = runtimeOrchestrator.listRegisteredRuntimeKinds()
  const nativeRegistered = runtimeOrchestrator.hasRuntime('native')
  const runtimeEndpoint = getAISourceManager().resolveRuntimeEndpoint()
  const sharedToolProviders = buildSharedToolProviderDefinitions({
    effectiveAiBrowserEnabled: config.browserAutomation?.mode !== 'system-browser',
    includeSkillMcp: true,
    extensionProviderIds: getEnabledExtensions().map((extension) => extension.manifest.id)
  })
  const native = getNativeRuntimeStatus({
    endpoint: runtimeEndpoint,
    sharedToolProviders
  })

  return {
    configuredMode,
    activeKind,
    fallbackActive: configuredMode !== 'claude-sdk' && activeKind !== 'native',
    registeredKinds,
    nativeRegistered,
    hybridTaskRouting: true,
    rollout: resolveNativeRolloutStatus({
      configuredMode,
      hasNativeRuntime: nativeRegistered,
      nativeReady: native.ready,
      nativeNote: native.note,
      host
    }),
    native
  }
}

function shouldReadExternalGatewaySnapshot(processStatus: GatewayProcessStatus): boolean {
  return processStatus.configuredMode === 'external' && !processStatus.managedByCurrentProcess
}

function resolveMergedProcessStatus(
  localProcess: GatewayProcessStatus,
  snapshotProcess: GatewayProcessStatus
): GatewayProcessStatus {
  return localProcess.state === 'awaiting-external' ? snapshotProcess : localProcess
}

function resolveMergedChannelStatus(
  localChannels: GatewayChannelStatus,
  snapshotChannels: GatewayChannelStatus
): GatewayChannelStatus {
  return {
    ...snapshotChannels,
    relay: localChannels.relay
  }
}

export async function collectLocalGatewayHealth(): Promise<GatewayHealthStatus> {
  const gateway = getEmbeddedGatewayStatus()
  const launcher = getGatewayLauncherStatus()
  const process = getGatewayProcessStatus()
  const daemon = getGatewayDaemonStatus()
  const channels = getGatewayChannelStatus()
  const commands = getGatewayCommandRuntimeStatus()
  const remote = getRemoteAccessStatus()
  const automation = getGatewayAutomationStatus()
  const host = await hostRuntime.status.getEnvironmentStatus()
  const runtime = getGatewayRuntimeStatus(host)
  const sessionStore = getGatewaySessionStorePersistenceStatus()
  const stepJournal = stepReporterRuntime.getPersistenceStatus()
  const services = buildGatewayServiceRegistry({
    gateway,
    launcher,
    process,
    daemon,
    channels,
    commands,
    remote,
    runtime,
    automation,
    host,
    sessionStore,
    stepJournal
  })

  return {
    checkedAt: new Date().toISOString(),
    gateway,
    launcher,
    process,
    daemon,
    channels,
    commands,
    remote,
    runtime,
    automation,
    host,
    sessionStore,
    stepJournal,
    services
  }
}

export async function getGatewayHealth(): Promise<GatewayHealthStatus> {
  const localProcess = getGatewayProcessStatus()
  const localLauncher = getGatewayLauncherStatus()
  const localChannels = getGatewayChannelStatus()

  if (shouldReadExternalGatewaySnapshot(localProcess)) {
    const snapshot = loadGatewaySnapshot<GatewayHealthStatus>('health', {
      maxAgeMs: EXTERNAL_GATEWAY_SNAPSHOT_MAX_AGE_MS
    })

    if (snapshot) {
      const process = resolveMergedProcessStatus(localProcess, snapshot.process)
      const channels = resolveMergedChannelStatus(localChannels, snapshot.channels)
      const commands = snapshot.commands || getGatewayCommandRuntimeStatus()
      const services = buildGatewayServiceRegistry({
        gateway: snapshot.gateway,
        launcher: localLauncher,
        process,
        daemon: snapshot.daemon,
        channels,
        commands,
        remote: snapshot.remote,
        runtime: snapshot.runtime,
        automation: snapshot.automation,
        host: snapshot.host,
        sessionStore: snapshot.sessionStore,
        stepJournal: snapshot.stepJournal
      })

      return {
        ...snapshot,
        launcher: localLauncher,
        process,
        channels,
        commands,
        services
      }
    }
  }

  return await collectLocalGatewayHealth()
}

export async function listGatewayServices(): Promise<GatewayServiceDescriptor[]> {
  return (await getGatewayHealth()).services
}

export async function runGatewayRuntimeRolloutAcceptance(args: {
  targetId: 'all' | 'chat-simple' | 'browser-simple' | 'terminal-simple'
  workDir?: string
}) {
  return await runNativeRolloutAcceptance(args)
}
