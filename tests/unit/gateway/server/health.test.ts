import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({
    runtime: {
      mode: 'native'
    }
  })),
  getEmbeddedGatewayStatus: vi.fn(() => ({
    state: 'running',
    mode: 'embedded',
    featureEnabled: true,
    startedAt: '2026-03-11T08:00:00.000Z',
    remoteAccess: {
      enabled: true,
      running: true,
      clients: 2,
      tunnelStatus: 'running'
    }
  })),
  getGatewayChannelStatus: vi.fn(() => ({
    coreInitialized: true,
    optionalInitialized: true,
    registeredChannelIds: ['electron', 'remote-web', 'feishu'],
    feishu: {
      registered: true,
      enabled: true,
      connected: true,
      botName: 'Test Bot',
      activeSessions: 2
    },
    relay: {
      enabled: true,
      dir: '/tmp/skillsfan/gateway/channel-relay',
      mode: 'consuming',
      consumerActive: true,
      queuedEventCount: 0,
      lastPublishedAt: '2026-03-12T08:00:04.000Z',
      lastConsumedAt: '2026-03-12T08:00:05.000Z',
      lastError: null
    }
  })),
  getGatewayCommandRuntimeStatus: vi.fn(() => ({
    initialized: true,
    processRole: 'external-gateway',
    pollIntervalMs: 200,
    pendingCount: 0,
    processingCount: 0,
    processedCount: 9,
    failedCount: 1,
    lastCommandName: 'loop-task.create',
    lastCommandAt: '2026-03-12T08:00:05.000Z',
    lastSuccessAt: '2026-03-12T08:00:05.000Z',
    lastFailureAt: '2026-03-12T07:59:59.000Z',
    lastError: null
  })),
  getRemoteAccessStatus: vi.fn(() => ({
    enabled: true,
    server: {
      running: true,
      port: 3847,
      token: 'token-123',
      localUrl: 'http://localhost:3847',
      lanUrl: 'http://192.168.0.8:3847'
    },
    tunnel: {
      status: 'running',
      url: 'https://example.com',
      error: null
    },
    clients: 2
  })),
  getGatewayAutomationStatus: vi.fn(() => ({
    initialized: true,
    ralph: {
      active: true,
      taskId: 'ralph-1',
      status: 'running',
      currentStoryId: 'US-001',
      iteration: 4,
      currentLoop: 1
    },
    subagents: {
      registryLoaded: true,
      totalRuns: 3,
      activeRuns: 1,
      waitingAnnouncementRuns: 1
    },
    loopTasks: {
      scheduledTaskCount: 2,
      activeJobCount: 1,
      pendingRetryCount: 1,
      recovery: {
        attemptedAt: '2026-03-11T08:10:00.000Z',
        recoveredCount: 2,
        recoveredTaskIds: ['task-1', 'task-2']
      }
    }
  })),
  getEnvironmentStatus: vi.fn(async () => ({
    platform: 'darwin',
    browser: {
      state: 'ready',
      backend: 'automated',
      toolCount: 3
    },
    desktop: {
      state: 'ready',
      backend: 'generic-macos',
      actions: [
        {
          id: 'press_key',
          supported: true,
          requiresAccessibilityPermission: true,
          blockedByPermission: false,
          notes: 'Requires macOS Accessibility permission.'
        }
      ],
      adapters: [
        {
          id: 'generic-macos',
          displayName: 'Generic macOS Automation',
          supported: true,
          stage: 'active',
          applicationNames: [],
          actions: ['press_key'],
          notes: 'Current desktop actions run through generic AppleScript and CoreGraphics automation.'
        },
        {
          id: 'finder',
          displayName: 'Finder Adapter',
          supported: false,
          stage: 'planned',
          applicationNames: ['Finder'],
          actions: ['press_key'],
          notes: 'Planned app-specific adapter for Finder workflows in M5.'
        }
      ],
      errorCodes: ['permission_denied', 'timeout']
    },
    permissions: {
      accessibility: { state: 'granted' },
      screenRecording: { state: 'granted' }
    }
  })),
  getGatewayProcessStatus: vi.fn(() => ({
    configuredMode: 'embedded',
    state: 'embedded-owner',
    managedByCurrentProcess: true,
    owner: 'electron-main',
    filePath: '/tmp/skillsfan/gateway/process.json',
    pid: 4242,
    startedAt: '2026-03-12T08:00:00.000Z',
    lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
    heartbeatAgeMs: 10,
    lastError: null
  })),
  getGatewaySessionStorePersistenceStatus: vi.fn(() => ({
    enabled: true,
    filePath: '/tmp/skillsfan/gateway/session-store.json',
    hydrated: true,
    sessionCount: 3,
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
    statusFilePath: '/tmp/skillsfan/gateway/daemon.json',
    lockFilePath: '/tmp/skillsfan/gateway/daemon.lock',
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
  getStepPersistenceStatus: vi.fn(() => ({
    enabled: true,
    dir: '/tmp/skillsfan/host-steps',
    inMemoryTaskCount: 2,
    persistedTaskCount: 2,
    persistedStepCount: 6,
    journalFileCount: 2,
    lastRecoveredTaskId: 'conv-1',
    lastLoadedAt: '2026-03-12T08:00:00.000Z',
    lastPersistedAt: '2026-03-12T08:00:05.000Z',
    lastLoadError: null,
    lastPersistError: null
  })),
  getGatewayLauncherStatus: vi.fn(() => ({
    enabled: true,
    state: 'connected',
    childPid: 5252,
    launchedAt: '2026-03-12T08:00:00.000Z',
    reconnectAttempts: 1,
    reconnectScheduled: false,
    observedExternalProcess: true,
    lastLaunchError: null
  })),
  loadGatewaySnapshot: vi.fn(() => null),
  getRuntime: vi.fn(() => ({
    kind: 'claude-sdk'
  })),
  listRegisteredRuntimeKinds: vi.fn(() => ['claude-sdk']),
  hasRuntime: vi.fn(() => false),
  resolveRuntimeEndpoint: vi.fn(() => ({
    requestedSource: 'openai-codex',
    source: 'openai-codex',
    authMode: 'oauth',
    provider: 'oauth',
    baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
    apiKey: 'token',
    model: 'gpt-5.4',
    apiType: 'responses'
  })),
  getEnabledExtensions: vi.fn(() => [])
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/gateway/server/embedded', () => ({
  getEmbeddedGatewayStatus: mocks.getEmbeddedGatewayStatus
}))

