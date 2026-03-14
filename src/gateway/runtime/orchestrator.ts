import type { BrowserWindow } from 'electron'
import type { AgentRequest, AgentRouteHint } from '../../main/services/agent/types'
import { getConfig } from '../../main/services/config.service'
import { canDelegateGatewayCommands, executeGatewayCommand } from '../commands'
import { claudeSdkRuntime } from './claude-sdk/runtime'
import { syncNativeRuntimeRegistration } from './registration'
import { resolveRuntimeRequestSourceContext, resolveRuntimeSelection } from './routing'
import { bridgeGatewaySessionFromRequest, bridgeGatewayWarmSession } from './session-bridge'
import type { AgentRuntime, RuntimeKind } from './types'

class RuntimeOrchestrator {
  private runtimeOverride: AgentRuntime | null = null
  private readonly runtimes = new Map<RuntimeKind, AgentRuntime>([
    [claudeSdkRuntime.kind, claudeSdkRuntime]
  ])
  private readonly warnedFallbacks = new Set<string>()

  private getClaudeRuntime(): AgentRuntime {
    const runtime = this.runtimes.get('claude-sdk')
    if (!runtime) {
      throw new Error('Claude SDK runtime is not registered.')
    }
    return runtime
  }

  private warnFallback(mode: 'hybrid' | 'native', reason?: string): void {
    const key = `${mode}:native-missing:${reason || 'default'}`
    if (this.warnedFallbacks.has(key)) {
      return
    }

    this.warnedFallbacks.add(key)
    const suffix = reason ? ` (${reason})` : ''
    console.warn(`[Runtime] runtime.mode="${mode}" is configured, but no native runtime is registered. Falling back to claude-sdk.${suffix}`)
  }

  private resolveRuntimeForRequest(request?: AgentRequest): AgentRuntime {
    const config = getConfig()
    const mode = config.runtime?.mode || 'claude-sdk'
    const claudeRuntime = this.getClaudeRuntime()
    const nativeRegistrationState = syncNativeRuntimeRegistration({
      registerRuntime: (runtime) => this.registerRuntime(runtime),
      unregisterRuntime: (kind) => this.unregisterRuntime(kind)
    })
    const nativeRuntime = this.runtimes.get('native')
    const runtimeRequestSourceContext = resolveRuntimeRequestSourceContext({
      request,
      aiSources: config.aiSources,
      fallbackModel: config.api?.model || null
    })

    const decision = resolveRuntimeSelection({
      configuredMode: mode,
      hasNativeRuntime: Boolean(nativeRuntime),
      request,
      currentSource: runtimeRequestSourceContext.sourceId,
      currentModel: runtimeRequestSourceContext.modelId,
      nativePolicy: config.runtime?.nativeRollout,
      nativeReadinessReasonId: nativeRegistrationState.status.readinessReasonId,
      nativeNote: nativeRegistrationState.status.note
    })

    if (decision.fallbackFrom === 'native') {
      this.warnFallback(mode, decision.reason)
    }

    return decision.selectedKind === 'native' && nativeRuntime
      ? nativeRuntime
      : claudeRuntime
  }

  getRuntime(request?: AgentRequest): AgentRuntime {
    return this.runtimeOverride ?? this.resolveRuntimeForRequest(request)
  }

  hasRuntime(kind: RuntimeKind): boolean {
    return this.runtimes.has(kind)
  }

  listRegisteredRuntimeKinds(): RuntimeKind[] {
    return Array.from(this.runtimes.keys())
  }

  registerRuntime(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.kind, runtime)
    for (const key of Array.from(this.warnedFallbacks)) {
      if (key.startsWith('hybrid:native-missing:') || key.startsWith('native:native-missing:')) {
        this.warnedFallbacks.delete(key)
      }
    }
  }

  unregisterRuntime(kind: RuntimeKind): void {
    if (kind === 'claude-sdk') {
      return
    }

    this.runtimes.delete(kind)
  }

  setRuntimeForTests(runtime: AgentRuntime | null): void {
    this.runtimeOverride = runtime
  }

  resetForTests(): void {
    this.runtimeOverride = null
    this.runtimes.clear()
    this.runtimes.set(claudeSdkRuntime.kind, claudeSdkRuntime)
    this.warnedFallbacks.clear()
  }

  private canDelegateRequest(request: AgentRequest): boolean {
    return !request.internalMessage
  }

  async sendMessage(mainWindow: BrowserWindow | null, request: AgentRequest): Promise<void> {
    bridgeGatewaySessionFromRequest(request)

    if (canDelegateGatewayCommands() && this.canDelegateRequest(request)) {
      await executeGatewayCommand('agent.send-message', {
        request
      })
      return
    }

    await this.getRuntime(request).sendMessage({ mainWindow, request })
  }

  async ensureSessionWarm(
    spaceId: string,
    conversationId: string,
    routeHint?: AgentRouteHint
  ): Promise<void> {
    bridgeGatewayWarmSession(spaceId, conversationId, routeHint)

    if (canDelegateGatewayCommands()) {
      await executeGatewayCommand('agent.ensure-session-warm', {
        spaceId,
        conversationId,
        routeHint
      })
      return
    }

    const runtime = this.getRuntime()
    if (!runtime.ensureSessionWarm) {
      return
    }
    await runtime.ensureSessionWarm({ spaceId, conversationId })
  }
}

export const runtimeOrchestrator = new RuntimeOrchestrator()

export async function sendMessage(
  mainWindow: BrowserWindow | null,
  request: AgentRequest
): Promise<void> {
  await runtimeOrchestrator.sendMessage(mainWindow, request)
}

export async function ensureSessionWarm(
  spaceId: string,
  conversationId: string,
  routeHint?: AgentRouteHint
): Promise<void> {
  await runtimeOrchestrator.ensureSessionWarm(spaceId, conversationId, routeHint)
}
