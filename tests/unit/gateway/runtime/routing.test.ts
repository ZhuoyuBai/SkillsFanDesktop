import { describe, expect, it } from 'vitest'

import { resolveRuntimeSelection } from '../../../../src/gateway/runtime/routing'

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
})