vi.mock('../../../../src/gateway/channels', () => ({
  getGatewayChannelStatus: mocks.getGatewayChannelStatus
}))

vi.mock('../../../../src/gateway/commands', () => ({
  getGatewayCommandRuntimeStatus: mocks.getGatewayCommandRuntimeStatus
}))

vi.mock('../../../../src/gateway/automation', () => ({
  getGatewayAutomationStatus: mocks.getGatewayAutomationStatus
}))

vi.mock('../../../../src/gateway/server/remote', () => ({
  getRemoteAccessStatus: mocks.getRemoteAccessStatus
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    status: {
      getEnvironmentStatus: mocks.getEnvironmentStatus
    }
  }
}))

vi.mock('../../../../src/gateway/host-runtime/step-reporter/runtime', () => ({
  stepReporterRuntime: {
    getPersistenceStatus: mocks.getStepPersistenceStatus
  }
}))

vi.mock('../../../../src/gateway/daemon', () => ({
  getGatewayDaemonStatus: mocks.getGatewayDaemonStatus
}))

vi.mock('../../../../src/gateway/process', () => ({
  getGatewayLauncherStatus: mocks.getGatewayLauncherStatus,
  getGatewayProcessStatus: mocks.getGatewayProcessStatus
}))

vi.mock('../../../../src/gateway/sessions', () => ({
  getGatewaySessionStorePersistenceStatus: mocks.getGatewaySessionStorePersistenceStatus
}))

vi.mock('../../../../src/gateway/server/snapshots', () => ({
  loadGatewaySnapshot: mocks.loadGatewaySnapshot
}))

vi.mock('../../../../src/gateway/runtime/orchestrator', () => ({
  runtimeOrchestrator: {
    getRuntime: mocks.getRuntime,
    listRegisteredRuntimeKinds: mocks.listRegisteredRuntimeKinds,
    hasRuntime: mocks.hasRuntime
  }
}))

vi.mock('../../../../src/main/services/ai-sources/manager', () => ({
  getAISourceManager: () => ({
    resolveRuntimeEndpoint: mocks.resolveRuntimeEndpoint
  })
}))

vi.mock('../../../../src/main/services/extension', () => ({
  getEnabledExtensions: mocks.getEnabledExtensions
}))

import {
  getGatewayHealth,
  listGatewayServices
} from '../../../../src/gateway/server/health'

