import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

const mocks = vi.hoisted(() => ({
  getGatewayHealth: vi.fn(async () => ({
    gateway: {
      mode: 'external'
    },
    launcher: {
      state: 'connected'
    },
    process: {
      configuredMode: 'embedded',
      state: 'embedded-owner',
      managedByCurrentProcess: true
    },
    commands: {
      initialized: true,
      processRole: 'external-gateway',
      pollIntervalMs: 200,
      pendingCount: 0,
      processingCount: 0,
      processedCount: 5,
      failedCount: 0,
      lastCommandName: 'loop-task.create',
      lastCommandAt: '2026-03-12T08:00:05.000Z',
      lastSuccessAt: '2026-03-12T08:00:05.000Z',
      lastFailureAt: null,
      lastError: null
    },
    runtime: {
      configuredMode: 'native',
      activeKind: 'claude-sdk',
      fallbackActive: true,
      registeredKinds: ['claude-sdk'],
      nativeRegistered: false,
      hybridTaskRouting: true,
      native: {
        scaffolded: true,
        ready: false,
        endpointSupported: false,
        adapterResolved: false,
        adapterStage: null,
        transportResolved: false,
        providerNativeExecution: false,
        sharedToolRegistryReady: true,
        taskRoutingReady: true,
        supportedProviders: ['openai', 'openai-codex'],
        supportedApiTypes: ['responses'],
        availableAdapterIds: ['openai-responses', 'openai-codex-responses'],
        currentSource: null,
        currentProvider: null,
        currentApiType: null,
        sharedToolProviderIds: [],
        nativeToolProviderIds: [],
        adapterId: null,
        transport: null,
        supportsStreaming: false,
        supportsToolCalls: false,
        supportsUsage: false,
        interaction: {
          pendingToolApprovalCount: 0,
          pendingUserQuestionCount: 0,
          pendingConversationIds: [],
          pendingUserQuestionPreview: null,
          pendingUserQuestionHeader: null,
          lastToolApprovalRequestedAt: null,
          lastToolApprovalResolvedAt: null,
          lastUserQuestionRequestedAt: null,
          lastUserQuestionResolvedAt: null
        },
        note: getNativeUserFacingMessage('scaffoldReadyButInactive')
      }
    },
    host: {
      desktop: {
        actions: [
          { id: 'press_key', supported: true, blockedByPermission: true }
        ],
        adapters: [
          { id: 'generic-macos', stage: 'active', supported: true, methods: [] },
          {
            id: 'finder',
            stage: 'planned',
            supported: false,
            methods: [
              { id: 'finder.reveal_path', action: 'run_applescript', supported: true, stage: 'active' },
              { id: 'finder.open_folder', action: 'open_application', supported: true, stage: 'active' }
            ]
          }
        ]
      },
      permissions: {
        accessibility: { state: 'needs_permission' },
        screenRecording: { state: 'granted' }
      }
    }
  })),
  getGatewayProcessStatus: vi.fn(() => ({
    configuredMode: 'embedded',
    state: 'embedded-owner',
    managedByCurrentProcess: true,
    owner: 'electron-main',
    filePath: '/tmp/gateway/process.json',
    pid: 4242,
    startedAt: '2026-03-12T08:00:00.000Z',
    lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
    heartbeatAgeMs: 10,
    lastError: null
  })),
  getGatewaySessionPersistenceStatus: vi.fn(() => ({
    enabled: true,
    filePath: '/tmp/gateway/session-store.json',
    hydrated: true,
    sessionCount: 4,
    snapshotSavedAt: '2026-03-12T08:00:05.000Z',
    fileExists: true,
    backupExists: true,
    lastLoadedAt: '2026-03-12T08:00:00.000Z',
    lastSavedAt: '2026-03-12T08:00:05.000Z',
    lastLoadError: null,
    lastSaveError: null
  })),
  getGatewayDaemonStatus: vi.fn(() => ({
    supported: true,
    manager: 'launch-agent',
    state: 'manual-only',
    desiredMode: 'manual',
    installable: true,
    registered: false,
    autoStartEnabled: false,
    statusFilePath: '/tmp/gateway/daemon.json',
    lockFilePath: '/tmp/gateway/daemon.lock',
    statusFileExists: false,
    lockFileExists: false,
    registeredAt: null,
    updatedAt: null,
    lockState: 'inactive',
    lockOwner: null,
    lockPid: null,
    lockAcquiredAt: null,
    lockLastHeartbeatAt: null,
    lockHeartbeatAgeMs: null,
    note: 'Gateway daemon integration is available via launch-agent, but manual mode is active.',
    lastError: null
  })),
  loadGatewaySnapshot: vi.fn(() => null),
  getPersistenceStatus: vi.fn(() => ({
    enabled: true,
    dir: '/tmp/host-steps',
    inMemoryTaskCount: 2,
    persistedTaskCount: 2,
    persistedStepCount: 7,
    journalFileCount: 2,
    lastRecoveredTaskId: 'conv-1',
    lastLoadedAt: '2026-03-12T08:00:00.000Z',
    lastPersistedAt: '2026-03-12T08:00:05.000Z',
    lastLoadError: null,
    lastPersistError: null
  }))
}))

vi.mock('../../../../src/gateway/server/health', () => ({
  getGatewayHealth: mocks.getGatewayHealth
}))

