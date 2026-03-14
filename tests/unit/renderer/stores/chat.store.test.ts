import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../../../../src/renderer/stores/chat.store'

describe('chat store host activity', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('deduplicates host steps and clears them when a new run starts', () => {
    useChatStore.getState().handleAgentHostStep({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      taskId: 'conv-1',
      stepId: 'step-1',
      timestamp: 1,
      category: 'browser',
      action: 'browser_snapshot'
    })

    useChatStore.getState().handleAgentHostStep({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      taskId: 'conv-1',
      stepId: 'step-1',
      timestamp: 1,
      category: 'browser',
      action: 'browser_snapshot'
    })

    expect(useChatStore.getState().getSession('conv-1').hostSteps).toHaveLength(1)

    useChatStore.getState().handleAgentStart({
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })

    expect(useChatStore.getState().getSession('conv-1').hostSteps).toEqual([])
  })

  it('stores the selected runtime route when a run starts', () => {
    useChatStore.getState().handleAgentStart({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      runtimeRoute: {
        selectedKind: 'native',
        preferredKind: 'native',
        experience: 'new-route',
        noteId: 'new-route-simple-task',
        configuredMode: 'hybrid',
        taskComplexity: 'lightweight'
      }
    })

    expect(useChatStore.getState().getSession('conv-1').runtimeRoute).toEqual({
      selectedKind: 'native',
      preferredKind: 'native',
      experience: 'new-route',
      noteId: 'new-route-simple-task',
      configuredMode: 'hybrid',
      taskComplexity: 'lightweight'
    })
  })

  it('keeps only the most recent host steps in session state', () => {
    for (let index = 0; index < 30; index += 1) {
      useChatStore.getState().handleAgentHostStep({
        spaceId: 'space-1',
        conversationId: 'conv-1',
        taskId: 'conv-1',
        stepId: `step-${index}`,
        timestamp: index,
        category: 'desktop',
        action: 'open_application'
      })
    }

    const steps = useChatStore.getState().getSession('conv-1').hostSteps
    expect(steps).toHaveLength(24)
    expect(steps[0]?.stepId).toBe('step-6')
    expect(steps[23]?.stepId).toBe('step-29')
  })
})
