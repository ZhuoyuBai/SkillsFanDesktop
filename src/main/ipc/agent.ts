/**
 * Agent IPC Handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { sendMessage, stopGeneration, interruptAndInject, handleToolApproval, handleUserQuestionAnswer, getSessionState, ensureSessionWarm, testMcpConnections, getV2Session } from '../services/agent'
import type { Attachment, ImageAttachment } from '../services/agent/types'

let mainWindow: BrowserWindow | null = null

export function registerAgentHandlers(window: BrowserWindow | null): void {
  mainWindow = window

  // Send message to agent (with optional images for multi-modal, optional thinking mode)
  ipcMain.handle(
    'agent:send-message',
    async (
      _event,
      request: {
        spaceId: string
        conversationId: string
        message: string
        resumeSessionId?: string
        images?: ImageAttachment[]
        attachments?: Attachment[]
        thinkingEffort?: 'off' | 'low' | 'medium' | 'high'  // Thinking effort level
      }
    ) => {
      try {
        await sendMessage(mainWindow, request)
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Stop generation for a specific conversation (or all if not specified)
  ipcMain.handle('agent:stop', async (_event, conversationId?: string) => {
    try {
      stopGeneration(conversationId)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Inject message during generation (pause current, add user message, continue)
  ipcMain.handle(
    'agent:inject-message',
    async (
      _event,
      request: {
        spaceId: string
        conversationId: string
        message: string
        images?: ImageAttachment[]
        attachments?: Attachment[]
      }
    ) => {
      try {
        await interruptAndInject(mainWindow, request)
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Approve tool execution for a specific conversation
  ipcMain.handle('agent:approve-tool', async (_event, conversationId: string) => {
    try {
      handleToolApproval(conversationId, true)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Reject tool execution for a specific conversation
  ipcMain.handle('agent:reject-tool', async (_event, conversationId: string) => {
    try {
      handleToolApproval(conversationId, false)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Answer user question (AskUserQuestion tool)
  ipcMain.handle('agent:answer-question', async (_event, conversationId: string, answers: Record<string, string>) => {
    try {
      handleUserQuestionAnswer(conversationId, answers)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Get current session state for recovery after refresh
  ipcMain.handle('agent:get-session-state', async (_event, conversationId: string) => {
    try {
      const state = getSessionState(conversationId)
      return { success: true, data: state }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Warm up V2 session - call when switching conversations to prepare for faster message sending
  ipcMain.handle('agent:ensure-session-warm', async (_event, spaceId: string, conversationId: string) => {
    try {
      // Async initialization, non-blocking IPC call
      ensureSessionWarm(spaceId, conversationId).catch((error: unknown) => {
        console.error('[IPC] ensureSessionWarm error:', error)
      })
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Rewind files to a specific user message (undo file changes)
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

  // Test MCP server connections
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
