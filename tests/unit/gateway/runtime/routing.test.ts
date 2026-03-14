import { describe, expect, it } from 'vitest'

import {
  describeRuntimeSelectionForUser,
  resolveNativeRolloutStatus,
  resolveRuntimeSelection
} from '../../../../src/gateway/runtime/routing'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('runtime routing', () => {
  it('routes lightweight hybrid tasks to native when available', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'hello'
      } as any
    })).toMatchObject({
      selectedKind: 'native',
      preferredKind: 'native',
      taskComplexity: 'lightweight'
    })
  })

  it('keeps image requests on claude-sdk during the first native rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Describe this screenshot',
        images: [
          {
            id: 'img-1',
            type: 'image',
            mediaType: 'image/png',
            data: 'Zm9v'
          }
        ]
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk'
    })
  })

  it('keeps ai browser requests on claude-sdk during the first native rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Use the AI browser to inspect this website',
        aiBrowserEnabled: true
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk'
    })
  })

  it('keeps long multi-step requests on claude-sdk during the first native rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'First open the website, then summarize the page, then compare it with my notes, and finally draft a reply.'
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk'
    })
  })

  it('routes complex hybrid tasks to claude-sdk', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'run ralph flow',
        ralphMode: {
          enabled: true,
          projectDir: '/tmp/project'
        }
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk',
      taskComplexity: 'complex'
    })
  })

  it('honors explicit native task hints in hybrid mode', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'simple task',
        runtimeTaskHint: {
          preferredRuntime: 'native'
        }
      } as any
    })).toMatchObject({
      selectedKind: 'native',
      preferredKind: 'native',
      usedTaskHint: true
    })
  })

  it('falls back to claude-sdk when hybrid prefers native but native is unavailable', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: false,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'simple task'
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'native',
      fallbackFrom: 'native'
    })
  })

  it('keeps non-terminal desktop automation on claude-sdk during the first rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Click the main window button',
        runtimeTaskHint: {
          complexity: 'lightweight',
          tags: ['desktop-automation']
        }
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk'
    })
  })

  it('keeps simple terminal requests on native during the first rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Run pwd in Terminal and read the result'
      } as any
    })).toMatchObject({
      selectedKind: 'native',
      preferredKind: 'native'
    })
  })

  it('keeps pdf and text attachment requests on claude-sdk during the first native rollout', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Summarize these files',
        attachments: [
          {
            id: 'pdf-1',
            type: 'pdf',
            mediaType: 'application/pdf',
            data: 'Zm9v',
            name: 'spec.pdf',
            size: 3
          }
        ]
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk',
      taskComplexity: 'lightweight'
    })
  })

  it('falls back to claude-sdk in native mode when the request is outside the first native rollout scope', () => {
    expect(resolveRuntimeSelection({
      configuredMode: 'native',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Read these notes',
        attachments: [
          {
            id: 'txt-1',
            type: 'text',
            mediaType: 'text/plain',
            content: 'hello',
            name: 'notes.txt',
            size: 5
          }
        ]
      } as any
    })).toMatchObject({
      selectedKind: 'claude-sdk',
      preferredKind: 'native',
      fallbackFrom: 'native'
    })
  })

  it('maps lightweight native routing to a user-facing new-route note', () => {
    const decision = resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'hello'
      } as any
    })

    expect(describeRuntimeSelectionForUser(decision)).toEqual(expect.objectContaining({
      selectedKind: 'native',
      experience: 'new-route',
      noteId: 'new-route-simple-task'
    }))
  })

  it('maps complex hybrid routing to a user-facing existing-route note', () => {
    const decision = resolveRuntimeSelection({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'run ralph flow',
        ralphMode: {
          enabled: true,
          projectDir: '/tmp/project'
        }
      } as any
    })

    expect(describeRuntimeSelectionForUser(decision)).toEqual(expect.objectContaining({
      selectedKind: 'claude-sdk',
      experience: 'existing-route',
      noteId: 'existing-route-complex-task'
    }))
  })

  it('describes the first native rollout in hybrid mode when simple tasks are ready', () => {
    expect(resolveNativeRolloutStatus({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      nativeReady: true,
      nativeNote: getNativeUserFacingMessage('openAIReady')
    })).toEqual(expect.objectContaining({
      phase: 'first-batch',
      includedScopes: ['chat-simple', 'browser-simple', 'terminal-simple'],
      excludedScopes: ['skills', 'agent-team', 'long-workflow', 'pdf-text-attachments'],
      simpleTasksCanUseNative: true,
      note: getNativeUserFacingMessage('hybridRolloutReady')
    }))
  })

  it('reports first-batch validation states for chat, browser, and terminal tasks', () => {
    const rollout = resolveNativeRolloutStatus({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      nativeReady: true,
      nativeNote: getNativeUserFacingMessage('openAIReady'),
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
          actions: [],
          adapters: [
            {
              id: 'chrome',
              supported: true,
              stage: 'active',
              workflows: [
                { id: 'chrome.tab-navigation', supported: true, stage: 'active', methodIds: [] },
                { id: 'chrome.tab-observe', supported: true, stage: 'active', methodIds: [] },
                { id: 'chrome.tab-cleanup', supported: true, stage: 'active', methodIds: [] }
              ],
              smokeFlows: [
                { id: 'chrome.tab-roundtrip', supported: true, stage: 'active', methodIds: [], lastRun: { state: 'passed', startedAt: '2026-03-13T10:00:00.000Z', summary: 'ok' } },
                { id: 'chrome.discovery-roundtrip', supported: true, stage: 'active', methodIds: [], lastRun: { state: 'passed', startedAt: '2026-03-13T10:00:00.000Z', summary: 'ok' } }
              ],
              errorCodes: []
            } as any,
            {
              id: 'terminal',
              supported: true,
              stage: 'active',
              workflows: [
                { id: 'terminal.session-control', supported: true, stage: 'active', methodIds: [] },
                { id: 'terminal.run-and-verify', supported: true, stage: 'active', methodIds: [] }
              ],
              smokeFlows: [
                { id: 'terminal.command-roundtrip', supported: true, stage: 'active', methodIds: [], lastRun: { state: 'passed', startedAt: '2026-03-13T10:00:00.000Z', summary: 'ok' } },
                { id: 'terminal.session-targeting', supported: true, stage: 'active', methodIds: [], lastRun: { state: 'passed', startedAt: '2026-03-13T10:00:00.000Z', summary: 'ok' } }
              ],
              errorCodes: []
            } as any
          ],
          errorCodes: []
        },
        permissions: {
          accessibility: { state: 'granted' },
          screenRecording: { state: 'granted' }
        }
      } as any
    })

    expect(rollout.validation).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'chat-simple', state: 'ready' }),
      expect.objectContaining({ id: 'browser-simple', state: 'ready', latestSmokeState: 'passed' }),
      expect.objectContaining({ id: 'terminal-simple', state: 'ready', latestSmokeState: 'passed' })
    ]))
  })

  it('keeps the rollout note user-facing when native is not ready yet', () => {
    expect(resolveNativeRolloutStatus({
      configuredMode: 'hybrid',
      hasNativeRuntime: false,
      nativeReady: false,
      nativeNote: getNativeUserFacingMessage('outsideScope')
    })).toEqual(expect.objectContaining({
      simpleTasksCanUseNative: false,
      note: getNativeUserFacingMessage('outsideScope')
    }))
  })

  it('previews which sample tasks currently use native or stay on claude-sdk', () => {
    const rollout = resolveNativeRolloutStatus({
      configuredMode: 'hybrid',
      hasNativeRuntime: true,
      nativeReady: true,
      nativeNote: getNativeUserFacingMessage('openAIReady')
    })

    expect(rollout.previews).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'chat-simple', selectedKind: 'native' }),
      expect.objectContaining({ id: 'browser-simple', selectedKind: 'native' }),
      expect.objectContaining({ id: 'terminal-simple', selectedKind: 'native' }),
      expect.objectContaining({ id: 'skills', selectedKind: 'claude-sdk' }),
      expect.objectContaining({ id: 'agent-team', selectedKind: 'claude-sdk' }),
      expect.objectContaining({ id: 'long-workflow', selectedKind: 'claude-sdk' }),
      expect.objectContaining({ id: 'pdf-text-attachments', selectedKind: 'claude-sdk' })
    ]))
  })
})
