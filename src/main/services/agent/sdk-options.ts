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

  // Load custom agent definitions from .claude/agents/*.md
  const agents = loadAgentDefinitions(workDir)

  // Collect additional directories from config
  const additionalDirectories: string[] = config.additionalDirectories || []

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
      DISABLE_COST_WARNINGS: '1',
      // Enable Agent Teams (experimental feature)
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
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
    allowedTools: [
      // Core file tools
      'Read', 'Write', 'Edit', 'Grep', 'Glob',
      // Execution
      'Bash',
      // Web access — let Claude search and fetch from the internet
      'WebFetch', 'WebSearch',
      // Task management — let Claude create visual task checklists
      'TodoWrite', 'TaskOutput',
      // Notebook — let Claude edit Jupyter notebooks
      'NotebookEdit',
      // Sub-agent — parallel task execution (permission via canUseTool)
      'Task',
      // User interaction — let Claude ask clarifying questions
      'AskUserQuestion',
      // Agent Teams — multi-agent coordination
      'TeamCreate', 'TeamDelete', 'SendMessage',
      'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
      // Planning and isolation
      'EnterPlanMode', 'EnterWorktree',
    ],
    permissionMode: 'acceptEdits' as const,
    canUseTool: createCanUseTool(workDir, spaceId, conversationId),
    includePartialMessages: true,
    executable: electronPath,
    executableArgs: ['--no-warnings'],
    // Enable Claude Code native hooks system
    // CLI will read hooks from ~/.claude/settings.json and .claude/settings.json
    hooks: true,
    // Load user-level and project-level Claude Code settings
    settingSources: ['user', 'project'],
    // Enable file checkpointing for rewind support
    enableFileCheckpointing: true,
    ...(thinkingEnabled ? { maxThinkingTokens: MAX_THINKING_TOKENS } : {}),
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
