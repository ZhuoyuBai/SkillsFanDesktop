/**
 * Agent Module - SDK Options Builder
 *
 * Shared helpers for:
 * - routing provider credentials to Anthropic-compatible transport
 * - building V2 session sdkOptions consistently across warm-up and send flows
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { ensureOpenAICompatRouter, encodeBackendConfig } from '../../openai-compat-router'
import { AI_BROWSER_SYSTEM_PROMPT } from '../ai-browser/prompt'
import { createSkillMcpServer } from '../skill'
import { createCanUseTool } from './permission-handler'
import { buildSystemPromptAppend, getEnabledMcpServers, inferOpenAIWireApi } from './helpers'
import { getEnabledExtensions, runSystemPromptHooks, runGetMcpServersHooks } from '../extension'
import type { ApiCredentials } from './types'
import { resolveBrowserAutomationConfig } from '@shared/types/browser-automation'

const DEFAULT_MODEL = 'claude-opus-4-5-20251101'
const ROUTED_MODEL = 'claude-sonnet-4-20250514'
const MAX_THINKING_TOKENS = 10240
const SYSTEM_BROWSER_AUTOMATION_PROMPT = `

## System Browser Mode

The user wants browser tasks to use the system default browser instead of the built-in browser.
When browser automation is needed:
1. Do not use \`mcp__ai-browser__*\` tools.
2. Prefer \`mcp__local-tools__open_url\` to open the page in the user's normal browser.
3. On macOS, \`mcp__local-tools__open_application\` can be used only when the user explicitly wants a specific browser app.
4. On macOS, do not use \`mcp__local-tools__run_applescript\` unless the user explicitly asks for system-level UI automation after the browser is open.
5. Avoid opening any additional built-in browser window unless the user explicitly asks for it.
`

const AI_BROWSER_PREFERENCE_PROMPT = `

## Browser Preference

When browser automation is needed in this conversation, prefer the built-in browser tools from MCP server \`ai-browser\`.
Avoid opening a separate system browser unless the user explicitly asks for it or the built-in browser tools are unavailable.
`

const DISALLOWED_SERVER_SIDE_TOOLS_BASE = [
  'code_execution',
  'bash_code_execution',
  'text_editor_code_execution',
  'tool_search_tool_regex',
  'tool_search_tool_bm25',
  'memory'
]

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
  includeSubagentTools?: boolean
  ralphSystemPromptAppend?: string
  /** Whether the API goes through the OpenAI-compat router (non-Anthropic backend) */
  routed?: boolean
}

export type SkillToolMode = 'none' | 'mcp' | 'native'

