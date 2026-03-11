import type { BrowserWindow } from 'electron'
import type { AgentRequest } from '../../main/services/agent/types'

export type RuntimeKind = 'claude-sdk' | 'native'

export interface RuntimeSendMessageInput {
  mainWindow: BrowserWindow | null
  request: AgentRequest
}

export interface RuntimeWarmSessionInput {
  spaceId: string
  conversationId: string
}

export interface AgentRuntime {
  kind: RuntimeKind
  sendMessage(input: RuntimeSendMessageInput): Promise<void>
  ensureSessionWarm?(input: RuntimeWarmSessionInput): Promise<void>
}
