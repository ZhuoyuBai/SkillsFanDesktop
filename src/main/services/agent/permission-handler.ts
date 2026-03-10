/**
 * Agent Module - Permission Handler
 *
 * Handles tool permission checks and approval flows.
 * Includes file access restrictions and command execution permissions.
 */

import path from 'path'
import { getConfig } from '../config.service'
import { isAIBrowserTool } from '../ai-browser/tool-utils'
import { activeSessions } from './session-manager'
import { sendToRenderer } from './helpers'
import type { ToolCall, UserQuestionInfo } from './types'
import { sanitizeWebSearchInput } from './tool-input-utils'
import { getEnabledExtensions, runToolUseHooks } from '../extension'

// ============================================
// Tool Permission Types
// ============================================

export type ToolPermissionResult = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  message?: string
}

export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
) => Promise<ToolPermissionResult>

const BLOCKED_SERVER_SIDE_TOOLS = new Set([
  'WebSearch',
  'WebFetch',
  'web_search',
  'web_fetch',
  'code_execution',
  'bash_code_execution',
  'text_editor_code_execution',
  'tool_search_tool_regex',
  'tool_search_tool_bm25',
  'memory'
])

const WEB_RESEARCH_TASK_HINTS = [
  'mcp__web-tools__',
  '联网',
  '网页',
  '在线搜索',
  '上网',
  '抓取',
  '检索',
  '来源链接',
  '引用',
  'citation',
  'citations',
  'source',
  'sources',
  'url',
  'urls',
  'web search',
  'web fetch',
  'internet',
  'online research',
  'online search',
  'fetch'
]

function isWebResearchTask(input: Record<string, unknown>): boolean {
  const fields = [input.description, input.prompt]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.toLowerCase())

  if (fields.length === 0) return false

  const combined = fields.join('\n')
  if (/https?:\/\//i.test(combined)) return true

  return WEB_RESEARCH_TASK_HINTS.some((hint) => combined.includes(hint))
}