export function resolveSkillToolMode(
  config: Record<string, any>,
  options: { skillsAvailable: boolean; routed?: boolean }
): SkillToolMode {
  if (!options.skillsAvailable) {
    return 'none'
  }

  return config.skillSettings?.preferNativeClaudeSkillTool === true
    ? 'native'
    : 'mcp'
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
    includeSubagentTools = true,
    ralphSystemPromptAppend = '',
    routed = false
  } = params

  const browserAutomation = resolveBrowserAutomationConfig(config)
  const browserAutomationEnabled = browserAutomation.enabled
  const browserAutomationMode = browserAutomation.mode
  const effectiveAiBrowserEnabled = aiBrowserEnabled && browserAutomationEnabled && browserAutomationMode === 'ai-browser'
  const skillToolMode = resolveSkillToolMode(config, {
    skillsAvailable: includeSkillMcp,
    routed
  })
  const effectiveIncludeSkillMcp = skillToolMode === 'mcp'

  // Load custom agent definitions from .claude/agents/*.md
  const agents = loadAgentDefinitions(workDir)

  // Collect additional directories from config
  const additionalDirectories: string[] = config.additionalDirectories || []

  const enabledMcp = getEnabledMcpServers(config.mcpServers || {})
  const mcpServers: Record<string, any> = enabledMcp ? { ...enabledMcp } : {}
  const addedMcpServers: string[] = []

  if ((!browserAutomationEnabled || browserAutomationMode !== 'ai-browser') && mcpServers['ai-browser']) {
    delete mcpServers['ai-browser']
  }

  const { createLocalToolsMcpServer } = await import('../local-tools/sdk-mcp-server')
  mcpServers['local-tools'] = createLocalToolsMcpServer({
    workDir,
    spaceId,
    conversationId,
    aiBrowserEnabled: effectiveAiBrowserEnabled,
    browserAutomationEnabled,
    browserAutomationMode,
    includeSkillMcp: effectiveIncludeSkillMcp,
    includeSubagentTools
  })
  addedMcpServers.push('local-tools')

  if (effectiveIncludeSkillMcp) {
    mcpServers['skill'] = await createSkillMcpServer()
    addedMcpServers.push('skill')
  }

  if (effectiveAiBrowserEnabled) {
    const { createAutomatedBrowserMcpServer } = await import('../automated-browser/sdk-mcp-server')
    mcpServers['ai-browser'] = createAutomatedBrowserMcpServer()
    addedMcpServers.push('ai-browser')
  }

  // Extension MCP servers
  const enabledExtensions = getEnabledExtensions()
  if (enabledExtensions.length > 0) {
    const extensionMcpServers = await runGetMcpServersHooks(enabledExtensions)
    for (const [name, config] of Object.entries(extensionMcpServers)) {
      mcpServers[name] = config
      addedMcpServers.push(name)
    }
  }

  const disallowedTools = [...DISALLOWED_SERVER_SIDE_TOOLS_BASE]

  if (effectiveIncludeSkillMcp && !disallowedTools.includes('Skill')) {
    // Prefer the app-managed MCP skill loader over Claude Code's native Skill tool.
    // This keeps skill invocation consistent across non-Claude backends.
    disallowedTools.push('Skill')
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
      DISABLE_COST_WARNINGS: '1',
      // Enable Agent Teams (experimental feature)
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
    },
    stderr: (data: string) => {
      onStderr(data)
    },
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: buildSystemPromptAppend(workDir, credentialsModel, config.memory?.enabled)
        + (effectiveAiBrowserEnabled ? AI_BROWSER_SYSTEM_PROMPT + AI_BROWSER_PREFERENCE_PROMPT : '')
        + (browserAutomationEnabled && browserAutomationMode === 'system-browser' ? SYSTEM_BROWSER_AUTOMATION_PROMPT : '')
        + ralphSystemPromptAppend
        + (config.customInstructions?.enabled && config.customInstructions?.content
          ? `\n\n## User Custom Instructions\n\n${config.customInstructions.content}\n`
          : '')
        + (enabledExtensions.length > 0
          ? await runSystemPromptHooks(enabledExtensions, { spaceId, conversationId, workDir })
          : '')
    },
    maxTurns: 50,
    disallowedTools,
    permissionMode: 'acceptEdits' as const,
    canUseTool: createCanUseTool(workDir, spaceId, conversationId),
    includePartialMessages: true,
    executable: electronPath,
    executableArgs: ['--no-warnings'],
    // Enable Claude Code native hooks system
    // CLI will read hooks from ~/.claude/settings.json and .claude/settings.json
    hooks: true,
    // Enable file checkpointing for rewind support
    enableFileCheckpointing: true,
    ...(thinkingEnabled ? { thinking: { type: 'enabled' as const, budgetTokens: MAX_THINKING_TOKENS } } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    ...(agents ? { agents } : {}),
    ...(additionalDirectories.length > 0 ? { additionalDirectories } : {}),
    ...(config.maxBudgetUsd ? { maxBudgetUsd: config.maxBudgetUsd } : {})
  }

  return { sdkOptions, addedMcpServers }
}

/**
 * Load custom agent definitions from .claude/agents/*.md
 */
function loadAgentDefinitions(workDir: string): Record<string, any> | undefined {
  const agentsDir = join(workDir, '.claude', 'agents')
  if (!existsSync(agentsDir)) return undefined

  try {
    const agents: Record<string, any> = {}
    for (const file of readdirSync(agentsDir)) {
      if (!file.endsWith('.md')) continue
      const name = file.replace('.md', '')
      const content = readFileSync(join(agentsDir, file), 'utf-8')
      agents[name] = {
        description: `Custom agent: ${name}`,
        prompt: content,
        model: 'inherit'
      }
    }
    if (Object.keys(agents).length > 0) {
      console.log(`[Agent] Loaded ${Object.keys(agents).length} custom agent(s):`, Object.keys(agents).join(', '))
      return agents
    }
  } catch (e) {
    console.error('[Agent] Failed to load agent definitions:', e)
  }
  return undefined
}
