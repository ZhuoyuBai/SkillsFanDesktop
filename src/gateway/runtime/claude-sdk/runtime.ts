import { sendMessage as sendClaudeSdkMessage } from '../../../main/services/agent/send-message'
import { ensureSessionWarm as warmClaudeSdkSession } from '../../../main/services/agent/session-manager'
import type { AgentRuntime } from '../types'

export const claudeSdkRuntime: AgentRuntime = {
  kind: 'claude-sdk',

  async sendMessage({ mainWindow, request }) {
    await sendClaudeSdkMessage(mainWindow, request)
  },

  async ensureSessionWarm({ spaceId, conversationId }) {
    await warmClaudeSdkSession(spaceId, conversationId)
  }
}
