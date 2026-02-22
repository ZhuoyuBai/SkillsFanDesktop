/**
 * Agent Module - SDK Options Builder
 *
 * Shared helpers for:
 * - routing provider credentials to Anthropic-compatible transport
 * - building V2 session sdkOptions consistently across warm-up and send flows
 */

import { ensureOpenAICompatRouter, encodeBackendConfig } from '../../openai-compat-router'
import { AI_BROWSER_SYSTEM_PROMPT } from '../ai-browser/prompt'
import { createSkillMcpServer } from '../skill'
import { createCanUseTool } from './permission-handler'
import { buildSystemPromptAppend, getEnabledMcpServers, inferOpenAIWireApi } from './helpers'
import type { ApiCredentials } from './types'

const DEFAULT_MODEL = 'claude-opus-4-5-20251101'
const ROUTED_MODEL = 'claude-sonnet-4-20250514'
const MAX_THINKING_TOKENS = 10240

export interface ResolvedSdkTransport {
  anthropicBaseUrl: string
  anthropicApiKey: string
  sdkModel: string
  routed: boolean
  apiType?: 'chat_completions' | 'responses'
}

export interface BuildSdkOptionsParams {
  conversationId: string
  spaceId: string
  workDir: string
  config: Record<string, any>
  abortController: AbortController
  sdkModel: string
  credentialsModel: string
  anthropicBaseUrl: string
  anthropicApiKey: string
  electronPath: string
  onStderr: (data: string) => void
  aiBrowserEnabled?: boolean
  thinkingEnabled?: boolean
  includeSkillMcp?: boolean
  ralphSystemPromptAppend?: string
}

/**
 * Resolve provider credentials into Anthropic-compatible runtime transport.
 */
export async function resolveSdkTransport(credentials: ApiCredentials): Promise<ResolvedSdkTransport> {
  let anthropicBaseUrl = credentials.baseUrl
  let anthropicApiKey = credentials.apiKey
  let sdkModel = credentials.model || DEFAULT_MODEL

  if (credentials.provider === 'anthropic') {
    return {
      anthropicBaseUrl,
      anthropicApiKey,
      sdkModel,
      routed: false
    }
  }

  const router = await ensureOpenAICompatRouter({ debug: false })
  anthropicBaseUrl = router.baseUrl

  const apiType = credentials.apiType
    || (credentials.provider === 'oauth' ? 'chat_completions' : inferOpenAIWireApi(credentials.baseUrl))

  anthropicApiKey = encodeBackendConfig({
    url: credentials.baseUrl,
    key: credentials.apiKey,
    model: credentials.model,
    headers: credentials.customHeaders,
    apiType
  })

  // Pass a Claude model to Claude Code SDK even when backend is OpenAI-compatible.
  sdkModel = ROUTED_MODEL

  return {
    anthropicBaseUrl,
    anthropicApiKey,
    sdkModel,
    routed: true,
    apiType
  }
}

/**
 * Build shared sdkOptions for V2 sessions.
 */
export async function buildSdkOptions(params: BuildSdkOptionsParams): Promise<{
  sdkOptions: Record<string, any>
  addedMcpServers: string[]
}> {
  const {
    conversationId,
    spaceId,
    workDir,
    config,
    abortController,
    sdkModel,
    credentialsModel,
    anthropicBaseUrl,
    anthropicApiKey,
    electronPath,
    onStderr,
    aiBrowserEnabled = false,
    thinkingEnabled = false,
    includeSkillMcp = false,
    ralphSystemPromptAppend = ''
  } = params

  const enabledMcp = getEnabledMcpServers(config.mcpServers || {})
  const mcpServers: Record<string, any> = enabledMcp ? { ...enabledMcp } : {}
  const addedMcpServers: string[] = []

  if (aiBrowserEnabled) {
    const { createAIBrowserMcpServer } = await import('../ai-browser/sdk-mcp-server')
    mcpServers['ai-browser'] = createAIBrowserMcpServer()
    addedMcpServers.push('ai-browser')
  }

  if (includeSkillMcp) {
    mcpServers['skill'] = await createSkillMcpServer()
    addedMcpServers.push('skill')
  }

  const sdkOptions: Record<string, any> = {
    model: sdkModel,
    cwd: workDir,
    abortController,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: 1,
      ELECTRON_NO_ATTACH_CONSOLE: 1,
      ANTHROPIC_API_KEY: anthropicApiKey,
      ANTHROPIC_BASE_URL: anthropicBaseUrl,
      // Ensure localhost bypasses proxy
      NO_PROXY: 'localhost,127.0.0.1',
      no_proxy: 'localhost,127.0.0.1',
      // Disable unnecessary API requests
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_COST_WARNINGS: '1'
    },
    extraArgs: {
      'dangerously-skip-permissions': null
    },
    stderr: (data: string) => {
      onStderr(data)
    },
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: buildSystemPromptAppend(workDir, credentialsModel, config.memory?.enabled)
        + (aiBrowserEnabled ? AI_BROWSER_SYSTEM_PROMPT : '')
        + ralphSystemPromptAppend
    },
    maxTurns: 50,
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
    permissionMode: 'acceptEdits' as const,
    canUseTool: createCanUseTool(workDir, spaceId, conversationId),
    includePartialMessages: true,
    executable: electronPath,
    executableArgs: ['--no-warnings'],
    ...(thinkingEnabled ? { maxThinkingTokens: MAX_THINKING_TOKENS } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {})
  }

  return { sdkOptions, addedMcpServers }
}
