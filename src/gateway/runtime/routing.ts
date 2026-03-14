import type { AgentRequest, RuntimeTaskHintTag } from '../../main/services/agent/types'
import type { AISourcesConfig } from '../../shared/types'
import type { HostEnvironmentStatus } from '../../shared/types/host-runtime'
import { getNativeUserFacingMessage } from './native/user-facing'
import type { NativeRuntimeReadinessReasonId } from './native/types'
import { getNativeRolloutTrialSnapshot } from './rollout-trials'
import type {
  NativeRolloutScopeId,
  NativeRolloutTrialResult,
  NativeRolloutValidationBlockerCode,
  NativeRolloutValidationId,
  NativeRolloutValidationState
} from './rollout-types'
import type { RuntimeKind } from './types'
import type { NativeRuntimeRolloutPolicy, RuntimeRouteInfo } from '../../shared/types'

const COMPLEX_TASK_TAGS = new Set<RuntimeTaskHintTag>([
  'skill',
  'subagent',
  'agent-team',
  'ralph',
  'loop-task',
  'automation'
])

const SIMPLE_CHAT_MAX_CHARACTERS = 800
const SIMPLE_CHAT_MAX_LINES = 4
const MULTI_STEP_MESSAGE_PATTERNS = [
  /step by step/i,
  /multiple steps?/i,
  /many steps?/i,
  /\bthen\b/i,
  /\bfinally\b/i,
  /然后再/,
  /接着再/,
  /最后再/,
  /一步一步/,
  /多步/,
  /多个步骤/,
  /依次/
]
const BROWSER_SIMPLE_PATTERNS = [
  /\bchrome\b/i,
  /\bchromium\b/i,
  /\btab\b/i,
  /\burl\b/i,
  /浏览器/,
  /网页/,
  /网站/,
  /标签页/,
  /页面/
]
const TERMINAL_SIMPLE_PATTERNS = [
  /\bterminal\b/i,
  /\biterm2?\b/i,
  /\bcommand\b/i,
  /\bshell\b/i,
  /\bbash\b/i,
  /\bzsh\b/i,
  /\bpwd\b/i,
  /\bls\b/i,
  /终端/,
  /命令/,
  /目录/,
  /文件夹/
]
const FINDER_SIMPLE_PATTERNS = [
  /\bfinder\b/i,
  /打开finder/i,
  /桌面/,
  /文件夹/,
  /目录/,
  /打开目录/,
  /打开文件夹/
]
const SKILLSFAN_SIMPLE_PATTERNS = [
  /\bskillsfan\b/i,
  /技能范/,
  /打开设置/,
  /聚焦主窗口/,
  /回到主窗口/
]

export interface RuntimeSelectionDecision {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  selectedKind: RuntimeKind
  preferredKind: RuntimeKind
  fallbackFrom?: RuntimeKind
  taskComplexity: 'lightweight' | 'complex'
  usedTaskHint: boolean
  reason: string
}

export function describeRuntimeSelectionForUser(
  decision: RuntimeSelectionDecision
): RuntimeRouteInfo {
  if (decision.selectedKind === 'native') {
    return {
      selectedKind: decision.selectedKind,
      preferredKind: decision.preferredKind,
      experience: 'new-route',
      noteId: decision.configuredMode === 'native'
        ? 'new-route-forced'
        : 'new-route-simple-task',
      configuredMode: decision.configuredMode,
      taskComplexity: decision.taskComplexity,
      fallbackFrom: decision.fallbackFrom
    }
  }

  if (decision.configuredMode === 'claude-sdk') {
    return {
      selectedKind: decision.selectedKind,
      preferredKind: decision.preferredKind,
      experience: 'existing-route',
      noteId: 'existing-route-fixed',
      configuredMode: decision.configuredMode,
      taskComplexity: decision.taskComplexity,
      fallbackFrom: decision.fallbackFrom
    }
  }

  if (decision.reason.includes('outside the first native rollout scope')) {
    return {
      selectedKind: decision.selectedKind,
      preferredKind: decision.preferredKind,
      experience: 'existing-route',
      noteId: 'existing-route-outside-scope',
      configuredMode: decision.configuredMode,
      taskComplexity: decision.taskComplexity,
      fallbackFrom: decision.fallbackFrom
    }
  }

  if (decision.taskComplexity === 'complex' || decision.preferredKind === 'claude-sdk') {
    return {
      selectedKind: decision.selectedKind,
      preferredKind: decision.preferredKind,
      experience: 'existing-route',
      noteId: 'existing-route-complex-task',
      configuredMode: decision.configuredMode,
      taskComplexity: decision.taskComplexity,
      fallbackFrom: decision.fallbackFrom
    }
  }

  return {
    selectedKind: decision.selectedKind,
    preferredKind: decision.preferredKind,
    experience: 'existing-route',
    noteId: 'existing-route-not-ready',
    configuredMode: decision.configuredMode,
    taskComplexity: decision.taskComplexity,
    fallbackFrom: decision.fallbackFrom
  }
}

