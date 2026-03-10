/**
 * Extension System - Type Definitions
 *
 * Defines the extension interface and hook types for the lightweight
 * plugin system. Extensions can modify system prompts, intercept tool
 * calls, process messages, and provide MCP servers.
 */

/**
 * Tool interception result from an extension's onBeforeToolUse hook.
 */
export interface ToolInterceptResult {
  /** 'allow' to pass through, 'deny' to block the tool call */
  behavior: 'allow' | 'deny'
  /** Optional message shown when tool is denied */
  message?: string
  /** Optional modified input to pass to the tool (only for 'allow') */
  updatedInput?: Record<string, any>
}

/**
 * Context provided to system prompt hooks
 */
export interface SystemPromptContext {
  spaceId: string
  conversationId: string
  workDir: string
}

/**
 * Context provided to message hooks
 */
export interface MessageContext {
  spaceId: string
  conversationId: string
  workDir: string
}

/**
 * Result information provided to afterMessage hooks
 */
export interface MessageResult {
  spaceId: string
  conversationId: string
  content: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    contextWindow: number
  }
}

/**
 * MCP server configuration (matches existing config format)
 */
export interface ExtensionMcpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Extension hook definitions
 */
export interface ExtensionHooks {
  /** Called when building system prompt - return string to append */
  onBuildSystemPrompt?: (context: SystemPromptContext) => string | undefined | Promise<string | undefined>

  /** Called before a tool is executed - can allow or deny */
  onBeforeToolUse?: (toolName: string, input: Record<string, any>) => ToolInterceptResult | Promise<ToolInterceptResult>

  /** Called before sending a message to the AI - can modify message text */
  onBeforeSendMessage?: (message: string, context: MessageContext) => string | Promise<string>

  /** Called after AI completes a response */
  onAfterMessage?: (result: MessageResult) => void | Promise<void>

  /** Return additional MCP server configs to include */
  getMcpServers?: () => Record<string, ExtensionMcpServerConfig> | Promise<Record<string, ExtensionMcpServerConfig>>
}

/**
 * Extension metadata from extension.json
 */
export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  main?: string  // Entry point file, default 'index.js'
}

/**
 * Loaded extension instance
 */
export interface LoadedExtension {
  manifest: ExtensionManifest
  hooks: ExtensionHooks
  enabled: boolean
  loadedAt: number
  directory: string
  error?: string  // Last error if any
}

/**
 * Extension status for IPC/UI
 */
export interface ExtensionStatus {
  id: string
  name: string
  version: string
  description?: string
  enabled: boolean
  error?: string
  directory: string
}
