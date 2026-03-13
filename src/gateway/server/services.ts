import type { GatewayAutomationStatus } from '../automation'
import type { HostEnvironmentStatus } from '../../shared/types/host-runtime'
import type { GatewayChannelStatus } from '../channels'
import type { GatewayCommandRuntimeStatus } from '../commands'
import type { GatewayDaemonStatus } from '../daemon'
import type { StepJournalPersistenceStatus } from '../host-runtime/step-reporter/runtime'
import type { GatewayLauncherStatus, GatewayProcessStatus } from '../process'
import type { RuntimeKind } from '../runtime/types'
import type { NativeRuntimeStatus } from '../runtime/native/runtime'
import type { GatewaySessionStorePersistenceStatus } from '../sessions'
import type { EmbeddedGatewayStatus } from './embedded'
import type { RemoteAccessStatus } from './remote'

export type GatewayServiceKey =
  | 'embedded-gateway'
  | 'gateway-daemon'
  | 'gateway-launcher'
  | 'gateway-process'
  | 'command-runtime'
  | 'channel-runtime'
  | 'remote-access'
  | 'agent-runtime'
  | 'automation-runtime'
  | 'host-runtime'
  | 'session-store'
  | 'step-journal'

export type GatewayServiceCategory = 'gateway' | 'server' | 'runtime' | 'automation' | 'host' | 'storage'
export type GatewayServiceState = 'ready' | 'disabled' | 'degraded' | 'external'

export interface GatewayRuntimeStatus {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  activeKind: RuntimeKind
  fallbackActive: boolean
  registeredKinds?: RuntimeKind[]
  nativeRegistered?: boolean
  hybridTaskRouting?: boolean
  native?: NativeRuntimeStatus
}

export interface GatewayServiceDescriptor {
  key: GatewayServiceKey
  category: GatewayServiceCategory
  state: GatewayServiceState
  summary: string
  metadata?: Record<string, unknown>
}

export interface GatewayServiceRegistryInput {
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
}

function resolveHostServiceState(host: HostEnvironmentStatus): GatewayServiceState {
  if (host.browser.state !== 'ready') {
    return 'degraded'
  }

  if (host.desktop.state === 'ready') {
    const needsPermission =
      host.permissions.accessibility.state === 'needs_permission'
      || host.permissions.screenRecording.state === 'needs_permission'

    if (needsPermission) {
      return 'degraded'
    }
  }

  return 'ready'
}