export interface NativeRolloutStatus {
  phase: 'first-batch'
  includedScopes: NativeRolloutScopeId[]
  excludedScopes: NativeRolloutScopeId[]
  simpleTasksCanUseNative: boolean
  note: string
  previews: NativeRolloutPreview[]
  validation: NativeRolloutValidationItem[]
}

export interface NativeRolloutPreview {
  id: NativeRolloutScopeId
  selectedKind: RuntimeKind
  fallbackFrom?: RuntimeKind
  reason: string
}

export interface NativeRolloutValidationItem {
  id: NativeRolloutValidationId
  state: NativeRolloutValidationState
  blockerCodes: NativeRolloutValidationBlockerCode[]
  relatedWorkflowIds: string[]
  relatedSmokeFlowIds: string[]
  latestSmokeState: 'passed' | 'failed' | 'running' | 'missing'
  lastTrial?: NativeRolloutTrialResult | null
}

interface NativeRolloutScopeDecision {
  scopeId?: NativeRolloutScopeId
  included: boolean
  reason: string
}

export interface RuntimeRequestSourceContext {
  sourceId: string | null
  modelId: string | null
}

interface NativeRolloutPolicyDecision {
  allowed: boolean
  reason?: string
}

export const FIRST_NATIVE_ROLLOUT_INCLUDED_SCOPES: NativeRolloutScopeId[] = [
  'chat-simple',
  'browser-simple',
  'terminal-simple',
  'finder-simple',
  'skillsfan-simple'
]

export const FIRST_NATIVE_ROLLOUT_EXCLUDED_SCOPES: NativeRolloutScopeId[] = [
  'skills',
  'agent-team',
  'long-workflow',
  'pdf-text-attachments',
  'provider-model-policy'
]

export function resolveRuntimeRequestSourceContext(args: {
  request?: AgentRequest
  aiSources?: AISourcesConfig
  fallbackModel?: string | null
}): RuntimeRequestSourceContext {
  const sourceId = args.request?.modelSource || args.aiSources?.current || 'custom'
  const sourceConfig = sourceId ? args.aiSources?.[sourceId] : undefined

  const configuredModel =
    args.request?.model
    || (sourceConfig && typeof sourceConfig === 'object' && 'model' in sourceConfig ? sourceConfig.model : null)
    || args.fallbackModel
    || null

  return {
    sourceId,
    modelId: typeof configuredModel === 'string' && configuredModel.trim()
      ? configuredModel
      : null
  }
}

export function resolveRuntimeSelection(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  request?: AgentRequest
  currentSource?: string | null
  currentModel?: string | null
  nativePolicy?: NativeRuntimeRolloutPolicy | null
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  nativeNote?: string | null
}): RuntimeSelectionDecision {
  const taskComplexity = inferTaskComplexity(params.request)
  const rolloutScope = resolveNativeRolloutScope(params.request, {
    currentSource: params.currentSource,
    currentModel: params.currentModel,
    nativePolicy: params.nativePolicy
  })
  const nativeRequestEligible = rolloutScope.included
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
    if (params.hasNativeRuntime && nativeRequestEligible) {
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
      reason: params.hasNativeRuntime
        ? `runtime.mode prefers native, but this request is outside the first native rollout scope (${rolloutScope.reason})`
        : `runtime.mode prefers native, but it is currently held back (${resolveNativeFallbackReason(params.nativeReadinessReasonId, params.nativeNote)})`
    }
  }

  const preferredKind = resolveHybridPreferredRuntime(taskComplexity, preferredRuntime, nativeRequestEligible)

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
      ? taskComplexity === 'complex'
        ? 'hybrid mode routes complex orchestration tasks to claude-sdk'
        : `hybrid mode keeps this request on claude-sdk because it is outside the first native rollout scope (${rolloutScope.reason})`
      : `hybrid mode preferred native, but it is currently held back (${resolveNativeFallbackReason(params.nativeReadinessReasonId, params.nativeNote)})`
  }
}