vi.mock('../../../../src/gateway/server/snapshots', () => ({
  loadGatewaySnapshot: mocks.loadGatewaySnapshot
}))

vi.mock('../../../../src/gateway/process', () => ({
  getGatewayProcessStatus: mocks.getGatewayProcessStatus
}))

vi.mock('../../../../src/gateway/daemon', () => ({
  getGatewayDaemonStatus: mocks.getGatewayDaemonStatus
}))

vi.mock('../../../../src/gateway/sessions/persistence', () => ({
  getGatewaySessionPersistenceStatus: mocks.getGatewaySessionPersistenceStatus
}))

vi.mock('../../../../src/gateway/host-runtime/step-reporter/runtime', () => ({
  stepReporterRuntime: {
    getPersistenceStatus: mocks.getPersistenceStatus
  }
}))

import { getGatewayDoctorReport } from '../../../../src/gateway/doctor'

describe('gateway doctor report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadGatewaySnapshot.mockReturnValue(null)
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'embedded',
      state: 'embedded-owner',
      managedByCurrentProcess: true,
      owner: 'electron-main',
      filePath: '/tmp/gateway/process.json',
      pid: 4242,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
  })

  it('summarizes process, persistence, runtime, and host readiness into a doctor report', async () => {
    const report = await getGatewayDoctorReport()

    expect(report.overallState).toBe('warn')
    expect(report.checks).toEqual([
      expect.objectContaining({ key: 'daemon', state: 'ok' }),
      expect.objectContaining({ key: 'gateway-launcher', state: 'ok' }),
      expect.objectContaining({ key: 'gateway-process', state: 'ok' }),
      expect.objectContaining({ key: 'command-runtime', state: 'ok' }),
      expect.objectContaining({ key: 'session-store', state: 'ok' }),
      expect.objectContaining({ key: 'step-journal', state: 'ok' }),
      expect.objectContaining({ key: 'runtime', state: 'warn' }),
      expect.objectContaining({ key: 'host-permissions', state: 'warn' })
    ])
  })

  it('uses external doctor snapshots while keeping launcher/process checks local', async () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 5151,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
    mocks.loadGatewaySnapshot.mockReturnValue({
      generatedAt: '2026-03-12T08:12:00.000Z',
      overallState: 'fail',
      checks: [
        {
          key: 'daemon',
          state: 'warn',
          summary: 'Gateway daemon is not configured.'
        },
        {
          key: 'gateway-launcher',
          state: 'warn',
          summary: 'Gateway launcher state is disabled.'
        },
        {
          key: 'gateway-process',
          state: 'ok',
          summary: 'Gateway process status is external-observed.'
        },
        {
          key: 'command-runtime',
          state: 'ok',
          summary: 'Gateway command runtime is active.'
        },
        {
          key: 'session-store',
          state: 'fail',
          summary: 'Gateway session store persistence reported load/save errors.'
        },
        {
          key: 'step-journal',
          state: 'ok',
          summary: 'Host step journal persistence is enabled.'
        },
        {
          key: 'runtime',
          state: 'ok',
          summary: 'Runtime is healthy (native).'
        },
        {
          key: 'host-permissions',
          state: 'ok',
          summary: 'Host permissions are ready for current automation capabilities.',
          metadata: {
            activeAdapterIds: ['generic-macos'],
            plannedAdapterIds: ['finder'],
            activeMethodIds: ['finder.reveal_path', 'finder.open_folder'],
            scaffoldedMethodIds: [],
            plannedMethodIds: [],
            activeWorkflowIds: [],
            plannedWorkflowIds: [],
            blockedWorkflowIds: [],
            activeSmokeFlowIds: [],
            blockedSmokeFlowIds: [],
            runningSmokeFlowIds: [],
            passedSmokeFlowIds: [],
            failedSmokeFlowIds: []
          }
        }
      ]
    })

    const report = await getGatewayDoctorReport()

    expect(report.generatedAt).toBe('2026-03-12T08:12:00.000Z')
    expect(report.overallState).toBe('fail')
    expect(report.checks[0]).toEqual(expect.objectContaining({
      key: 'daemon',
      state: 'ok'
    }))
    expect(report.checks[1]).toEqual(expect.objectContaining({
      key: 'gateway-launcher',
      state: 'ok'
    }))
    expect(report.checks[2]).toEqual(expect.objectContaining({
      key: 'gateway-process',
      state: 'ok'
    }))
    expect(report.checks[3]).toEqual(expect.objectContaining({
      key: 'command-runtime',
      state: 'ok'
    }))
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'session-store', state: 'fail' }),
      expect.objectContaining({ key: 'runtime', state: 'ok' }),
      expect.objectContaining({
        key: 'host-permissions',
        metadata: expect.objectContaining({
          activeMethodIds: ['finder.reveal_path', 'finder.open_folder'],
          scaffoldedMethodIds: [],
          plannedMethodIds: [],
          activeWorkflowIds: [],
          plannedWorkflowIds: [],
          blockedWorkflowIds: [],
          activeSmokeFlowIds: [],
          blockedSmokeFlowIds: [],
          runningSmokeFlowIds: [],
          passedSmokeFlowIds: [],
          failedSmokeFlowIds: []
        })
      })
    ]))
  })
})
