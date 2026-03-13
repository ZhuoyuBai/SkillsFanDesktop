import type { AgentRequest, RuntimeTaskHintTag } from '../../main/services/agent/types'
import type { RuntimeKind } from './types'

const COMPLEX_TASK_TAGS = new Set<RuntimeTaskHintTag>([
  'skill',
  'subagent',
  'agent-team',
  'ralph',
  'loop-task',
  'automation'
])

export interface RuntimeSelectionDecision {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  selectedKind: RuntimeKind
  preferredKind: RuntimeKind
  fallbackFrom?: RuntimeKind
  taskComplexity: 'lightweight' | 'complex'
  usedTaskHint: boolean
  reason: string
}

export function resolveRuntimeSelection(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  request?: AgentRequest
}): RuntimeSelectionDecision {
  const taskComplexity = inferTaskComplexity(params.request)
  const preferredRuntime = params.request?.runtimeTaskHint?.preferredRuntime
  const usedTaskHint = Boolean(params.request?.runtimeTaskHint)

  if (params.configuredMode === 'claude-sdk') {
    return {
      configuredMode: params.configuredMode,
      selectedKind: 'claude-sdk',
      preferredKind: 'claude-sdk',
      taskComplexity,
      usedTaskHint,
      reason: 'runtime.mode forces claude-sdk'
    }
  }

  if (params.configuredMode === 'native') {
    if (params.hasNativeRuntime) {
      return {
        configuredMode: params.configuredMode,
        selectedKind: 'native',
        preferredKind: 'native',
        taskComplexity,
        usedTaskHint,
        reason: 'runtime.mode forces native'
      }
    }

    return {
      configuredMode: params.configuredMode,
      selectedKind: 'claude-sdk',
      preferredKind: 'native',
      fallbackFrom: 'native',
      taskComplexity,
      usedTaskHint,
      reason: 'runtime.mode prefers native, but no native runtime is registered'
    }
  }

  const preferredKind = resolveHybridPreferredRuntime(taskComplexity, preferredRuntime)

  if (preferredKind === 'native' && params.hasNativeRuntime) {
    return {
      configuredMode: params.configuredMode,
      selectedKind: 'native',
      preferredKind,
      taskComplexity,
      usedTaskHint,
      reason: preferredRuntime === 'native'
        ? 'runtimeTaskHint explicitly prefers native in hybrid mode'
        : 'hybrid mode routes lightweight tasks to native when available'
    }
  }

  return {
    configuredMode: params.configuredMode,
    selectedKind: 'claude-sdk',
    preferredKind,
    fallbackFrom: preferredKind === 'native' && !params.hasNativeRuntime ? 'native' : undefined,
    taskComplexity,
    usedTaskHint,
    reason: preferredKind === 'claude-sdk'
      ? 'hybrid mode routes complex orchestration tasks to claude-sdk'
      : 'hybrid mode preferred native, but no native runtime is registered'
  }
}

function resolveHybridPreferredRuntime(
  taskComplexity: 'lightweight' | 'complex',
  preferredRuntime?: 'auto' | 'claude-sdk' | 'native'
): RuntimeKind {
  if (preferredRuntime === 'claude-sdk') {
    return 'claude-sdk'
  }

  if (preferredRuntime === 'native') {
    return 'native'
  }

  return taskComplexity === 'complex' ? 'claude-sdk' : 'native'
}

function inferTaskComplexity(request?: AgentRequest): 'lightweight' | 'complex' {
  if (!request) return 'lightweight'

  if (request.runtimeTaskHint?.complexity) {
    return request.runtimeTaskHint.complexity
  }

  if (request.runtimeTaskHint?.requiresClaudeSdkOrchestration) {
    return 'complex'
  }

  if (request.runtimeTaskHint?.tags?.some((tag) => COMPLEX_TASK_TAGS.has(tag))) {
    return 'complex'
  }

  if (request.ralphMode?.enabled) {
    return 'complex'
  }

  if (request.internalMessage?.kind === 'subagent_completion') {
    return 'complex'
  }

  return 'lightweight'
}