describe('gateway health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadGatewaySnapshot.mockReturnValue(null)
  })

  it('aggregates gateway, remote, runtime, and host state into a single health snapshot', async () => {
    const health = await getGatewayHealth()

    expect(health.checkedAt).toBeTruthy()
    expect(health.gateway.state).toBe('running')
    expect(health.launcher.state).toBe('connected')
    expect(health.process.state).toBe('embedded-owner')
    expect(health.channels.registeredChannelIds).toEqual(['electron', 'remote-web', 'feishu'])
    expect(health.remote.server.port).toBe(3847)
    expect(health.runtime).toEqual({
      configuredMode: 'native',
      activeKind: 'claude-sdk',
      fallbackActive: true,
      registeredKinds: ['claude-sdk'],
      nativeRegistered: false,
      hybridTaskRouting: true,
      rollout: {
        phase: 'first-batch',
        includedScopes: ['chat-simple', 'browser-simple', 'terminal-simple'],
        excludedScopes: ['skills', 'agent-team', 'long-workflow', 'pdf-text-attachments'],
        simpleTasksCanUseNative: false,
        note: getNativeUserFacingMessage('openAIReady'),
        validation: expect.arrayContaining([
          expect.objectContaining({ id: 'chat-simple' }),
          expect.objectContaining({ id: 'browser-simple' }),
          expect.objectContaining({ id: 'terminal-simple' })
        ]),
        previews: expect.arrayContaining([
          expect.objectContaining({ id: 'chat-simple', selectedKind: 'claude-sdk' }),
          expect.objectContaining({ id: 'skills', selectedKind: 'claude-sdk' })
        ])
      },
      native: {
        scaffolded: true,
        ready: true,
        endpointSupported: true,
        adapterResolved: true,
        adapterStage: 'ready',
        transportResolved: true,
        providerNativeExecution: true,
        sharedToolRegistryReady: true,
        taskRoutingReady: true,
        supportedProviders: ['openai', 'openai-codex'],
        supportedApiTypes: ['responses'],
        availableAdapterIds: ['openai-responses', 'openai-codex-responses'],
        currentSource: 'openai-codex',
        currentProvider: 'oauth',
        currentApiType: 'responses',
        sharedToolProviderIds: ['local-tools', 'web-tools', 'ai-browser', 'skill'],
        nativeToolProviderIds: ['local-tools', 'web-tools', 'ai-browser'],
        adapterId: 'openai-codex-responses',
        transport: {
          adapterId: 'openai-codex-responses',
          endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
          apiType: 'responses',
          defaultTransport: 'auto',
          supportsWebSocket: true,
          websocketWarmup: false,
          storePolicy: 'force-false',
          serverCompactionCapable: false,
          serverCompactionDefault: false,
          authHeaderMode: 'bearer',
          extraHeaderKeys: [],
          note: 'OpenAI Codex Responses uses auto transport, disables warmup by default, and forces store=false.'
        },
        supportsStreaming: true,
        supportsToolCalls: true,
        supportsUsage: true,
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
        note: getNativeUserFacingMessage('codexReady')
      }
    })
    expect(health.automation.loopTasks.recovery.recoveredTaskIds).toEqual(['task-1', 'task-2'])
    expect(health.automation.ralph.taskId).toBe('ralph-1')
    expect(health.host.platform).toBe('darwin')
    expect(health.daemon.manager).toBe('launch-agent')
    expect(health.commands.processedCount).toBe(9)
    expect(health.sessionStore.sessionCount).toBe(3)
    expect(health.stepJournal.persistedStepCount).toBe(6)
    expect(health.services).toEqual([
      expect.objectContaining({ key: 'embedded-gateway', state: 'ready' }),
      expect.objectContaining({ key: 'gateway-daemon', state: 'disabled' }),
      expect.objectContaining({ key: 'gateway-launcher', state: 'external' }),
      expect.objectContaining({ key: 'gateway-process', state: 'ready' }),
      expect.objectContaining({ key: 'command-runtime', state: 'disabled' }),
      expect.objectContaining({ key: 'channel-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'remote-access', state: 'ready' }),
      expect.objectContaining({ key: 'agent-runtime', state: 'degraded' }),
      expect.objectContaining({ key: 'automation-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'host-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'session-store', state: 'ready' }),
      expect.objectContaining({ key: 'step-journal', state: 'ready' })
    ])
  })

  it('lists gateway services from the same aggregated health snapshot', async () => {
    const services = await listGatewayServices()

    expect(services).toHaveLength(12)
    expect(services.map((service) => service.key)).toEqual([
      'embedded-gateway',
      'gateway-daemon',
      'gateway-launcher',
      'gateway-process',
      'command-runtime',
      'channel-runtime',
      'remote-access',
      'agent-runtime',
      'automation-runtime',
      'host-runtime',
      'session-store',
      'step-journal'
    ])
  })

  it('uses external gateway snapshots for shared state while preserving local launcher observation', async () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/skillsfan/gateway/process.json',
      pid: 8888,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:10.000Z',
      heartbeatAgeMs: 100,
      lastError: null
    })
    mocks.loadGatewaySnapshot.mockReturnValue({
      checkedAt: '2026-03-12T08:10:00.000Z',
      gateway: {
        state: 'external',
        mode: 'external',
        featureEnabled: true,
        startedAt: null,
        remoteAccess: {
          enabled: true,
          running: true,
          clients: 5,
          tunnelStatus: 'running'
        }
      },
      launcher: {
        enabled: false,
        state: 'disabled',
        childPid: null,
        launchedAt: null,
        reconnectAttempts: 0,
        reconnectScheduled: false,
        observedExternalProcess: false,
        lastLaunchError: null
      },
      process: {
        configuredMode: 'external',
        state: 'external-observed',
        managedByCurrentProcess: true,
        owner: 'external-gateway',
        filePath: '/tmp/skillsfan/gateway/process.json',
        pid: 8888,
        startedAt: '2026-03-12T08:00:00.000Z',
        lastHeartbeatAt: '2026-03-12T08:00:10.000Z',
        heartbeatAgeMs: 10,
        lastError: null
      },
      daemon: {
        supported: true,
        manager: 'launch-agent',
        state: 'manual-only',
        desiredMode: 'manual',
        installable: true,
        registered: false,
        autoStartEnabled: false,
        statusFilePath: '/tmp/skillsfan/gateway/daemon.json',
        lockFilePath: '/tmp/skillsfan/gateway/daemon.lock',
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
      },
      channels: {
        coreInitialized: true,
        optionalInitialized: true,
        registeredChannelIds: ['electron', 'remote-web'],
        feishu: {
          registered: false,
          enabled: false,
          connected: false,
          botName: null,
          activeSessions: 0
        },
        relay: {
          enabled: true,
          dir: '/tmp/skillsfan/gateway/channel-relay',
          mode: 'publishing',
          consumerActive: false,
          queuedEventCount: 2,
          lastPublishedAt: '2026-03-12T08:09:59.000Z',
          lastConsumedAt: null,
          lastError: null
        }
      },
      commands: {
        initialized: true,
        processRole: 'external-gateway',
        pollIntervalMs: 200,
        pendingCount: 2,
        processingCount: 1,
        processedCount: 14,
        failedCount: 1,
        lastCommandName: 'ralph.start',
        lastCommandAt: '2026-03-12T08:09:59.000Z',
        lastSuccessAt: '2026-03-12T08:09:59.000Z',
        lastFailureAt: '2026-03-12T08:08:00.000Z',
        lastError: null
      },
      remote: {
        enabled: true,
        server: {
          running: true,
          port: 4567,
          token: 'external-token',
          localUrl: 'http://localhost:4567',
          lanUrl: 'http://192.168.0.9:4567'
        },
        tunnel: {
          status: 'running',
          url: 'https://external.example.com',
          error: null
        },
        clients: 5
      },
      runtime: {
        configuredMode: 'native',
        activeKind: 'native',
        fallbackActive: false,
        registeredKinds: ['claude-sdk', 'native'],
        nativeRegistered: true,
        hybridTaskRouting: true,
        rollout: {
          phase: 'first-batch',
          includedScopes: ['chat-simple', 'browser-simple', 'terminal-simple'],
          excludedScopes: ['skills', 'agent-team', 'long-workflow', 'pdf-text-attachments'],
          simpleTasksCanUseNative: true,
          note: 'The new route now takes the first batch of simple tasks first, and anything outside that scope falls back to the existing route.',
          validation: []
        },
        native: {
          scaffolded: true,
          ready: true,
          endpointSupported: true,
          adapterResolved: true,
          adapterStage: 'ready',
          transportResolved: true,
          providerNativeExecution: true,
          sharedToolRegistryReady: true,
          taskRoutingReady: true,
          supportedProviders: ['openai', 'openai-codex'],
          supportedApiTypes: ['responses'],
          availableAdapterIds: ['openai-responses', 'openai-codex-responses'],
          currentSource: 'openai-codex',
          currentProvider: 'oauth',
          currentApiType: 'responses',
          sharedToolProviderIds: ['local-tools', 'web-tools', 'ai-browser', 'skill'],
          nativeToolProviderIds: ['local-tools', 'web-tools', 'ai-browser'],
          adapterId: 'openai-codex-responses',
          transport: {
            adapterId: 'openai-codex-responses',
            endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
            apiType: 'responses',
            defaultTransport: 'auto',
            supportsWebSocket: true,
            websocketWarmup: false,
            storePolicy: 'force-false',
            serverCompactionCapable: false,
            serverCompactionDefault: false,
            authHeaderMode: 'bearer',
            extraHeaderKeys: [],
            note: 'OpenAI Codex Responses uses auto transport, disables warmup by default, and forces store=false.'
          },
          supportsStreaming: true,
          supportsToolCalls: true,
          supportsUsage: true,
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
          note: getNativeUserFacingMessage('codexReady')
        }
      },
      automation: {
        initialized: true,
        ralph: {
          active: false,
          taskId: null,
          status: 'idle',
          currentStoryId: null,
          iteration: 0,
          currentLoop: 0
        },
        subagents: {
          registryLoaded: true,
          totalRuns: 2,
          activeRuns: 1,
          waitingAnnouncementRuns: 0
        },
        loopTasks: {
          scheduledTaskCount: 3,
          activeJobCount: 2,
          pendingRetryCount: 0,
          recovery: {
            attemptedAt: '2026-03-12T08:09:00.000Z',
            recoveredCount: 1,
            recoveredTaskIds: ['task-ext-1']
          }
        }
      },
      host: {
        platform: 'darwin',
        browser: {
          state: 'ready',
          backend: 'automated',
          toolCount: 4
        },
        desktop: {
          state: 'ready',
          backend: 'generic-macos',
          actions: [
            {
              id: 'click',
              supported: true,
              requiresAccessibilityPermission: true,
              blockedByPermission: false
            }
          ],
          adapters: [
            {
              id: 'generic-macos',
              displayName: 'Generic macOS Automation',
              supported: true,
              stage: 'active',
              applicationNames: [],
              actions: ['click']
            }
          ],
          errorCodes: ['permission_denied']
        },
        permissions: {
          accessibility: { state: 'granted' },
          screenRecording: { state: 'granted' }
        }
      },
      sessionStore: {
        enabled: true,
        filePath: '/tmp/skillsfan/gateway/session-store.json',
        hydrated: true,
        sessionCount: 8,
        snapshotSavedAt: '2026-03-12T08:09:00.000Z',
        fileExists: true,
        backupExists: true,
        lastLoadedAt: '2026-03-12T08:00:00.000Z',
        lastSavedAt: '2026-03-12T08:09:00.000Z',
        lastLoadError: null,
        lastSaveError: null
      },
      stepJournal: {
        enabled: true,
        dir: '/tmp/skillsfan/host-steps',
        inMemoryTaskCount: 4,
        persistedTaskCount: 4,
        persistedStepCount: 18,
        journalFileCount: 4,
        lastRecoveredTaskId: 'conv-ext',
        lastLoadedAt: '2026-03-12T08:09:00.000Z',
        lastPersistedAt: '2026-03-12T08:09:30.000Z',
        lastLoadError: null,
        lastPersistError: null
      },
      services: []
    })

    const health = await getGatewayHealth()

    expect(health.checkedAt).toBe('2026-03-12T08:10:00.000Z')
    expect(health.remote.server.port).toBe(4567)
    expect(health.runtime.activeKind).toBe('native')
    expect(health.runtime.nativeRegistered).toBe(true)
    expect(health.runtime.rollout).toEqual(expect.objectContaining({
      phase: 'first-batch',
      simpleTasksCanUseNative: true,
      includedScopes: ['chat-simple', 'browser-simple', 'terminal-simple']
    }))
    expect(health.sessionStore.sessionCount).toBe(8)
    expect(health.stepJournal.persistedStepCount).toBe(18)
    expect(health.commands.processRole).toBe('external-gateway')
    expect(health.launcher.state).toBe('connected')
    expect(health.launcher.enabled).toBe(true)
    expect(health.process.managedByCurrentProcess).toBe(false)
    expect(health.channels.relay.mode).toBe('consuming')
    expect(health.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'gateway-daemon', state: 'disabled' }),
        expect.objectContaining({ key: 'gateway-launcher', state: 'external' }),
        expect.objectContaining({ key: 'gateway-process', state: 'external' }),
        expect.objectContaining({ key: 'command-runtime', state: 'ready' }),
        expect.objectContaining({ key: 'agent-runtime', state: 'ready' }),
        expect.objectContaining({ key: 'step-journal', state: 'ready' })
      ])
    )
  })
})
