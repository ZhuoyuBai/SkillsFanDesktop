import { describe, expect, it } from 'vitest'
import { buildGatewayServiceRegistry } from '../../../../src/gateway/server/services'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('gateway service registry', () => {
  it('marks the runtime as degraded when native mode falls back to claude-sdk', () => {
    const services = buildGatewayServiceRegistry({
      gateway: {
        state: 'running',
        mode: 'embedded',
        featureEnabled: true,
        startedAt: '2026-03-11T08:00:00.000Z',
        remoteAccess: {
          enabled: false,
          running: false,
          clients: 0,
          tunnelStatus: 'stopped'
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
      daemon: {
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
      },
      process: {
        configuredMode: 'embedded',
        state: 'embedded-owner',
        managedByCurrentProcess: true,
        owner: 'electron-main',
        filePath: '/tmp/gateway/process.json',
        pid: 4242,
        startedAt: '2026-03-12T08:00:00.000Z',
        lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
        heartbeatAgeMs: 25,
        lastError: null
      },
      channels: {
        coreInitialized: true,
        optionalInitialized: false,
        registeredChannelIds: ['electron', 'remote-web'],
        feishu: {
          registered: false,
          enabled: false,
          connected: false,
          activeSessions: 0
        },
        relay: {
          enabled: true,
          dir: '/tmp/gateway/channel-relay',
          mode: 'inactive',
          consumerActive: false,
          queuedEventCount: 0,
          lastPublishedAt: null,
          lastConsumedAt: null,
          lastError: null
        }
      },
      commands: {
        initialized: false,
        processRole: 'desktop-app',
        pollIntervalMs: 200,
        pendingCount: 0,
        processingCount: 0,
        processedCount: 0,
        failedCount: 0,
        lastCommandName: null,
        lastCommandAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null
      },
      remote: {
        enabled: false,
        server: {
          running: false,
          port: 0,
          token: null,
          localUrl: null,
          lanUrl: null
        },
        tunnel: {
          status: 'stopped',
          url: null,
          error: null
        },
        clients: 0
      },
      runtime: {
        configuredMode: 'native',
        activeKind: 'claude-sdk',
        fallbackActive: true,
        registeredKinds: ['claude-sdk'],
        nativeRegistered: false,
        hybridTaskRouting: true,
        rollout: {
          phase: 'first-batch',
          includedScopes: ['chat-simple', 'browser-simple', 'terminal-simple', 'finder-simple', 'skillsfan-simple'],
          excludedScopes: ['skills', 'agent-team', 'long-workflow', 'pdf-text-attachments', 'provider-model-policy'],
          simpleTasksCanUseNative: false,
          note: 'The existing route is still the only route in use, so the new route is not taking over yet.',
          validation: []
        },
        native: {
          scaffolded: true,
          ready: false,
          readinessReasonId: 'no-endpoint',
          endpointSupported: false,
          adapterResolved: false,
          adapterStage: null,
          transportResolved: false,
          providerNativeExecution: false,
          sharedToolRegistryReady: true,
          taskRoutingReady: true,
          supportedProviders: ['anthropic', 'openai', 'openai-codex'],
          supportedApiTypes: ['messages', 'responses'],
          availableAdapterIds: ['anthropic-messages', 'openai-responses', 'openai-codex-responses'],
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
      automation: {
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
      },
      host: {
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
              actions: ['press_key'],
              methods: []
            },
            {
              id: 'finder',
              displayName: 'Finder Adapter',
              supported: false,
              stage: 'planned',
              applicationNames: ['Finder'],
              actions: ['press_key'],
              methods: [
                {
                  id: 'finder.reveal_path',
                  action: 'run_applescript',
                  supported: true,
                  stage: 'active'
                },
                {
                  id: 'finder.open_folder',
                  action: 'open_application',
                  supported: true,
                  stage: 'active'
                }
              ]
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
        filePath: '/tmp/gateway/session-store.json',
        hydrated: true,
        sessionCount: 2,
        snapshotSavedAt: '2026-03-12T08:00:05.000Z',
        fileExists: true,
        backupExists: true,
        lastLoadedAt: '2026-03-12T08:00:00.000Z',
        lastSavedAt: '2026-03-12T08:00:05.000Z',
        lastLoadError: null,
        lastSaveError: null
      },
      stepJournal: {
        enabled: true,
        dir: '/tmp/host-steps',
        inMemoryTaskCount: 2,
        persistedTaskCount: 2,
        persistedStepCount: 8,
        journalFileCount: 2,
        lastRecoveredTaskId: 'conv-1',
        lastLoadedAt: '2026-03-12T08:00:00.000Z',
        lastPersistedAt: '2026-03-12T08:00:05.000Z',
        lastLoadError: null,
        lastPersistError: null
      }
    })

    expect(services).toEqual([
      expect.objectContaining({ key: 'embedded-gateway', state: 'ready' }),
      expect.objectContaining({ key: 'gateway-daemon', state: 'disabled' }),
      expect.objectContaining({ key: 'gateway-launcher', state: 'disabled' }),
      expect.objectContaining({ key: 'gateway-process', state: 'ready' }),
      expect.objectContaining({ key: 'command-runtime', state: 'disabled' }),
      expect.objectContaining({ key: 'channel-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'remote-access', state: 'disabled' }),
      expect.objectContaining({ key: 'agent-runtime', state: 'degraded' }),
      expect.objectContaining({ key: 'automation-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'host-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'session-store', state: 'ready' }),
      expect.objectContaining({ key: 'step-journal', state: 'ready' })
    ])
    expect(services.find((service) => service.key === 'host-runtime')).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        desktopActiveMethodIds: ['finder.reveal_path', 'finder.open_folder'],
        desktopScaffoldedMethodIds: [],
        desktopPlannedMethodIds: [],
        desktopActiveWorkflowIds: [],
        desktopPlannedWorkflowIds: [],
        desktopBlockedWorkflowIds: [],
        desktopActiveSmokeFlowIds: [],
        desktopBlockedSmokeFlowIds: [],
        desktopRunningSmokeFlowIds: [],
        desktopPassedSmokeFlowIds: [],
        desktopFailedSmokeFlowIds: []
      })
    }))
    expect(services.find((service) => service.key === 'agent-runtime')).toEqual(expect.objectContaining({
      summary: 'The existing route is still the only route in use, so the new route is not taking over yet.',
      metadata: expect.objectContaining({
        rollout: expect.objectContaining({
          phase: 'first-batch',
          simpleTasksCanUseNative: false
        })
      })
    }))
  })

  it('marks the gateway as external and host as degraded when permissions are missing', () => {
    const services = buildGatewayServiceRegistry({
      gateway: {
        state: 'external',
        mode: 'external',
        featureEnabled: true,
        startedAt: null,
        remoteAccess: {
          enabled: false,
          running: false,
          clients: 0,
          tunnelStatus: 'stopped'
        }
      },
      launcher: {
        enabled: true,
        state: 'connected',
        childPid: 8888,
        launchedAt: '2026-03-12T08:00:00.000Z',
        reconnectAttempts: 1,
        reconnectScheduled: false,
        observedExternalProcess: true,
        lastLaunchError: null
      },
      daemon: {
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
      },
      process: {
        configuredMode: 'external',
        state: 'awaiting-external',
        managedByCurrentProcess: false,
        owner: null,
        filePath: '/tmp/gateway/process.json',
        pid: null,
        startedAt: null,
        lastHeartbeatAt: null,
        heartbeatAgeMs: null,
        lastError: null
      },
      channels: {
        coreInitialized: true,
        optionalInitialized: true,
        registeredChannelIds: ['electron', 'remote-web', 'feishu'],
        feishu: {
          registered: true,
          enabled: true,
          connected: true,
          activeSessions: 1
        },
        relay: {
          enabled: true,
          dir: '/tmp/gateway/channel-relay',
          mode: 'consuming',
          consumerActive: true,
          queuedEventCount: 0,
          lastPublishedAt: '2026-03-12T08:00:04.000Z',
          lastConsumedAt: '2026-03-12T08:00:05.000Z',
          lastError: null
        }
      },
      commands: {
        initialized: true,
        processRole: 'external-gateway',
        pollIntervalMs: 200,
        pendingCount: 1,
        processingCount: 0,
        processedCount: 12,
        failedCount: 1,
        lastCommandName: 'loop-task.create',
        lastCommandAt: '2026-03-12T08:00:03.000Z',
        lastSuccessAt: '2026-03-12T08:00:03.000Z',
        lastFailureAt: '2026-03-12T07:59:50.000Z',
        lastError: null
      },
      remote: {
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
        clients: 1
      },
      runtime: {
        configuredMode: 'claude-sdk',
        activeKind: 'claude-sdk',
        fallbackActive: false,
        registeredKinds: ['claude-sdk', 'native'],
        nativeRegistered: true,
        hybridTaskRouting: true,
        native: {
          scaffolded: true,
          ready: false,
          readinessReasonId: 'no-endpoint',
          endpointSupported: false,
          adapterResolved: false,
          adapterStage: null,
          transportResolved: false,
          providerNativeExecution: false,
          sharedToolRegistryReady: true,
          taskRoutingReady: true,
          supportedProviders: ['anthropic', 'openai', 'openai-codex'],
          supportedApiTypes: ['messages', 'responses'],
          availableAdapterIds: ['anthropic-messages', 'openai-responses', 'openai-codex-responses'],
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
      automation: {
        initialized: false,
        ralph: {
          active: false,
          taskId: null,
          status: null,
          currentStoryId: null,
          iteration: 0,
          currentLoop: 0
        },
        subagents: {
          registryLoaded: false,
          totalRuns: 0,
          activeRuns: 0,
          waitingAnnouncementRuns: 0
        },
        loopTasks: {
          scheduledTaskCount: 0,
          activeJobCount: 0,
          pendingRetryCount: 0,
          recovery: {
            attemptedAt: null,
            recoveredCount: 0,
            recoveredTaskIds: []
          }
        }
      },
      host: {
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
              blockedByPermission: true
            }
          ],
          adapters: [
            {
              id: 'generic-macos',
              displayName: 'Generic macOS Automation',
              supported: true,
              stage: 'active',
              applicationNames: [],
              actions: ['press_key']
            },
            {
              id: 'finder',
              displayName: 'Finder Adapter',
              supported: false,
              stage: 'planned',
              applicationNames: ['Finder'],
              actions: ['press_key']
            }
          ],
          errorCodes: ['permission_denied']
        },
        permissions: {
          accessibility: { state: 'needs_permission' },
          screenRecording: { state: 'granted' }
        }
      },
      sessionStore: {
        enabled: false,
        filePath: null,
        hydrated: false,
        sessionCount: 0,
        snapshotSavedAt: null,
        fileExists: false,
        backupExists: false,
        lastLoadedAt: null,
        lastSavedAt: null,
        lastLoadError: null,
        lastSaveError: null
      },
      stepJournal: {
        enabled: false,
        dir: null,
        inMemoryTaskCount: 0,
        persistedTaskCount: 0,
        persistedStepCount: 0,
        journalFileCount: 0,
        lastRecoveredTaskId: null,
        lastLoadedAt: null,
        lastPersistedAt: null,
        lastLoadError: null,
        lastPersistError: null
      }
    })

    expect(services).toEqual([
      expect.objectContaining({ key: 'embedded-gateway', state: 'external' }),
      expect.objectContaining({ key: 'gateway-daemon', state: 'disabled' }),
      expect.objectContaining({ key: 'gateway-launcher', state: 'external' }),
      expect.objectContaining({ key: 'gateway-process', state: 'degraded' }),
      expect.objectContaining({ key: 'command-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'channel-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'remote-access', state: 'ready' }),
      expect.objectContaining({ key: 'agent-runtime', state: 'ready' }),
      expect.objectContaining({ key: 'automation-runtime', state: 'disabled' }),
      expect.objectContaining({ key: 'host-runtime', state: 'degraded' }),
      expect.objectContaining({ key: 'session-store', state: 'disabled' }),
      expect.objectContaining({ key: 'step-journal', state: 'disabled' })
    ])
  })
})