export function resolveNativeRolloutStatus(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  nativeNote?: string | null
  host?: HostEnvironmentStatus
  currentSource?: string | null
  currentModel?: string | null
  nativePolicy?: NativeRuntimeRolloutPolicy | null
}): NativeRolloutStatus {
  const policyDecision = resolveNativeRolloutPolicyDecision({
    currentSource: params.currentSource,
    currentModel: params.currentModel,
    nativePolicy: params.nativePolicy
  })
  const simpleTasksCanUseNative =
    params.configuredMode !== 'claude-sdk'
    && params.hasNativeRuntime
    && params.nativeReady
    && policyDecision.allowed

  let note: string
  if (params.configuredMode === 'claude-sdk') {
    note = getNativeUserFacingMessage('existingRouteLocked')
  } else if (!policyDecision.allowed) {
    note = getNativeUserFacingMessage('policyHeld', {
      source: params.currentSource || 'current source',
      model: params.currentModel || 'current model'
    })
  } else if (!params.hasNativeRuntime || !params.nativeReady) {
    note = params.nativeNote?.trim() || getNativeUserFacingMessage('outsideScope')
  } else if (params.configuredMode === 'hybrid') {
    note = getNativeUserFacingMessage('hybridRolloutReady')
  } else {
    note = getNativeUserFacingMessage('nativeRolloutReady')
  }

  return {
    phase: 'first-batch',
    includedScopes: [...FIRST_NATIVE_ROLLOUT_INCLUDED_SCOPES],
    excludedScopes: [...FIRST_NATIVE_ROLLOUT_EXCLUDED_SCOPES],
    simpleTasksCanUseNative,
    note,
    previews: resolveNativeRolloutPreviews({
      configuredMode: params.configuredMode,
      hasNativeRuntime: params.hasNativeRuntime,
      currentSource: params.currentSource,
      currentModel: params.currentModel,
      nativePolicy: params.nativePolicy
    }),
    validation: resolveNativeRolloutValidation({
      configuredMode: params.configuredMode,
      hasNativeRuntime: params.hasNativeRuntime,
      nativeReady: params.nativeReady,
      nativeReadinessReasonId: params.nativeReadinessReasonId,
      host: params.host,
      policyDecision
    })
  }
}

