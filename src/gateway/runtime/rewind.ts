import { canDelegateGatewayCommands, executeGatewayCommand } from '../commands'
import { getV2Session } from '../../main/services/agent/session-manager'

export interface GatewayRewindFilesResult {
  success: boolean
  error?: string
}

export async function rewindGatewayFilesLocally(
  conversationId: string,
  userMessageUuid: string
): Promise<GatewayRewindFilesResult> {
  const sessionInfo = getV2Session(conversationId)
  if (!sessionInfo) {
    return { success: false, error: 'No active session for this conversation' }
  }

  if (!sessionInfo.session.rewindFiles) {
    return { success: false, error: 'Rewind not supported by current SDK session' }
  }

  try {
    await sessionInfo.session.rewindFiles(userMessageUuid)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function rewindGatewayFiles(
  conversationId: string,
  userMessageUuid: string
): Promise<GatewayRewindFilesResult> {
  if (canDelegateGatewayCommands()) {
    try {
      return await executeGatewayCommand('agent.rewind-files', {
        conversationId,
        userMessageUuid
      })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return await rewindGatewayFilesLocally(conversationId, userMessageUuid)
}
