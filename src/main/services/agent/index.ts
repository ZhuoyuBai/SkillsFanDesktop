/**
 * Agent Module - Public API
 *
 * This module provides the AI agent functionality for Halo.
 * It manages V2 Sessions with Claude Code SDK, handles message streaming,
 * tool permissions, and MCP server connections.
 *
 * The public API is designed to match the original agent.service.ts exports
 * for seamless migration.
 *
 * Module Structure:
 * - types.ts          - Type definitions
 * - helpers.ts        - Utility functions
 * - session-manager.ts - V2 Session lifecycle management
 * - mcp-manager.ts    - MCP server status management
 * - permission-handler.ts - Tool permission handling
 * - message-utils.ts  - Message building and parsing
 * - send-message.ts   - Core message sending logic
 * - control.ts        - Generation control (stop, status)
 */

// ============================================
// Type Exports
// ============================================

export type {
  ApiCredentials,
  ImageMediaType,
  ImageAttachment,
  CanvasContext,
  AgentRequest,
  ToolCall,
  ThoughtType,
  Thought,
  SessionState,
  V2SDKSession,
  SessionConfig,
  V2SessionInfo,
  McpServerStatusInfo,
  TokenUsage,
  SingleCallUsage,
  MainWindowRef
} from './types'

// ============================================
// Core Functions
// ============================================

// Send message to agent
export { sendMessage } from '../../../gateway/runtime/orchestrator'

// Generation control
export {
  stopGeneration,
  interruptAndInject,
  isGenerating,
  getActiveSessions,
  getSessionState
} from './control'

// ============================================
// Session Management
// ============================================

export {
  ensureSessionWarm
} from '../../../gateway/runtime/orchestrator'
export { closeV2Session, closeAllV2Sessions, invalidateAllSessions } from './session-manager'

// ============================================
// Permission Handling
// ============================================

export { handleToolApproval, handleUserQuestionAnswer, hasPendingQuestion } from './permission-handler'

// ============================================
// MCP Management
// ============================================

export {
  getCachedMcpStatus,
  testMcpConnections
} from './mcp-manager'

// ============================================
// Re-exports for Internal Use
// ============================================

// These are not part of the public API but may be needed internally
// during the transition period

export { createCanUseTool } from './permission-handler'
export { getWorkingDir, getApiCredentials, sendToRenderer, getMainWindow } from './helpers'
export { parseSDKMessage, buildMessageContent, formatCanvasContext } from './message-utils'
export { getOrCreateV2Session, getV2Session, activeSessions, v2Sessions } from './session-manager'
export { broadcastMcpStatus } from './mcp-manager'
export { agentQueue } from './lane-queue'
export {
  initializeSubagentRuntime,
  shutdownSubagentRuntime,
  spawnSubagent,
  getSubagentRun,
  listSubagentRunsForConversation,
  waitForConversationSubagents,
  waitForSubagentRun,
  killSubagentRun,
  acknowledgeSubagentRuns,
  suppressAutoAnnounceForConversation
} from './subagent/runtime'