function resolveNativeRolloutPreviews(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  currentSource?: string | null
  currentModel?: string | null
  nativePolicy?: NativeRuntimeRolloutPolicy | null
}): NativeRolloutPreview[] {
  const previews: Array<{ id: NativeRolloutScopeId; request: AgentRequest }> = [
    {
      id: 'chat-simple',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-chat',
        message: 'Write a short email reply'
      }
    },
    {
      id: 'browser-simple',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-browser',
        message: 'Open a webpage and check the current tab',
        runtimeTaskHint: {
          complexity: 'lightweight',
          tags: ['browser-automation']
        }
      }
    },
    {
      id: 'terminal-simple',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-terminal',
        message: 'Run pwd and read the result',
        runtimeTaskHint: {
          complexity: 'lightweight',
          tags: ['desktop-automation']
        }
      }
    },
    {
      id: 'finder-simple',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-finder',
        message: 'Open Finder and show the Desktop folder',
        runtimeTaskHint: {
          complexity: 'lightweight',
          tags: ['desktop-automation']
        }
      }
    },
    {
      id: 'skillsfan-simple',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-skillsfan',
        message: 'Open SkillsFan settings',
        runtimeTaskHint: {
          complexity: 'lightweight',
          tags: ['desktop-automation']
        }
      }
    },
    {
      id: 'skills',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-skill',
        message: 'Run a preset skill flow',
        runtimeTaskHint: {
          complexity: 'complex',
          tags: ['skill'],
          requiresClaudeSdkOrchestration: true
        }
      }
    },
    {
      id: 'agent-team',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-agent-team',
        message: 'Split one task across multiple assistants',
        runtimeTaskHint: {
          complexity: 'complex',
          tags: ['agent-team'],
          requiresClaudeSdkOrchestration: true
        }
      }
    },
    {
      id: 'long-workflow',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-workflow',
        message: 'Let the computer handle many steps in a row',
        runtimeTaskHint: {
          complexity: 'complex',
          tags: ['automation'],
          requiresClaudeSdkOrchestration: true
        }
      }
    },
    {
      id: 'pdf-text-attachments',
      request: {
        spaceId: 'preview',
        conversationId: 'preview-pdf',
        message: 'Read a PDF or uploaded notes before continuing',
        attachments: [
          {
            id: 'preview-text',
            type: 'text',
            mediaType: 'text/plain',
            content: 'hello',
            name: 'notes.txt',
            size: 5
          }
        ]
      }
    }
  ]

  return previews.map(({ id, request }) => {
    const decision = resolveRuntimeSelection({
      configuredMode: params.configuredMode,
      hasNativeRuntime: params.hasNativeRuntime,
      request,
      currentSource: params.currentSource,
      currentModel: params.currentModel,
      nativePolicy: params.nativePolicy
    })

    return {
      id,
      selectedKind: decision.selectedKind,
      fallbackFrom: decision.fallbackFrom,
      reason: decision.reason
    }
  })
}

function resolveNativeRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  host?: HostEnvironmentStatus
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem[] {
  return [
    resolveChatRolloutValidation(params),
    resolveBrowserRolloutValidation(params),
    resolveTerminalRolloutValidation(params),
    resolveFinderRolloutValidation(params),
    resolveSkillsFanRolloutValidation(params)
  ]
}

function resolveChatRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem {
  if (params.configuredMode === 'claude-sdk') {
    return {
      id: 'chat-simple',
      state: 'held',
      blockerCodes: ['mode_locked'],
      relatedWorkflowIds: [],
      relatedSmokeFlowIds: [],
      latestSmokeState: 'missing',
      lastTrial: getNativeRolloutTrialSnapshot('chat-simple')
    }
  }

  if (!params.policyDecision.allowed) {
    return {
      id: 'chat-simple',
      state: 'held',
      blockerCodes: ['policy_held'],
      relatedWorkflowIds: [],
      relatedSmokeFlowIds: [],
      latestSmokeState: 'missing',
      lastTrial: getNativeRolloutTrialSnapshot('chat-simple')
    }
  }

  if (!params.hasNativeRuntime || !params.nativeReady) {
    return {
      id: 'chat-simple',
      state: 'blocked',
      blockerCodes: [resolveNativeCompatibilityBlockerCode(params.nativeReadinessReasonId)],
      relatedWorkflowIds: [],
      relatedSmokeFlowIds: [],
      latestSmokeState: 'missing',
      lastTrial: getNativeRolloutTrialSnapshot('chat-simple')
    }
  }

  return {
    id: 'chat-simple',
    state: 'ready',
    blockerCodes: [],
    relatedWorkflowIds: [],
    relatedSmokeFlowIds: [],
    latestSmokeState: 'missing',
    lastTrial: getNativeRolloutTrialSnapshot('chat-simple')
  }
}

function resolveBrowserRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  host?: HostEnvironmentStatus
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem {
  const workflowIds = ['chrome.tab-navigation', 'chrome.tab-observe', 'chrome.tab-cleanup']
  const smokeFlowIds = ['chrome.tab-roundtrip', 'chrome.discovery-roundtrip']

  if (params.configuredMode === 'claude-sdk') {
    return {
      id: 'browser-simple',
      state: 'held',
      blockerCodes: ['mode_locked'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.policyDecision.allowed) {
    return {
      id: 'browser-simple',
      state: 'held',
      blockerCodes: ['policy_held'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.hasNativeRuntime || !params.nativeReady) {
    return {
      id: 'browser-simple',
      state: 'blocked',
      blockerCodes: [resolveNativeCompatibilityBlockerCode(params.nativeReadinessReasonId)],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  return resolveDesktopScopedValidation({
    id: 'browser-simple',
    adapterId: 'chrome',
    requiredWorkflowIds: workflowIds,
    requiredSmokeFlowIds: smokeFlowIds,
    host: params.host
  })
}

function resolveTerminalRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  host?: HostEnvironmentStatus
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem {
  const workflowIds = ['terminal.session-control', 'terminal.run-and-verify']
  const smokeFlowIds = ['terminal.command-roundtrip', 'terminal.session-targeting']

  if (params.configuredMode === 'claude-sdk') {
    return {
      id: 'terminal-simple',
      state: 'held',
      blockerCodes: ['mode_locked'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.policyDecision.allowed) {
    return {
      id: 'terminal-simple',
      state: 'held',
      blockerCodes: ['policy_held'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.hasNativeRuntime || !params.nativeReady) {
    return {
      id: 'terminal-simple',
      state: 'blocked',
      blockerCodes: [resolveNativeCompatibilityBlockerCode(params.nativeReadinessReasonId)],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  return resolveDesktopScopedValidation({
    id: 'terminal-simple',
    adapterId: 'terminal',
    requiredWorkflowIds: workflowIds,
    requiredSmokeFlowIds: smokeFlowIds,
    host: params.host
  })
}

function resolveFinderRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  host?: HostEnvironmentStatus
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem {
  const workflowIds = ['finder.folder-access', 'finder.window-and-search']
  const smokeFlowIds = ['finder.navigation-roundtrip']

  if (params.configuredMode === 'claude-sdk') {
    return {
      id: 'finder-simple',
      state: 'held',
      blockerCodes: ['mode_locked'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.policyDecision.allowed) {
    return {
      id: 'finder-simple',
      state: 'held',
      blockerCodes: ['policy_held'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.hasNativeRuntime || !params.nativeReady) {
    return {
      id: 'finder-simple',
      state: 'blocked',
      blockerCodes: [resolveNativeCompatibilityBlockerCode(params.nativeReadinessReasonId)],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  return resolveDesktopScopedValidation({
    id: 'finder-simple',
    adapterId: 'finder',
    requiredWorkflowIds: workflowIds,
    requiredSmokeFlowIds: smokeFlowIds,
    host: params.host
  })
}

function resolveSkillsFanRolloutValidation(params: {
  configuredMode: 'claude-sdk' | 'hybrid' | 'native'
  hasNativeRuntime: boolean
  nativeReady: boolean
  nativeReadinessReasonId?: NativeRuntimeReadinessReasonId | null
  host?: HostEnvironmentStatus
  policyDecision: NativeRolloutPolicyDecision
}): NativeRolloutValidationItem {
  const workflowIds = ['skillsfan.app-control']
  const smokeFlowIds = ['skillsfan.settings-roundtrip']

  if (params.configuredMode === 'claude-sdk') {
    return {
      id: 'skillsfan-simple',
      state: 'held',
      blockerCodes: ['mode_locked'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.policyDecision.allowed) {
    return {
      id: 'skillsfan-simple',
      state: 'held',
      blockerCodes: ['policy_held'],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  if (!params.hasNativeRuntime || !params.nativeReady) {
    return {
      id: 'skillsfan-simple',
      state: 'blocked',
      blockerCodes: [resolveNativeCompatibilityBlockerCode(params.nativeReadinessReasonId)],
      relatedWorkflowIds: workflowIds,
      relatedSmokeFlowIds: smokeFlowIds,
      latestSmokeState: 'missing'
    }
  }

  return resolveDesktopScopedValidation({
    id: 'skillsfan-simple',
    adapterId: 'skillsfan',
    requiredWorkflowIds: workflowIds,
    requiredSmokeFlowIds: smokeFlowIds,
    host: params.host
  })
}

function resolveDesktopScopedValidation(params: {
  id: NativeRolloutValidationId
  adapterId: string
  requiredWorkflowIds: string[]
  requiredSmokeFlowIds: string[]
  host?: HostEnvironmentStatus
}): NativeRolloutValidationItem {
  const base = {
    id: params.id,
    relatedWorkflowIds: params.requiredWorkflowIds,
    relatedSmokeFlowIds: params.requiredSmokeFlowIds,
    lastTrial: getNativeRolloutTrialSnapshot(params.id)
  }
  const adapter = params.host?.desktop.adapters.find((item) => item.id === params.adapterId)

  if (!params.host || !adapter || !adapter.supported) {
    return {
      ...base,
      state: 'blocked',
      blockerCodes: ['workflow_missing'],
      latestSmokeState: 'missing'
    }
  }

  const relevantWorkflows = (adapter.workflows || []).filter((workflow) =>
    params.requiredWorkflowIds.includes(workflow.id)
  )
  const relevantSmokeFlows = (adapter.smokeFlows || []).filter((smokeFlow) =>
    params.requiredSmokeFlowIds.includes(smokeFlow.id)
  )

  const accessibilityMissing = params.host.permissions.accessibility.state !== 'granted'
    || relevantWorkflows.some((workflow) => workflow.blockedByPermission)
    || relevantSmokeFlows.some((smokeFlow) => smokeFlow.blockedByPermission)

  if (accessibilityMissing) {
    return {
      ...base,
      state: 'blocked',
      blockerCodes: ['permissions_missing'],
      latestSmokeState: resolveLatestSmokeState(relevantSmokeFlows)
    }
  }

  const missingRequiredWorkflow = params.requiredWorkflowIds.some((workflowId) =>
    !relevantWorkflows.some((workflow) => workflow.id === workflowId && workflow.supported && workflow.stage === 'active')
  )

  if (missingRequiredWorkflow) {
    return {
      ...base,
      state: 'blocked',
      blockerCodes: ['workflow_missing'],
      latestSmokeState: resolveLatestSmokeState(relevantSmokeFlows)
    }
  }

  const latestSmokeState = resolveLatestSmokeState(relevantSmokeFlows)
  if (latestSmokeState === 'failed') {
    return {
      ...base,
      state: 'blocked',
      blockerCodes: ['smoke_failed'],
      latestSmokeState
    }
  }

  return {
    ...base,
    state: 'ready',
    blockerCodes: [],
    latestSmokeState
  }
}

function resolveLatestSmokeState(
  smokeFlows: Array<{ lastRun?: { state: 'running' | 'passed' | 'failed' } }>
): 'passed' | 'failed' | 'running' | 'missing' {
  if (smokeFlows.some((smokeFlow) => smokeFlow.lastRun?.state === 'failed')) {
    return 'failed'
  }

  if (smokeFlows.some((smokeFlow) => smokeFlow.lastRun?.state === 'running')) {
    return 'running'
  }

  if (smokeFlows.some((smokeFlow) => smokeFlow.lastRun?.state === 'passed')) {
    return 'passed'
  }

  return 'missing'
}

function resolveHybridPreferredRuntime(
  taskComplexity: 'lightweight' | 'complex',
  preferredRuntime: 'auto' | 'claude-sdk' | 'native' | undefined,
  nativeRequestEligible: boolean
): RuntimeKind {
  if (preferredRuntime === 'claude-sdk') {
    return 'claude-sdk'
  }

  if (preferredRuntime === 'native') {
    return nativeRequestEligible ? 'native' : 'claude-sdk'
  }

  return taskComplexity === 'complex' || !nativeRequestEligible ? 'claude-sdk' : 'native'
}

function resolveNativeFallbackReason(
  readinessReasonId?: NativeRuntimeReadinessReasonId | null,
  nativeNote?: string | null
): string {
  if (nativeNote?.trim()) {
    return nativeNote
  }

  switch (readinessReasonId) {
    case 'no-endpoint':
      return 'no model connection is available yet'
    case 'requires-responses':
      return 'the current model does not support the required request format yet'
    case 'adapter-unavailable':
      return 'the current provider is not connected to the custom handling path yet'
    case 'shared-tools-missing':
      return 'common actions are still preparing on this path'
    default:
      return 'no native runtime is registered'
  }
}

function resolveNativeCompatibilityBlockerCode(
  readinessReasonId?: NativeRuntimeReadinessReasonId | null
): NativeRolloutValidationBlockerCode {
  switch (readinessReasonId) {
    case 'no-endpoint':
      return 'compat_no_endpoint'
    case 'requires-responses':
      return 'compat_requires_responses'
    case 'adapter-unavailable':
      return 'compat_adapter_unavailable'
    case 'shared-tools-missing':
      return 'shared_tools_missing'
    default:
      return 'native_not_ready'
  }
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

function isEligibleForNativeLane(
  request?: AgentRequest,
  context?: {
    currentSource?: string | null
    currentModel?: string | null
    nativePolicy?: NativeRuntimeRolloutPolicy | null
  }
): boolean {
  return resolveNativeRolloutScope(request, context).included
}

function resolveNativeRolloutScope(
  request?: AgentRequest,
  context?: {
    currentSource?: string | null
    currentModel?: string | null
    nativePolicy?: NativeRuntimeRolloutPolicy | null
  }
): NativeRolloutScopeDecision {
  if (!request) {
    const policyDecision = resolveNativeRolloutPolicyDecision({
      currentSource: context?.currentSource,
      currentModel: context?.currentModel,
      nativePolicy: context?.nativePolicy
    })

    return policyDecision.allowed
      ? {
          scopeId: 'chat-simple',
          included: true,
          reason: 'plain chat request'
        }
      : {
          scopeId: 'provider-model-policy',
          included: false,
          reason: policyDecision.reason || 'current source or model is held by the native rollout policy'
        }
  }

  if ((request.attachments || []).some((attachment) => attachment.type === 'pdf' || attachment.type === 'text')) {
    return {
      scopeId: 'pdf-text-attachments',
      included: false,
      reason: 'request includes pdf or text attachments'
    }
  }

  if (
    (request.images || []).length > 0
    || (request.attachments || []).some((attachment) => attachment.type === 'image')
  ) {
    return {
      included: false,
      reason: 'request includes images'
    }
  }

  if (request.aiBrowserEnabled) {
    return {
      scopeId: 'long-workflow',
      included: false,
      reason: 'AI browser flows are not in the first native rollout'
    }
  }

  if (request.messagePrefix || request.resumeSessionId) {
    return {
      scopeId: 'long-workflow',
      included: false,
      reason: 'request is resuming or continuing an existing workflow'
    }
  }

  if (request.runtimeTaskHint?.requiresClaudeSdkOrchestration) {
    if (request.runtimeTaskHint.tags?.includes('skill')) {
      return { scopeId: 'skills', included: false, reason: 'skills stay on claude-sdk during the first rollout' }
    }
    if (request.runtimeTaskHint.tags?.includes('agent-team')) {
      return { scopeId: 'agent-team', included: false, reason: 'agent teams stay on claude-sdk during the first rollout' }
    }
    return {
      scopeId: 'long-workflow',
      included: false,
      reason: 'complex orchestrated workflows stay on claude-sdk during the first rollout'
    }
  }

  if (request.runtimeTaskHint?.tags?.includes('skill')) {
    return { scopeId: 'skills', included: false, reason: 'skills stay on claude-sdk during the first rollout' }
  }

  if (request.runtimeTaskHint?.tags?.includes('agent-team') || request.runtimeTaskHint?.tags?.includes('subagent')) {
    return { scopeId: 'agent-team', included: false, reason: 'multi-agent tasks stay on claude-sdk during the first rollout' }
  }

  if (
    request.runtimeTaskHint?.tags?.includes('ralph')
    || request.runtimeTaskHint?.tags?.includes('loop-task')
    || request.runtimeTaskHint?.tags?.includes('automation')
    || request.ralphMode?.enabled
    || request.internalMessage?.kind === 'subagent_completion'
  ) {
    return {
      scopeId: 'long-workflow',
      included: false,
      reason: 'long-running automation stays on claude-sdk during the first rollout'
    }
  }

  if (!isSimpleMessageShape(request.message)) {
    return {
      included: false,
      reason: 'request has too many steps or too much detail for the first rollout'
    }
  }

  const policyDecision = resolveNativeRolloutPolicyDecision({
    currentSource: context?.currentSource,
    currentModel: context?.currentModel,
    nativePolicy: context?.nativePolicy
  })

  if (!policyDecision.allowed) {
    return {
      scopeId: 'provider-model-policy',
      included: false,
      reason: policyDecision.reason || 'current source or model is held by the native rollout policy'
    }
  }

  const browserTagged = request.runtimeTaskHint?.tags?.includes('browser-automation')
  const desktopTagged = request.runtimeTaskHint?.tags?.includes('desktop-automation')
  const finderMatched = matchesAnyPattern(request.message, FINDER_SIMPLE_PATTERNS)
  const skillsFanMatched = matchesAnyPattern(request.message, SKILLSFAN_SIMPLE_PATTERNS)

  if (browserTagged || matchesAnyPattern(request.message, BROWSER_SIMPLE_PATTERNS)) {
    return {
      scopeId: 'browser-simple',
      included: true,
      reason: 'simple browser task'
    }
  }

  if (matchesAnyPattern(request.message, TERMINAL_SIMPLE_PATTERNS)) {
    return {
      scopeId: 'terminal-simple',
      included: true,
      reason: 'simple terminal task'
    }
  }

  if (finderMatched) {
    return {
      scopeId: 'finder-simple',
      included: true,
      reason: 'simple Finder task'
    }
  }

  if (skillsFanMatched) {
    return {
      scopeId: 'skillsfan-simple',
      included: true,
      reason: 'simple SkillsFan app task'
    }
  }

  if (desktopTagged) {
    return {
      included: false,
      reason: 'desktop automation beyond the first simple Finder, SkillsFan, terminal, and browser tasks stays on claude-sdk during the first rollout'
    }
  }

  return {
    scopeId: 'chat-simple',
    included: true,
    reason: 'simple text chat request'
  }
}

function resolveNativeRolloutPolicyDecision(args: {
  currentSource?: string | null
  currentModel?: string | null
  nativePolicy?: NativeRuntimeRolloutPolicy | null
}): NativeRolloutPolicyDecision {
  const source = normalizePolicyValue(args.currentSource)
  const model = normalizePolicyValue(args.currentModel)
  const policy = args.nativePolicy

  if (!policy) {
    return { allowed: true }
  }

  const sourceAllowlist = normalizePolicyList(policy.sourceAllowlist)
  const sourceBlocklist = normalizePolicyList(policy.sourceBlocklist)

  if (source && sourceBlocklist.includes(source)) {
    return {
      allowed: false,
      reason: `current source "${source}" is held by the native rollout policy`
    }
  }

  if (sourceAllowlist.length > 0 && (!source || !sourceAllowlist.includes(source))) {
    return {
      allowed: false,
      reason: source
        ? `current source "${source}" is not in the native rollout allowlist`
        : 'current source is not in the native rollout allowlist'
    }
  }

  if (!source) {
    return { allowed: true }
  }

  const modelAllowlist = normalizePolicyList(policy.modelAllowlistBySource?.[source])
  const modelBlocklist = normalizePolicyList(policy.modelBlocklistBySource?.[source])

  if (model && modelBlocklist.includes(model)) {
    return {
      allowed: false,
      reason: `current model "${model}" is held by the native rollout policy for source "${source}"`
    }
  }

  if (modelAllowlist.length > 0 && (!model || !modelAllowlist.includes(model))) {
    return {
      allowed: false,
      reason: model
        ? `current model "${model}" is not in the native rollout allowlist for source "${source}"`
        : `current source "${source}" requires an allowlisted model for the native rollout`
    }
  }

  return { allowed: true }
}

function normalizePolicyList(values?: string[] | null): string[] {
  return Array.from(new Set(
    (values || [])
      .map((value) => normalizePolicyValue(value))
      .filter((value): value is string => Boolean(value))
  ))
}

function normalizePolicyValue(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function isSimpleMessageShape(message: string | undefined): boolean {
  const normalized = (message || '').trim()
  if (!normalized) {
    return true
  }

  if (normalized.length > SIMPLE_CHAT_MAX_CHARACTERS) {
    return false
  }

  if (normalized.split(/\n+/).length > SIMPLE_CHAT_MAX_LINES) {
    return false
  }

  return !matchesAnyPattern(normalized, MULTI_STEP_MESSAGE_PATTERNS)
}

function matchesAnyPattern(input: string | undefined, patterns: RegExp[]): boolean {
  const normalized = (input || '').trim()
  if (!normalized) {
    return false
  }

  return patterns.some((pattern) => pattern.test(normalized))
}
