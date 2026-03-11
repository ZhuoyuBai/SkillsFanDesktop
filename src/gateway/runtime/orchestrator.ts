import type { BrowserWindow } from 'electron'
import type { AgentRequest } from '../../main/services/agent/types'
import { getConfig } from '../../main/services/config.service'
import { claudeSdkRuntime } from './claude-sdk/runtime'
import type { AgentRuntime } from './types'

class RuntimeOrchestrator {
  private runtimeOverride: AgentRuntime | null = null

  private resolveConfiguredRuntime(): AgentRuntime {
    const mode = getConfig().runtime?.mode || 'claude-sdk'

    switch (mode) {
      case 'claude-sdk':
      case 'hybrid':
      case 'native':
      default:
        return claudeSdkRuntime
    }
  }

  getRuntime(): AgentRuntime {
    return this.runtimeOverride ?? this.resolveConfiguredRuntime()
  }

  setRuntimeForTests(runtime: AgentRuntime | null): void {
    this.runtimeOverride = runtime
  }

  async sendMessage(mainWindow: BrowserWindow | null, request: AgentRequest): Promise<void> {
    await this.getRuntime().sendMessage({ mainWindow, request })
  }

  async ensureSessionWarm(spaceId: string, conversationId: string): Promise<void> {
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
  conversationId: string
): Promise<void> {
  await runtimeOrchestrator.ensureSessionWarm(spaceId, conversationId)
}