function getPathCandidates(input: Record<string, unknown>): string[] {
  const candidates = [
    input.file_path,
    input.path,
    input.notebook_path,
    input.old_path,
    input.new_path
  ]

  return candidates.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

// ============================================
// Permission Handler Factory
// ============================================

/**
 * Create tool permission handler for a specific session
 *
 * This function creates a permission checker that:
 * 1. Restricts file tools to the working directory
 * 2. Handles Bash command permissions based on config
 * 3. Allows AI Browser tools (sandboxed)
 * 4. Defaults to allow for other tools
 */
export function createCanUseTool(
  workDir: string,
  spaceId: string,
  conversationId: string
): CanUseToolFn {
  const absoluteWorkDir = path.resolve(workDir)

  console.log(`[Agent] Creating canUseTool with workDir: ${absoluteWorkDir}`)

  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: { signal: AbortSignal }
  ): Promise<ToolPermissionResult> => {
    console.log(`[Agent] canUseTool called - Tool: ${toolName}, Input:`, JSON.stringify(input).substring(0, 200))

    // Extension hook: let extensions intercept tool calls
    const enabledExtensions = getEnabledExtensions()
    if (enabledExtensions.length > 0) {
      const extResult = await runToolUseHooks(enabledExtensions, toolName, input as Record<string, any>)
      if (extResult.behavior === 'deny') {
        return { behavior: 'deny', message: extResult.message || 'Blocked by extension' }
      }
      if (extResult.updatedInput) {
        input = extResult.updatedInput
      }
    }

    const ensurePathsWithinWorkspace = (): ToolPermissionResult | null => {
      const pathParams = getPathCandidates(input)

      for (const pathParam of pathParams) {
        const absolutePath = path.isAbsolute(pathParam)
          ? path.resolve(pathParam)
          : path.resolve(absoluteWorkDir, pathParam)
        const isWithinWorkDir =
          absolutePath.startsWith(absoluteWorkDir + path.sep) || absolutePath === absoluteWorkDir

        if (!isWithinWorkDir) {
          console.log(`[Agent] Security: Blocked access to: ${pathParam}`)
          return {
            behavior: 'deny' as const,
            message: `Can only access files within the current space: ${workDir}`
          }
        }
      }

      return null
    }

    const requestCommandApproval = async (name: string, description: string): Promise<ToolPermissionResult> => {
      const currentConfig = getConfig()
      const permission = currentConfig.permissions.commandExecution

      if (permission === 'deny') {
        return {
          behavior: 'deny' as const,
          message: 'Command execution is disabled'
        }
      }

      if (permission === 'ask' && !currentConfig.permissions.trustMode) {
        const toolCall: ToolCall = {
          id: `tool-${Date.now()}`,
          name,
          status: 'waiting_approval',
          input,
          requiresApproval: true,
          description
        }

        sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)

        const session = activeSessions.get(conversationId)
        if (!session) {
          return { behavior: 'deny' as const, message: 'Session not found' }
        }
        session.pendingPermissionToolCall = toolCall

        return await new Promise((resolve) => {
          session.pendingPermissionResolve = (approved: boolean) => {
            if (approved) {
              resolve({ behavior: 'allow' as const, updatedInput: input })
            } else {
              resolve({
                behavior: 'deny' as const,
                message: 'User rejected command execution'
              })
            }
          }
        })
      }

      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (toolName === 'mcp__web-tools__WebSearch') {
      const updatedInput = sanitizeWebSearchInput(input)
      return { behavior: 'allow' as const, updatedInput }
    }

    if (toolName === 'mcp__web-tools__WebFetch') {
      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (toolName === 'mcp__local-tools__memory') {
      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (
      toolName === 'mcp__local-tools__tool_search_tool_regex'
      || toolName === 'mcp__local-tools__tool_search_tool_bm25'
    ) {
      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (toolName === 'mcp__local-tools__text_editor_code_execution') {
      const violation = ensurePathsWithinWorkspace()
      if (violation) return violation

      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (toolName === 'mcp__local-tools__open_url') {
      const currentConfig = getConfig()
      if (currentConfig.browserAutomation?.mode !== 'system-browser') {
        return {
          behavior: 'deny' as const,
          message: 'System browser opening is disabled while automated browser mode is active. Use automated browser tools instead.'
        }
      }

      return {
        behavior: 'allow' as const,
        updatedInput: input
      }
    }

    if (toolName === 'mcp__local-tools__bash_code_execution') {
      return await requestCommandApproval(
        toolName,
        `Execute command: ${input.command || 'shell command'}`
      )
    }

    if (toolName === 'mcp__local-tools__code_execution') {
      const language = typeof input.language === 'string' ? input.language : 'code'
      return await requestCommandApproval(
        toolName,
        `Execute ${language} snippet`
      )
    }

    if (toolName === 'mcp__local-tools__open_application') {
      const application = typeof input.application === 'string' ? input.application : 'application'
      return await requestCommandApproval(
        toolName,
        `Open macOS application: ${application}`
      )
    }

    if (toolName === 'mcp__local-tools__run_applescript') {
      return await requestCommandApproval(
        toolName,
        'Execute AppleScript for macOS UI automation'
      )
    }

    if (BLOCKED_SERVER_SIDE_TOOLS.has(toolName)) {
      return {
        behavior: 'deny' as const,
        message: `Built-in server-side tool "${toolName}" is disabled. Use local MCP tools instead.`
      }
    }

    // Check file path tools - restrict to working directory
    const fileTools = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'NotebookEdit']
    if (fileTools.includes(toolName)) {
      const violation = ensurePathsWithinWorkspace()
      if (violation) return violation
    }

    // Check Bash commands based on permission settings
    if (toolName === 'Bash') {
      return await requestCommandApproval(
        toolName,
        `Execute command: ${input.command || 'shell command'}`
      )
    }

    // Task (sub-agent) — requires user approval since it spawns child agents and costs tokens
    if (toolName === 'Task') {
      if (isWebResearchTask(input)) {
        return {
          behavior: 'deny' as const,
          message: 'Web research must run in the primary agent. Use mcp__web-tools__WebSearch/WebFetch directly instead of delegating it to a Task sub-agent.'
        }
      }

      const currentConfig = getConfig()
      const permission = currentConfig.permissions.commandExecution

      if (permission === 'deny') {
        return {
          behavior: 'deny' as const,
          message: 'Sub-agent execution is disabled'
        }
      }

      // trust mode or allow: auto-approve
      if (permission !== 'ask' || currentConfig.permissions.trustMode) {
        return { behavior: 'allow' as const, updatedInput: input }
      }

      // ask mode: send approval request to renderer
      const session = activeSessions.get(conversationId)
      if (!session) {
        return { behavior: 'deny' as const, message: 'Session not found' }
      }

      const toolCall: ToolCall = {
        id: `tool-${Date.now()}`,
        name: toolName,
        status: 'waiting_approval',
        input,
        requiresApproval: true,
        description: `Launch sub-agent: ${(input as Record<string, string>).description || 'task'}`
      }

      sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)
      session.pendingPermissionToolCall = toolCall

      return new Promise((resolve) => {
        session.pendingPermissionResolve = (approved: boolean) => {
          if (approved) {
            resolve({ behavior: 'allow' as const, updatedInput: input })
          } else {
            resolve({
              behavior: 'deny' as const,
              message: 'User rejected sub-agent execution'
            })
          }
        }
      })
    }

    if (isAIBrowserTool(toolName)) {
      const currentConfig = getConfig()
      if (currentConfig.browserAutomation?.mode === 'system-browser') {
        return {
          behavior: 'deny' as const,
          message: 'Automated browser is disabled while "Use System Default Browser" mode is enabled. Use local system browser tools instead.'
        }
      }

      console.log(`[Agent] AI Browser tool allowed: ${toolName}`)
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // Agent Teams + planning tools are always allowed (they coordinate sub-agents internally)
    const teamTools = [
      'TeamCreate', 'TeamDelete', 'SendMessage',
      'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
      'EnterPlanMode', 'EnterWorktree'
    ]
    if (teamTools.includes(toolName)) {
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // Handle AskUserQuestion - pause and wait for user's answer
    if (toolName === 'AskUserQuestion') {
      console.log(`[Agent][${conversationId}] AskUserQuestion tool called, waiting for user input`)

      const session = activeSessions.get(conversationId)
      if (!session) {
        return { behavior: 'deny' as const, message: 'Session not found' }
      }

      const questions = input.questions as UserQuestionInfo['questions'] || []

      // Store question info and send to frontend
      session.pendingUserQuestion = {
        toolId: `question-${Date.now()}`,
        questions,
        inputResolve: null
      }

      sendToRenderer('agent:user-question', spaceId, conversationId, {
        toolId: session.pendingUserQuestion.toolId,
        questions
      })

      // Wait for user's answer
      return new Promise((resolve) => {
        session.pendingUserQuestion!.inputResolve = (answers) => {
          console.log(`[Agent][${conversationId}] User answered AskUserQuestion:`, Object.keys(answers))
          // Clear pending question
          session.pendingUserQuestion = null
          // Return allow with the answers in updatedInput
          // The SDK will pass these answers to the tool execution
          resolve({
            behavior: 'allow' as const,
            updatedInput: { ...input, answers }
          })
        }
      })
    }

    // Default: allow
    return { behavior: 'allow' as const, updatedInput: input }
  }
}

// ============================================
// Tool Approval Handling
// ============================================

/**
 * Handle tool approval from renderer for a specific conversation
 */
export function handleToolApproval(conversationId: string, approved: boolean): void {
  const session = activeSessions.get(conversationId)
  if (session?.pendingPermissionResolve) {
    console.log(`[Agent][${conversationId}] Tool approval received: approved=${approved}`)
    const pendingTool = session.pendingPermissionToolCall
    sendToRenderer('agent:tool-approval-resolved', session.spaceId, conversationId, {
      toolId: pendingTool?.id,
      toolName: pendingTool?.name,
      approved
    })
    session.pendingPermissionResolve(approved)
    session.pendingPermissionResolve = null
    session.pendingPermissionToolCall = null
  } else {
    console.warn(`[Agent][${conversationId}] Tool approval received but no pending permission resolver was found`)
  }
}

// ============================================
// User Question Handling
// ============================================

/**
 * Handle user's answer to AskUserQuestion for a specific conversation
 */
export function handleUserQuestionAnswer(
  conversationId: string,
  answers: Record<string, string>
): void {
  const session = activeSessions.get(conversationId)
  if (session?.pendingUserQuestion?.inputResolve) {
    const spaceId = session.spaceId
    session.pendingUserQuestion.inputResolve(answers)
    // Notify frontend to clear the question UI
    sendToRenderer('agent:user-question-answered', spaceId, conversationId, {})
    // Note: inputResolve will clear pendingUserQuestion after resolving
  } else {
    console.warn(`[Agent][${conversationId}] No pending question to answer`)
  }
}

/**
 * Check if there's a pending question for a conversation
 */
export function hasPendingQuestion(conversationId: string): boolean {
  const session = activeSessions.get(conversationId)
  return session?.pendingUserQuestion !== null
}
