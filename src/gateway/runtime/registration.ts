import { getAISourceManager } from '../../main/services/ai-sources/manager'
import { getConfig } from '../../main/services/config.service'
import { resolveConfiguredSharedToolProviders } from '../tools'
import { nativeRuntime, resolveNativeRuntimeStatus, type NativeRuntimeStatus } from './native/runtime'
import type { AgentRuntime, RuntimeKind } from './types'

export interface NativeRuntimeRegistrationState {
  enabled: boolean
  status: NativeRuntimeStatus
}

interface RuntimeRegistrar {
  registerRuntime(runtime: AgentRuntime): void
  unregisterRuntime(kind: RuntimeKind): void
}

function resolveCurrentSharedToolProviders() {
  return resolveConfiguredSharedToolProviders({
    config: getConfig()
  })
}

export function resolveNativeRuntimeRegistrationState(): NativeRuntimeRegistrationState {
  const status = resolveNativeRuntimeStatus({
    endpoint: getAISourceManager().resolveRuntimeEndpoint(),
    sharedToolProviders: resolveCurrentSharedToolProviders()
  })

  return {
    enabled: status.ready,
    status
  }
}

export function syncNativeRuntimeRegistration(registrar: RuntimeRegistrar): NativeRuntimeRegistrationState {
  const state = resolveNativeRuntimeRegistrationState()

  if (state.enabled) {
    registrar.registerRuntime(nativeRuntime)
  } else {
    registrar.unregisterRuntime('native')
  }

  return state
}