export function buildGatewayServiceRegistry(input: GatewayServiceRegistryInput): GatewayServiceDescriptor[] {
  const gatewayService: GatewayServiceDescriptor = input.gateway.mode === 'external'
    ? {
        key: 'embedded-gateway',
        category: 'gateway',
        state: 'external',
        summary: 'Gateway is configured for an external process.',
        metadata: {
          mode: input.gateway.mode,
          featureEnabled: input.gateway.featureEnabled
        }
      }
    : {
        key: 'embedded-gateway',
        category: 'gateway',
        state: input.gateway.state === 'running' ? 'ready' : 'disabled',
        summary: input.gateway.state === 'running'
          ? 'Embedded gateway lifecycle is active.'
          : 'Embedded gateway lifecycle is stopped.',
        metadata: {
          mode: input.gateway.mode,
          featureEnabled: input.gateway.featureEnabled,
          startedAt: input.gateway.startedAt
        }
      }

  const hasCoreChannels =
    input.channels.registeredChannelIds.includes('electron')
    && input.channels.registeredChannelIds.includes('remote-web')
  const relayReady =
    input.process.configuredMode !== 'external'
    || input.channels.relay.mode === 'publishing'
    || input.channels.relay.mode === 'consuming'

  const channelService: GatewayServiceDescriptor = {
    key: 'channel-runtime',
    category: 'gateway',
    state: !input.channels.coreInitialized
      ? 'disabled'
      : hasCoreChannels && relayReady
        ? 'ready'
        : 'degraded',
    summary: hasCoreChannels
      ? `Registered channels: ${input.channels.registeredChannelIds.join(', ')}; relay=${input.channels.relay.mode}.`
      : 'Gateway core channels are not fully registered.',
    metadata: {
      coreInitialized: input.channels.coreInitialized,
      optionalInitialized: input.channels.optionalInitialized,
      registeredChannelIds: input.channels.registeredChannelIds,
      feishu: input.channels.feishu,
      relay: input.channels.relay
    }
  }

  const remoteService: GatewayServiceDescriptor = {
    key: 'remote-access',
    category: 'server',
    state: input.remote.server.running ? 'ready' : 'disabled',
    summary: input.remote.server.running
      ? `Remote access server is listening on port ${input.remote.server.port}.`
      : 'Remote access server is idle.',
    metadata: {
      enabled: input.remote.enabled,
      clients: input.remote.clients,
      tunnelStatus: input.remote.tunnel.status
    }
  }

  const commandService: GatewayServiceDescriptor = {
    key: 'command-runtime',
    category: 'gateway',
    state: input.process.configuredMode !== 'external'
      ? 'disabled'
      : input.commands.lastError
        ? 'degraded'
        : input.commands.initialized
          ? 'ready'
          : 'disabled',
    summary: input.process.configuredMode !== 'external'
      ? 'Gateway command runtime is only used in external mode.'
      : input.commands.lastError
        ? `Gateway command runtime reported an error: ${input.commands.lastError}.`
        : input.commands.initialized
          ? `Gateway command runtime is active (${input.commands.processedCount} processed, ${input.commands.pendingCount} pending).`
          : 'Gateway command runtime is not initialized.',
    metadata: {
      processRole: input.commands.processRole,
      pollIntervalMs: input.commands.pollIntervalMs,
      pendingCount: input.commands.pendingCount,
      processingCount: input.commands.processingCount,
      processedCount: input.commands.processedCount,
      failedCount: input.commands.failedCount,
      lastCommandName: input.commands.lastCommandName,
      lastCommandAt: input.commands.lastCommandAt,
      lastSuccessAt: input.commands.lastSuccessAt,
      lastFailureAt: input.commands.lastFailureAt,
      lastError: input.commands.lastError
    }
  }

  const runtimeService: GatewayServiceDescriptor = {
    key: 'agent-runtime',
    category: 'runtime',
    state: input.runtime.fallbackActive ? 'degraded' : 'ready',
    summary: input.runtime.fallbackActive
      ? `Configured runtime.mode=${input.runtime.configuredMode}, but active runtime is ${input.runtime.activeKind}.`
      : (input.runtime.native?.interaction.pendingToolApprovalCount || input.runtime.native?.interaction.pendingUserQuestionCount)
        ? `Active runtime is ${input.runtime.activeKind}; native lane has ${input.runtime.native?.interaction.pendingToolApprovalCount || 0} pending approval(s) and ${input.runtime.native?.interaction.pendingUserQuestionCount || 0} pending question(s).${input.runtime.native?.interaction.pendingUserQuestionPreview ? ` Waiting for: ${input.runtime.native.interaction.pendingUserQuestionPreview}` : ''}`
      : input.runtime.nativeRegistered
        ? `Active runtime is ${input.runtime.activeKind}; native lane is registered.`
        : `Active runtime is ${input.runtime.activeKind}; native lane is scaffolded but not registered yet.`,
    metadata: {
      configuredMode: input.runtime.configuredMode,
      activeKind: input.runtime.activeKind,
      fallbackActive: input.runtime.fallbackActive,
      registeredKinds: input.runtime.registeredKinds || [input.runtime.activeKind],
      nativeRegistered: input.runtime.nativeRegistered ?? false,
      hybridTaskRouting: input.runtime.hybridTaskRouting ?? false,
      native: input.runtime.native || null
    }
  }

  const automationService: GatewayServiceDescriptor = {
    key: 'automation-runtime',
    category: 'automation',
    state: input.automation.initialized ? 'ready' : 'disabled',
    summary: input.automation.initialized
      ? `Ralph=${input.automation.ralph.status || 'idle'}, subagents=${input.automation.subagents.activeRuns}/${input.automation.subagents.totalRuns}, scheduled jobs=${input.automation.loopTasks.activeJobCount}, pending retries=${input.automation.loopTasks.pendingRetryCount}.`
      : 'Gateway automation lifecycle is not initialized.',
    metadata: {
      initialized: input.automation.initialized,
      ralph: input.automation.ralph,
      subagents: input.automation.subagents,
      scheduledTaskCount: input.automation.loopTasks.scheduledTaskCount,
      activeJobCount: input.automation.loopTasks.activeJobCount,
      pendingRetryCount: input.automation.loopTasks.pendingRetryCount,
      recovery: input.automation.loopTasks.recovery
    }
  }

  const hostService: GatewayServiceDescriptor = {
    key: 'host-runtime',
    category: 'host',
    state: resolveHostServiceState(input.host),
    summary: `Browser=${input.host.browser.state}, desktop=${input.host.desktop.state}, actions=${input.host.desktop.actions.filter(action => action.supported).length}, methods=${input.host.desktop.adapters.flatMap((adapter) => adapter.methods || []).filter((method) => method.supported).length}/${input.host.desktop.adapters.flatMap((adapter) => adapter.methods || []).length}, workflows=${input.host.desktop.adapters.flatMap((adapter) => adapter.workflows || []).filter((workflow) => workflow.supported && workflow.stage === 'active').length}.`,
    metadata: {
      platform: input.host.platform,
      desktopBackend: input.host.desktop.backend,
      desktopActiveAdapterIds: input.host.desktop.adapters
        .filter((adapter) => adapter.stage === 'active')
        .map((adapter) => adapter.id),
      desktopPlannedAdapterIds: input.host.desktop.adapters
        .filter((adapter) => adapter.stage === 'planned')
        .map((adapter) => adapter.id),
      desktopActiveMethodIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.methods || [])
        .filter((method) => method.stage === 'active' || method.supported)
        .map((method) => method.id),
      desktopScaffoldedMethodIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.methods || [])
        .filter((method) => method.stage === 'scaffolded')
        .map((method) => method.id),
      desktopPlannedMethodIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.methods || [])
        .filter((method) => method.stage === 'planned')
        .map((method) => method.id),
      desktopActiveWorkflowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.workflows || [])
        .filter((workflow) => workflow.stage === 'active' && workflow.supported)
        .map((workflow) => workflow.id),
      desktopPlannedWorkflowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.workflows || [])
        .filter((workflow) => workflow.stage === 'planned' || !workflow.supported)
        .map((workflow) => workflow.id),
      desktopBlockedWorkflowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.workflows || [])
        .filter((workflow) => workflow.blockedByPermission)
        .map((workflow) => workflow.id),
      desktopActiveSmokeFlowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.smokeFlows || [])
        .filter((smokeFlow) => smokeFlow.stage === 'active' && smokeFlow.supported)
        .map((smokeFlow) => smokeFlow.id),
      desktopBlockedSmokeFlowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.smokeFlows || [])
        .filter((smokeFlow) => smokeFlow.blockedByPermission)
        .map((smokeFlow) => smokeFlow.id),
      desktopRunningSmokeFlowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.smokeFlows || [])
        .filter((smokeFlow) => smokeFlow.lastRun?.state === 'running')
        .map((smokeFlow) => smokeFlow.id),
      desktopPassedSmokeFlowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.smokeFlows || [])
        .filter((smokeFlow) => smokeFlow.lastRun?.state === 'passed')
        .map((smokeFlow) => smokeFlow.id),
      desktopFailedSmokeFlowIds: input.host.desktop.adapters
        .flatMap((adapter) => adapter.smokeFlows || [])
        .filter((smokeFlow) => smokeFlow.lastRun?.state === 'failed')
        .map((smokeFlow) => smokeFlow.id),
      blockedActionIds: input.host.desktop.actions
        .filter((action) => action.blockedByPermission)
        .map((action) => action.id),
      accessibility: input.host.permissions.accessibility.state,
      screenRecording: input.host.permissions.screenRecording.state
    }
  }

  const processService: GatewayServiceDescriptor = {
    key: 'gateway-process',
    category: 'gateway',
    state: input.process.state === 'embedded-owner'
      ? 'ready'
      : input.process.state === 'external-observed'
        ? 'external'
        : input.process.configuredMode === 'external'
          ? 'degraded'
          : 'disabled',
    summary: input.process.state === 'embedded-owner'
      ? `Gateway process heartbeat is owned by pid ${input.process.pid}.`
      : input.process.state === 'external-observed'
        ? `Observed external gateway process pid ${input.process.pid}.`
        : input.process.configuredMode === 'external'
          ? 'Waiting for external gateway process status.'
          : 'Gateway process metadata is not active.',
    metadata: {
      configuredMode: input.process.configuredMode,
      heartbeatAgeMs: input.process.heartbeatAgeMs,
      filePath: input.process.filePath,
      lastError: input.process.lastError
    }
  }

  const daemonService: GatewayServiceDescriptor = {
    key: 'gateway-daemon',
    category: 'gateway',
    state: input.daemon.lastError || input.daemon.lockState === 'stale' || input.daemon.lockState === 'error'
      ? 'degraded'
      : input.daemon.registered
        ? 'ready'
        : input.daemon.supported
          ? 'disabled'
          : 'disabled',
    summary: input.daemon.lastError
      ? 'Gateway daemon status reported an error.'
      : input.daemon.registered
        ? `Gateway daemon is registered via ${input.daemon.manager}.`
        : input.daemon.supported
          ? `Gateway daemon is available via ${input.daemon.manager}, but manual mode is active.`
          : 'Gateway daemon integration is not available on this platform.',
    metadata: {
      manager: input.daemon.manager,
      desiredMode: input.daemon.desiredMode,
      installable: input.daemon.installable,
      registered: input.daemon.registered,
      autoStartEnabled: input.daemon.autoStartEnabled,
      statusFilePath: input.daemon.statusFilePath,
      lockFilePath: input.daemon.lockFilePath,
      statusFileExists: input.daemon.statusFileExists,
      lockFileExists: input.daemon.lockFileExists,
      registeredAt: input.daemon.registeredAt,
      updatedAt: input.daemon.updatedAt,
      lockState: input.daemon.lockState,
      lockOwner: input.daemon.lockOwner,
      lockPid: input.daemon.lockPid,
      lockAcquiredAt: input.daemon.lockAcquiredAt,
      lockLastHeartbeatAt: input.daemon.lockLastHeartbeatAt,
      lockHeartbeatAgeMs: input.daemon.lockHeartbeatAgeMs,
      note: input.daemon.note,
      lastError: input.daemon.lastError
    }
  }

  const sessionStoreService: GatewayServiceDescriptor = {
    key: 'session-store',
    category: 'storage',
    state: !input.sessionStore.enabled
      ? 'disabled'
      : !input.sessionStore.hydrated
        ? 'degraded'
        : input.sessionStore.lastLoadError || input.sessionStore.lastSaveError
        ? 'degraded'
        : 'ready',
    summary: !input.sessionStore.enabled
      ? 'Gateway session store persistence is not configured.'
      : !input.sessionStore.hydrated
        ? 'Gateway session store persistence is configured but not hydrated yet.'
        : `Gateway session store persisted ${input.sessionStore.sessionCount} sessions.`,
    metadata: {
      filePath: input.sessionStore.filePath,
      hydrated: input.sessionStore.hydrated,
      snapshotSavedAt: input.sessionStore.snapshotSavedAt,
      fileExists: input.sessionStore.fileExists,
      backupExists: input.sessionStore.backupExists,
      lastLoadedAt: input.sessionStore.lastLoadedAt,
      lastSavedAt: input.sessionStore.lastSavedAt,
      lastLoadError: input.sessionStore.lastLoadError,
      lastSaveError: input.sessionStore.lastSaveError
    }
  }

  const stepJournalService: GatewayServiceDescriptor = {
    key: 'step-journal',
    category: 'storage',
    state: !input.stepJournal.enabled
      ? 'disabled'
      : input.stepJournal.lastLoadError || input.stepJournal.lastPersistError
        ? 'degraded'
        : 'ready',
    summary: !input.stepJournal.enabled
      ? 'Host step journal persistence is not configured.'
      : `Host step journal persisted ${input.stepJournal.persistedStepCount} steps across ${input.stepJournal.persistedTaskCount} task journals.`,
    metadata: {
      dir: input.stepJournal.dir,
      inMemoryTaskCount: input.stepJournal.inMemoryTaskCount,
      persistedTaskCount: input.stepJournal.persistedTaskCount,
      persistedStepCount: input.stepJournal.persistedStepCount,
      journalFileCount: input.stepJournal.journalFileCount,
      lastRecoveredTaskId: input.stepJournal.lastRecoveredTaskId,
      lastLoadedAt: input.stepJournal.lastLoadedAt,
      lastPersistedAt: input.stepJournal.lastPersistedAt,
      lastLoadError: input.stepJournal.lastLoadError,
      lastPersistError: input.stepJournal.lastPersistError
    }
  }

  const launcherService: GatewayServiceDescriptor = {
    key: 'gateway-launcher',
    category: 'gateway',
    state: !input.launcher.enabled
      ? 'disabled'
      : input.launcher.state === 'connected'
        ? 'external'
        : input.launcher.state === 'error'
          ? 'degraded'
          : 'ready',
    summary: !input.launcher.enabled
      ? 'External gateway launcher is disabled.'
      : input.launcher.state === 'connected'
        ? 'External gateway launcher is connected to an external gateway process.'
        : input.launcher.state === 'error'
          ? 'External gateway launcher failed to start or reconnect.'
          : `External gateway launcher state=${input.launcher.state}.`,
    metadata: {
      childPid: input.launcher.childPid,
      launchedAt: input.launcher.launchedAt,
      reconnectAttempts: input.launcher.reconnectAttempts,
      reconnectScheduled: input.launcher.reconnectScheduled,
      observedExternalProcess: input.launcher.observedExternalProcess,
      lastLaunchError: input.launcher.lastLaunchError
    }
  }

  return [
    gatewayService,
    daemonService,
    launcherService,
    processService,
    commandService,
    channelService,
    remoteService,
    runtimeService,
    automationService,
    hostService,
    sessionStoreService,
    stepJournalService
  ]
}
