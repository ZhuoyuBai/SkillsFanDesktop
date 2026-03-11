/**
 * Agent IPC Handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { sendMessage, stopGeneration, interruptAndInject, handleToolApproval, handleUserQuestionAnswer, getSessionState, ensureSessionWarm, testMcpConnections, getV2Session, killSubagentRun, getSubagentRun } from '../services/agent'
import type { Attachment, ImageAttachment } from '../services/agent/types'
import type { ThinkingEffort } from '../../shared/utils/openai-models'
import { ipcHandle } from './utils'

let mainWindow: BrowserWindow | null = null

export function registerAgentHandlers(window: BrowserWindow | null): void {
  mainWindow = window

  ipcHandle('agent:send-message',
    async (_e, request: {
      spaceId: string
      conversationId: string
      message: string
      resumeSessionId?: string
      images?: ImageAttachment[]
      attachments?: Attachment[]
      thinkingEffort?: ThinkingEffort
    }) => {
      await sendMessage(mainWindow, request)
    }
  )

  ipcHandle('agent:stop', (_e, conversationId?: string) => {
    stopGeneration(conversationId)
  })

  ipcHandle('agent:inject-message',
    async (_e, request: {
      spaceId: string
      conversationId: string
      message: string
      images?: ImageAttachment[]
      attachments?: Attachment[]
    }) => {
      await interruptAndInject(mainWindow, request)
    }
  )

  ipcHandle('agent:approve-tool', (_e, conversationId: string) => {
    handleToolApproval(conversationId, true)
  })

  ipcHandle('agent:reject-tool', (_e, conversationId: string) => {
    handleToolApproval(conversationId, false)
  })

  ipcHandle('agent:answer-question', (_e, conversationId: string, answers: Record<string, string>) => {
    handleUserQuestionAnswer(conversationId, answers)
  })

  ipcHandle('agent:get-session-state', (_e, conversationId: string) =>
    getSessionState(conversationId)
  )

  ipcHandle('agent:get-host-status', async () => {
    const { hostRuntime } = await import('../../gateway/host-runtime')
    return hostRuntime.status.getEnvironmentStatus()
  })

  // Warm up V2 session - non-blocking, fire-and-forget
  ipcHandle('agent:ensure-session-warm', (_e, spaceId: string, conversationId: string) => {
    ensureSessionWarm(spaceId, conversationId).catch((error: unknown) => {
      console.error('[IPC] ensureSessionWarm error:', error)
    })
  })

  // Kill a hosted subagent run
  ipcHandle('agent:kill-subagent', (_e, runId: string) => {
    return killSubagentRun(runId)
  })

  // Get detailed info for a hosted subagent run
  ipcHandle('agent:get-subagent-detail', (_e, runId: string) => {
    return getSubagentRun(runId)
  })

  // Rewind files - has custom error handling with logging, keep ipcMain.handle
  ipcMain.handle('agent:rewind-files', async (_event, conversationId: string, userMessageUuid: string) => {
    console.log(`[IPC] agent:rewind-files called: conversationId=${conversationId}, uuid=${userMessageUuid}`)
    try {
      const sessionInfo = getV2Session(conversationId)
      if (!sessionInfo) {
        console.log('[IPC] agent:rewind-files: No active session found')
        return { success: false, error: 'No active session for this conversation' }
      }
      if (!sessionInfo.session.rewindFiles) {
        console.log('[IPC] agent:rewind-files: rewindFiles method not available on session')
        return { success: false, error: 'Rewind not supported by current SDK session' }
      }
      console.log(`[IPC] agent:rewind-files: Calling session.rewindFiles(${userMessageUuid})...`)
      await sessionInfo.session.rewindFiles(userMessageUuid)
      console.log('[IPC] agent:rewind-files: Success')
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[IPC] agent:rewind-files: Error:', err.message, err.stack)
      return { success: false, error: err.message }
    }
  })

  // Test MCP - returns custom shape with servers array
  ipcMain.handle('agent:test-mcp', async () => {
    try {
      const result = await testMcpConnections(mainWindow)
      return result
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, servers: [], error: err.message }
    }
  })
}
