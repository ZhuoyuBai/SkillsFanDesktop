/**
 * Extension Module - Lightweight plugin system
 *
 * Extensions can modify system prompts, intercept tool calls,
 * process messages, and provide MCP servers.
 *
 * Extensions are loaded from ~/.skillsfan/extensions/
 */

export {
  initializeExtensions,
  getEnabledExtensions,
  getAllExtensionStatuses,
  setExtensionEnabled,
  reloadExtensions,
  getExtensionHash,
  shutdownExtensions
} from './registry'

export {
  runSystemPromptHooks,
  runToolUseHooks,
  runBeforeSendMessageHooks,
  runGetMcpServersHooks,
  runHook
} from './hook-runner'

export type {
  ExtensionHooks,
  ExtensionManifest,
  ExtensionStatus,
  LoadedExtension,
  ToolInterceptResult,
  SystemPromptContext,
  MessageContext,
  MessageResult,
  ExtensionMcpServerConfig
} from './types'
