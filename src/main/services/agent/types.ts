/**
 * Agent Module - Type Definitions
 *
 * Centralized type definitions for the agent module.
 * This file has no dependencies and is imported by all other agent modules.
 */

import { BrowserWindow } from 'electron'

// ============================================
// API Credentials
// ============================================

/**
 * API credentials for agent requests
 * Unified structure for custom API and OAuth sources
 */
export interface ApiCredentials {
  baseUrl: string
  apiKey: string
  model: string
  provider: 'anthropic' | 'openai' | 'oauth'
  /** Custom headers for OAuth providers */
  customHeaders?: Record<string, string>
  /** API type for OpenAI compatible providers */
  apiType?: 'chat_completions' | 'responses'
}

// ============================================
// Image Attachments
// ============================================

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ImageAttachment {
  id: string
  type: 'image'
  mediaType: ImageMediaType
  data: string  // Base64 encoded
  name?: string
  size?: number
}

// ============================================
// PDF & Text Attachments
// ============================================

export interface PdfAttachment {
  id: string
  type: 'pdf'
  mediaType: 'application/pdf'
  data: string  // Base64 encoded
  name: string
  size: number
}

export interface TextAttachment {
  id: string
  type: 'text'
  mediaType: string
  content: string  // Raw text content
  name: string
  size: number
  language?: string
}

export type Attachment = ImageAttachment | PdfAttachment | TextAttachment

// ============================================
// Canvas Context
// ============================================

/**
 * Canvas Context - Injected into messages to provide AI awareness of user's open tabs
 * This allows AI to naturally understand what the user is currently viewing
 */
export interface CanvasContext {
  isOpen: boolean
  tabCount: number
  activeTab: {
    type: string  // 'browser' | 'code' | 'markdown' | 'image' | 'pdf' | 'text' | 'json' | 'csv'
    title: string
    url?: string   // For browser/pdf tabs
    path?: string  // For file tabs
  } | null
  tabs: Array<{
    type: string
    title: string
    url?: string
    path?: string
    isActive: boolean
  }>
}

// ============================================
// Agent Request
// ============================================

/**
 * Ralph mode configuration for autonomous loop tasks
 */
export interface RalphModeConfig {
  enabled: boolean
  projectDir: string                      // Working directory override
  systemPromptAppend?: string             // Custom system prompt append
  onOutput?: (content: string) => void    // Output callback for completion signal detection
  onComplete?: () => void                 // Completion callback
  onError?: (error: string) => void       // Error callback
}

export interface AgentRequest {
  spaceId: string
  conversationId: string
  message: string
  /** Runtime-only instruction prefix injected before message (not persisted to conversation history) */
  messagePrefix?: string
  resumeSessionId?: string
  images?: ImageAttachment[]  // Optional images for multi-modal messages
  attachments?: Attachment[]  // General attachments (PDF, text, code files)
  aiBrowserEnabled?: boolean  // Enable AI Browser tools for this request
  thinkingEnabled?: boolean   // Enable extended thinking mode (maxThinkingTokens: 10240)
  model?: string              // Model to use (for future model switching)
  modelSource?: string        // AI source/provider override (e.g. 'skillsfan-credits', 'deepseek')
  canvasContext?: CanvasContext  // Current canvas state for AI awareness
  ralphMode?: RalphModeConfig    // Ralph autonomous loop mode
}

// ============================================
// Tool Calls
// ============================================

export interface ToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'success' | 'error' | 'waiting_approval'
  input: Record<string, unknown>
  output?: string
  error?: string
  progress?: number
  requiresApproval?: boolean
  description?: string
}

// ============================================
// Thoughts (Agent Reasoning Process)
// ============================================

export type ThoughtType = 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error'

export interface Thought {
  id: string
  type: ThoughtType
  content: string
  timestamp: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  isError?: boolean
  duration?: number
  /** Parent tool ID if this is a child tool call (e.g., TodoWrite inside a Skill) */
  parentToolId?: string
  /** True if this tool is a Skill invocation */
  isSkillInvocation?: boolean
}

// ============================================
// Session State
// ============================================

/**
 * User question info for AskUserQuestion tool
 * Used to pause execution and wait for user's answer
 */
export interface UserQuestionInfo {
  toolId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
  inputResolve: ((answers: Record<string, string>) => void) | null
}

/**
 * Active session state for a conversation
 * Used to track in-flight requests and accumulated thoughts
 */
export interface SessionState {
  abortController: AbortController
  spaceId: string
  conversationId: string
  pendingPermissionResolve: ((approved: boolean) => void) | null
  thoughts: Thought[]  // Backend accumulates thoughts (Single Source of Truth)
  /** Pending user question - pauses execution until answered */
  pendingUserQuestion: UserQuestionInfo | null
  /** Current streaming text content (for inject feature) */
  currentStreamingContent: string
}

// ============================================
// V2 Session Types
// ============================================

/**
 * V2 SDK Session interface
 *
 * Note: SDK types are unstable after patching (return values may not be Promise<...>),
 * using minimal interface for type safety and maintainability, avoiding inference to never.
 */
export type V2SDKSession = {
  send: (message: any) => void
  stream: () => AsyncIterable<any>
  close: () => void
  interrupt?: () => Promise<void> | void
  // Dynamic runtime methods (exposed via patch)
  setModel?: (model: string | undefined) => Promise<void>
  setMaxThinkingTokens?: (maxThinkingTokens: number | null) => Promise<void>
  setPermissionMode?: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => Promise<void>
}

/**
 * Session configuration that requires session rebuild when changed
 * These are "process-level" parameters fixed at Claude Code subprocess startup
 */
export interface SessionConfig {
  aiBrowserEnabled: boolean
  hasSkills: boolean
  // model is now dynamic, no rebuild needed
  // thinkingEnabled is now dynamic, no rebuild needed
}

/**
 * V2 Session info stored in the sessions map
 */
export interface V2SessionInfo {
  session: V2SDKSession
  spaceId: string
  conversationId: string
  createdAt: number
  lastUsedAt: number
  // Track config at session creation time for rebuild detection
  config: SessionConfig
  /** Flag: context was compressed, next message should prompt memory save */
  needsMemoryFlush?: boolean
}

// ============================================
// MCP Types
// ============================================

/**
 * MCP server status type (matches SDK)
 */
export interface McpServerStatusInfo {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending'
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
}

// ============================================
// Token Usage
// ============================================

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  contextWindow: number
}

export interface SingleCallUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

// ============================================
// Renderer Communication
// ============================================

/**
 * Main window reference for IPC communication
 */
export type MainWindowRef = BrowserWindow | null
