import { z } from 'zod'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { hostRuntime } from '../../../gateway/host-runtime'
import { buildToolCatalog } from '../../../gateway/tools'
import {
  executeDesktopAdapterMethod,
  maybeExecuteOpenApplicationAdapterMethod
} from '../../../gateway/host-runtime/desktop/adapters/executor'
import { resolveDesktopAppAdapter } from '../../../gateway/host-runtime/desktop/adapters/registry'
import { recordToolExecutionStep } from '../../../gateway/host-runtime/step-reporter/tool-reporting'
import type { DesktopHostAction } from '../../../gateway/host-runtime/types'
import type { StepArtifactRef } from '../../../shared/types/host-runtime'
import { executeCodeSnippet, executeShellCommand } from './code-execution'
import {
  getMacOSAutomationErrorCode,
  type MacOSAutomationErrorCode,
  type MacOSAutomationResult
} from './macos-ui'
import { executeMemoryCommand } from './memory-tool'
import { executeTextEditorCommand } from './text-editor'
import { searchToolsByBm25, searchToolsByRegex } from './tool-search'

function toToolText(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

function formatDesktopErrorCode(errorCode?: MacOSAutomationErrorCode): string {
  return errorCode ? ` (${errorCode})` : ''
}

function describeDesktopAutomationFailure(result: MacOSAutomationResult): {
  errorCode?: MacOSAutomationErrorCode
  detail: string
} {
  return {
    errorCode: result.errorCode,
    detail: result.errorMessage || result.stderr || result.stdout || 'Unknown error'
  }
}

function describeDesktopAutomationException(error: unknown): {
  errorCode?: MacOSAutomationErrorCode
  detail: string
} {
  return {
    errorCode: getMacOSAutomationErrorCode(error),
    detail: (error as Error).message
  }
}

function truncateDesktopInput(value: string, maxLength = 120): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

const terminalApplicationSchema = z.enum(['Terminal', 'iTerm', 'iTerm2'])
const terminalSplitDirectionSchema = z.enum(['horizontal', 'vertical'])
const terminalTargetSchema = {
  windowIndex: z.number().int().min(1).optional().describe('Terminal window index to target (1-based, optional)'),
  tabIndex: z.number().int().min(1).optional().describe('Terminal tab index within the selected window (1-based, optional)'),
  sessionIndex: z.number().int().min(1).optional().describe('Terminal session index within the selected tab (1-based, optional; Terminal only supports 1)'),
  paneIndex: z.number().int().min(1).optional().describe('iTerm pane index within the selected tab (1-based, optional; aliases sessionIndex for iTerm/iTerm2)')
}

function pickTerminalTargetMetadata(args: {
  windowIndex?: number
  tabIndex?: number
  sessionIndex?: number
  paneIndex?: number
}): Record<string, number | undefined> {
  return {
    windowIndex: args.windowIndex,
    tabIndex: args.tabIndex,
    sessionIndex: args.sessionIndex,
    paneIndex: args.paneIndex
  }
}

function pickTerminalRecoveryMetadata(record: Record<string, unknown>): Record<string, unknown> {
  const recoverySuggestions = Array.isArray(record.recoverySuggestions)
    ? record.recoverySuggestions.filter((item): item is string => typeof item === 'string')
    : []

  return {
    completionState: record.completionState,
    recoveryHint: record.recoveryHint,
    recoverySuggestionCount: recoverySuggestions.length
  }
}

function formatTerminalRecoverySuffix(record: Record<string, unknown>): string {
  const recoveryHint = typeof record.recoveryHint === 'string' ? record.recoveryHint.trim() : ''
  const recoverySuggestions = Array.isArray(record.recoverySuggestions)
    ? record.recoverySuggestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  const segments: string[] = []
  if (recoveryHint) {
    segments.push(`Recovery: ${recoveryHint}`)
  }
  if (recoverySuggestions[0]) {
    segments.push(`Next: ${recoverySuggestions[0]}`)
  }

  return segments.length > 0 ? ` ${segments.join(' ')}` : ''
}

interface DesktopPreflightFailure {
  errorCode: MacOSAutomationErrorCode
  detail: string
  metadata: Record<string, unknown>
}

async function checkDesktopActionPreflight(action: DesktopHostAction): Promise<DesktopPreflightFailure | null> {
  const capabilities = hostRuntime.desktop.getCapabilities()
  const actionCapability = capabilities.actions.find((item) => item.id === action)

  if (!actionCapability?.supported) {
    return {
      errorCode: 'unsupported_platform',
      detail: `Desktop action ${action} is not supported on ${process.platform}.`,
      metadata: {
        preflightFailed: true,
        platform: process.platform,
        action,
        reason: 'unsupported_action'
      }
    }
  }

  if (!actionCapability.requiresAccessibilityPermission) {
    return null
  }

  const status = await hostRuntime.status.getEnvironmentStatus()
  if (status.permissions.accessibility.state === 'granted') {
    return null
  }

  return {
    errorCode: 'permission_denied',
    detail: `macOS Accessibility permission is required for ${action}. Open System Settings > Privacy & Security > Accessibility and allow SkillsFan.`,
    metadata: {
      preflightFailed: true,
      platform: status.platform,
      action,
      accessibility: status.permissions.accessibility.state
    }
  }
}

async function captureDesktopPerceptionArtifact(
  workDir: string,
  role: 'before' | 'after'
): Promise<StepArtifactRef | undefined> {
  try {
    const result = await hostRuntime.perception.captureDesktopScreenshot({ workDir })
    if (!result.data && !result.filePath) return undefined
    return {
      kind: 'screenshot',
      role,
      label: role === 'before' ? 'Before' : 'After',
      mimeType: result.mimeType,
      previewImageData: result.data,
      path: result.filePath
    }
  } catch {
    return undefined
  }
}

export interface CreateLocalToolsMcpServerOptions {
  workDir: string
  spaceId: string
  conversationId: string
  aiBrowserEnabled?: boolean
  includeSubagentTools?: boolean
}

function getToolUseId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== 'object') return undefined

  const record = extra as Record<string, unknown>
  const candidates = [
    record.toolUseId,
    record.tool_use_id,
    record.toolUseID,
    record.id
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0)
}

export function createLocalToolsMcpServer(options: CreateLocalToolsMcpServerOptions) {
  const catalog = buildToolCatalog({
    aiBrowserEnabled: options.aiBrowserEnabled,
    includeSubagentTools: options.includeSubagentTools
  })

  const memoryTool = tool(
    'memory',
    'Search cross-conversation memory and manage project MEMORY.md or memory/* notes through the app-local memory system.',
    {
      command: z.enum(['search', 'view', 'create', 'insert', 'str_replace', 'delete', 'rename']),
      query: z.string().optional().describe('Required for search'),
      limit: z.number().int().min(1).max(10).optional().describe('Maximum results for search'),
      path: z.string().optional().describe('Memory path such as MEMORY.md or memory/topic.md'),
      view_range: z.array(z.number().int().min(1)).max(2).optional().describe('Optional line range for view'),
      file_text: z.string().optional().describe('Required for create'),
      insert_line: z.number().int().min(1).optional().describe('1-based line number for insert'),
      insert_text: z.string().optional().describe('Required for insert'),
      old_str: z.string().optional().describe('Required for str_replace'),
      new_str: z.string().optional().describe('Required for str_replace'),
      old_path: z.string().optional().describe('Required for rename'),
      new_path: z.string().optional().describe('Required for rename')
    },
    async (args) => {
      try {
        const result = await executeMemoryCommand({
          ...args,
          workDir: options.workDir,
          spaceId: options.spaceId,
          conversationId: options.conversationId
        })
        return {
          content: [{ type: 'text' as const, text: toToolText(result) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const codeExecutionTool = tool(
    'code_execution',
    'Run a local code snippet inside the current workspace. Supported languages: javascript, python, bash.',
    {
      language: z.enum(['javascript', 'js', 'node', 'python', 'python3', 'py', 'bash', 'sh', 'shell', 'zsh']),
      code: z.string().min(1).describe('Code snippet to execute'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args) => {
      try {
        const result = await executeCodeSnippet({
          workDir: options.workDir,
          language: args.language,
          code: args.code,
          timeoutMs: args.timeoutMs
        })
        return {
          content: [{ type: 'text' as const, text: toToolText(result) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const bashCodeExecutionTool = tool(
    'bash_code_execution',
    'Run a local shell command inside the current workspace as a hosted-tool replacement.',
    {
      command: z.string().min(1).describe('Shell command to execute'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args) => {
      try {
        const result = await executeShellCommand({
          workDir: options.workDir,
          command: args.command,
          timeoutMs: args.timeoutMs
        })
        return {
          content: [{ type: 'text' as const, text: toToolText(result) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const textEditorTool = tool(
    'text_editor_code_execution',
    'View or edit files in the current workspace through a local text-editor style interface.',
    {
      command: z.enum(['view', 'create', 'str_replace']),
      path: z.string().min(1).describe('Workspace-relative file path'),
      view_range: z.array(z.number().int().min(1)).max(2).optional().describe('Optional line range for view'),
      file_text: z.string().optional().describe('Required for create'),
      old_str: z.string().optional().describe('Required for str_replace'),
      new_str: z.string().optional().describe('Required for str_replace')
    },
    async (args) => {
      try {
        const result = await executeTextEditorCommand({
          ...args,
          workDir: options.workDir
        })
        return {
          content: [{ type: 'text' as const, text: toToolText(result) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const openUrlTool = tool(
    'open_url',
    'Open a URL in the user\'s default system browser (Chrome, Safari, etc). Use this to let the user view web pages.',
    {
      url: z.string().url().describe('The URL to open')
    },
    async (args) => {
      try {
        const { shell } = await import('electron')
        await shell.openExternal(args.url)
        return {
          content: [{ type: 'text' as const, text: `Opened ${args.url} in system browser.` }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const openApplicationTool = tool(
    'open_application',
    'Open a real macOS application, optionally with a URL or file target. Use this to launch the user\'s actual Google Chrome instead of the sandboxed AI browser. Do not use this just to prepare Terminal, iTerm, Finder, or Chrome before another structured app tool; those tools already open or reuse the app when needed.',
    {
      application: z.string().min(1).describe('macOS application name, such as "Google Chrome" or "Safari"'),
      target: z.string().optional().describe('Optional URL or file path to open with the application'),
      activate: z.boolean().optional().describe('Whether to bring the application to the front (default: true)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      const adapter = resolveDesktopAppAdapter(args.application, process.platform)
      try {
        const adapterExecution = await maybeExecuteOpenApplicationAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          workDir: options.workDir,
          application: args.application,
          target: args.target,
          activate: args.activate,
          timeoutMs: args.timeoutMs
        })
        const result = adapterExecution?.result ?? await hostRuntime.desktop.openApplication({
          workDir: options.workDir,
          application: args.application,
          target: args.target,
          activate: args.activate,
          timeoutMs: args.timeoutMs
        })

        if (result.returnCode !== 0 || result.timedOut) {
          const failure = describeDesktopAutomationFailure(result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Failed to open ${args.application}${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'open_application',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: adapter.id,
              adapterStage: adapter.stage,
              adapterMethodId: adapterExecution?.methodId,
              adapterMethodStage: adapterExecution?.stage,
              application: args.application,
              target: args.target,
              returnCode: result.returnCode,
              timedOut: result.timedOut,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage
            }
          })
          return response
        }

        const targetText = args.target ? ` with ${args.target}` : ''
        const response = {
          content: [{
            type: 'text' as const,
            text: adapterExecution?.successText || `Opened ${args.application}${targetText}.`
          }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'open_application',
          toolArgs: args,
          result: response,
          metadata: {
            application: args.application,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            adapterMethodId: adapterExecution?.methodId,
            adapterMethodStage: adapterExecution?.stage,
            target: args.target,
            returnCode: result.returnCode,
            timedOut: result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Failed to open ${args.application}${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'open_application',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            application: args.application,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            adapterMethodId: undefined,
            adapterMethodStage: undefined,
            target: args.target,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const activateApplicationTool = tool(
    'activate_application',
    'Bring a real macOS application to the front without reopening it. Use this before typing or pressing keys into an existing app window.',
    {
      application: z.string().min(1).describe('macOS application name, such as "Google Chrome" or "Terminal"'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      const adapter = resolveDesktopAppAdapter(args.application, process.platform)
      try {
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.activateApplication({
          workDir: options.workDir,
          application: args.application,
          timeoutMs: args.timeoutMs
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const text = isError
          ? `Failed to activate ${args.application}${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Activated ${args.application}.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'activate_application',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            application: args.application,
            returnCode: result.returnCode,
            timedOut: result.timedOut,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Failed to activate ${args.application}${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'activate_application',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            application: args.application,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const runAppleScriptTool = tool(
    'run_applescript',
    'Run AppleScript on macOS for system-level UI automation. Use this to control real desktop apps through System Events after the user grants Accessibility and Automation permissions.',
    {
      script: z.string().min(1).describe('AppleScript source code to execute'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const result = await hostRuntime.desktop.runAppleScript({
          workDir: options.workDir,
          script: args.script,
          timeoutMs: args.timeoutMs
        })

        if (result.returnCode !== 0 || result.timedOut) {
          const failure = describeDesktopAutomationFailure(result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `AppleScript failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'run_applescript',
            toolArgs: {
              timeoutMs: args.timeoutMs,
              scriptPreview: args.script.slice(0, 200)
            },
            result: response,
            metadata: {
              returnCode: result.returnCode,
              timedOut: result.timedOut,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{
            type: 'text' as const,
            text: result.stdout.trim() ? `AppleScript completed:\n${result.stdout.trim()}` : 'AppleScript completed.'
          }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'run_applescript',
          toolArgs: {
            timeoutMs: args.timeoutMs,
            scriptPreview: args.script.slice(0, 200)
          },
          result: response,
          metadata: {
            returnCode: result.returnCode,
            timedOut: result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `AppleScript failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'run_applescript',
          toolArgs: {
            timeoutMs: args.timeoutMs,
            scriptPreview: args.script.slice(0, 200)
          },
          result: response,
          metadata: {
            thrown: true,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const finderRevealPathTool = tool(
    'finder_reveal_path',
    'Reveal a local file or folder in Finder through a structured desktop adapter instead of free-form AppleScript.',
    {
      target: z.string().min(1).describe('Absolute or workspace-relative file or folder path to reveal in Finder'),
      application: z.literal('Finder').optional().describe('Finder app target (default: Finder)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'finder',
            methodId: 'finder.reveal_path',
            application: 'Finder',
            target: args.target,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Finder reveal failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_reveal_path',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'Finder',
              target: args.target,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_reveal_path',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'Finder',
            target: args.target,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Finder reveal failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_reveal_path',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'finder',
            adapterMethodId: 'finder.reveal_path',
            application: 'Finder',
            target: args.target,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const finderOpenFolderTool = tool(
    'finder_open_folder',
    'Open a local folder in Finder through a structured desktop adapter instead of free-form AppleScript.',
    {
      target: z.string().min(1).describe('Absolute or workspace-relative folder path to open in Finder'),
      application: z.literal('Finder').optional().describe('Finder app target (default: Finder)'),
      activate: z.boolean().optional().describe('Whether to bring Finder to the front (default: true)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'finder',
            methodId: 'finder.open_folder',
            application: 'Finder',
            target: args.target,
            activate: args.activate,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Finder open folder failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_open_folder',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'Finder',
              target: args.target,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_open_folder',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'Finder',
            target: args.target,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Finder open folder failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_open_folder',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'finder',
            adapterMethodId: 'finder.open_folder',
            application: 'Finder',
            target: args.target,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const finderOpenHomeFolderTool = tool(
    'finder_open_home_folder',
    'Open the current user home folder in Finder through a structured desktop adapter.',
    {
      application: z.literal('Finder').optional().describe('Finder app target (default: Finder)'),
      activate: z.boolean().optional().describe('Whether to bring Finder to the front (default: true)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'finder',
            methodId: 'finder.open_home_folder',
            application: 'Finder',
            activate: args.activate,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Finder open home folder failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_open_home_folder',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'Finder',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_open_home_folder',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'Finder',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Finder open home folder failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_open_home_folder',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'finder',
            adapterMethodId: 'finder.open_home_folder',
            application: 'Finder',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const finderNewWindowTool = tool(
    'finder_new_window',
    'Open a new Finder window through a structured desktop adapter.',
    {
      application: z.literal('Finder').optional().describe('Finder app target (default: Finder)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Finder new window failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_new_window',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: 'Finder',
              adapterId: 'finder',
              adapterMethodId: 'finder.new_window'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'finder',
            methodId: 'finder.new_window',
            application: 'Finder',
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Finder new window failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_new_window',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'Finder',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_new_window',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'Finder',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Finder new window failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_new_window',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'finder',
            adapterMethodId: 'finder.new_window',
            application: 'Finder',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const finderSearchTool = tool(
    'finder_search',
    'Search files from a Finder-oriented directory scope through a structured desktop adapter.',
    {
      query: z.string().min(1).describe('Search query to run against local Spotlight/Finder metadata'),
      directory: z.string().optional().describe('Optional absolute or workspace-relative directory to scope the search (default: home folder)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results to return (default: 20)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Finder search failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_search',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: 'Finder',
              query: args.query,
              directory: args.directory,
              limit: args.limit,
              adapterId: 'finder',
              adapterMethodId: 'finder.search'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'finder',
            methodId: 'finder.search',
            command: args.query,
            target: args.directory,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Finder search failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'finder_search',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'Finder',
              query: args.query,
              directory: args.directory,
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          query: args.query,
          directory: args.directory,
          results: [],
          totalResults: 0,
          returnedResults: 0,
          truncated: false
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_search',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'Finder',
            query: args.query,
            directory: responseRecord.directory,
            limit: args.limit,
            returnedResults: responseRecord.returnedResults,
            totalResults: responseRecord.totalResults,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Finder search failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'finder_search',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'finder',
            adapterMethodId: 'finder.search',
            application: 'Finder',
            query: args.query,
            directory: args.directory,
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalNewTabRunCommandTool = tool(
    'terminal_new_tab_run_command',
    'Open a new Terminal or iTerm tab, then run a shell command through a structured desktop adapter.',
    {
      command: z.string().min(1).describe('Shell command to run in the new terminal tab'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.new_tab_run_command',
            application: args.application,
            command: args.command,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal new-tab command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_new_tab_run_command',
            toolArgs: {
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              timeoutMs: args.timeoutMs
            },
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_new_tab_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal new-tab command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_new_tab_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.new_tab_run_command',
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalRunCommandTool = tool(
    'terminal_run_command',
    'Run a shell command in Terminal or iTerm through a structured desktop adapter instead of free-form AppleScript. This already opens Terminal or iTerm when needed, so do not call open_application first.',
    {
      command: z.string().min(1).describe('Shell command to run in the selected terminal app'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.run_command',
            application: args.application,
            command: args.command,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command',
            toolArgs: {
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              timeoutMs: args.timeoutMs
            },
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.run_command',
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalSplitPaneRunCommandTool = tool(
    'terminal_split_pane_run_command',
    'Split an iTerm or iTerm2 pane horizontally or vertically, then run a shell command in the new pane through a structured desktop adapter.',
    {
      command: z.string().min(1).describe('Shell command to run in the newly created iTerm pane'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (must be iTerm or iTerm2)'),
      direction: terminalSplitDirectionSchema.optional().describe('Split direction for the new pane (default: vertical)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.split_pane_run_command',
            application: args.application || 'iTerm2',
            command: args.command,
            direction: args.direction,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal split-pane command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_split_pane_run_command',
            toolArgs: {
              application: args.application || 'iTerm2',
              direction: args.direction || 'vertical',
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              timeoutMs: args.timeoutMs
            },
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'iTerm2',
              direction: args.direction || 'vertical',
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'iTerm2',
          direction: args.direction || 'vertical',
          created: true,
          active: false,
          busy: false,
          title: '',
          tty: '',
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: []
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_split_pane_run_command',
          toolArgs: {
            application: args.application || 'iTerm2',
            direction: args.direction || 'vertical',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            direction: responseRecord.direction,
            created: responseRecord.created,
            active: responseRecord.active,
            busy: responseRecord.busy,
            title: responseRecord.title,
            tty: responseRecord.tty,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            sessionIndex: responseRecord.sessionIndex,
            paneIndex: responseRecord.paneIndex,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal split-pane command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_split_pane_run_command',
          toolArgs: {
            application: args.application || 'iTerm2',
            direction: args.direction || 'vertical',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.split_pane_run_command',
            application: args.application || 'iTerm2',
            direction: args.direction || 'vertical',
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalRunCommandInDirectoryTool = tool(
    'terminal_run_command_in_directory',
    'Run a shell command in Terminal or iTerm after changing into a target directory through a structured desktop adapter.',
    {
      command: z.string().min(1).describe('Shell command to run in the selected terminal app'),
      directory: z.string().min(1).describe('Absolute or workspace-relative directory to change into before running the command'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.run_command_in_directory',
            application: args.application,
            target: args.directory,
            command: args.command,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal command in directory failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command_in_directory',
            toolArgs: {
              application: args.application || 'Terminal',
              directory: args.directory,
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              timeoutMs: args.timeoutMs
            },
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              directory: args.directory,
              commandPreview: truncateDesktopInput(args.command),
              ...pickTerminalTargetMetadata(args),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_in_directory',
          toolArgs: {
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal command in directory failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_in_directory',
          toolArgs: {
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.run_command_in_directory',
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalListSessionsTool = tool(
    'terminal_list_sessions',
    'List Terminal or iTerm windows, tabs, and sessions through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to inspect (default: Terminal)'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of sessions to return'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `List terminal sessions failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_list_sessions',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              limit: args.limit,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.list_sessions'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.list_sessions',
            application: args.application,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `List terminal sessions failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_list_sessions',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          sessions: [],
          totalSessions: 0,
          returnedSessions: 0,
          truncated: false
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_list_sessions',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            limit: args.limit,
            returnedSessions: responseRecord.returnedSessions,
            totalSessions: responseRecord.totalSessions,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `List terminal sessions failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_list_sessions',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.list_sessions',
            application: args.application || 'Terminal',
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalListPanesTool = tool(
    'terminal_list_panes',
    'List panes inside a selected iTerm or iTerm2 tab through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to inspect (must be iTerm or iTerm2)'),
      windowIndex: z.number().int().min(1).optional().describe('iTerm window index to inspect (1-based, optional)'),
      tabIndex: z.number().int().min(1).optional().describe('iTerm tab index to inspect within the selected window (1-based, optional)'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of panes to return'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `List terminal panes failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_list_panes',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'iTerm2',
              windowIndex: args.windowIndex,
              tabIndex: args.tabIndex,
              limit: args.limit,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.list_panes'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.list_panes',
            application: args.application || 'iTerm2',
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `List terminal panes failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_list_panes',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'iTerm2',
              windowIndex: args.windowIndex,
              tabIndex: args.tabIndex,
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'iTerm2',
          panes: [],
          totalPanes: 0,
          returnedPanes: 0,
          truncated: false,
          windowIndex: args.windowIndex,
          tabIndex: args.tabIndex
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_list_panes',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            limit: args.limit,
            returnedPanes: responseRecord.returnedPanes,
            totalPanes: responseRecord.totalPanes,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `List terminal panes failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_list_panes',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.list_panes',
            application: args.application || 'iTerm2',
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalGetPaneLayoutTool = tool(
    'terminal_get_pane_layout',
    'Read a structured iTerm or iTerm2 pane layout snapshot, including pane sizes and a split-hierarchy view.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to inspect (must be iTerm or iTerm2)'),
      windowIndex: z.number().int().min(1).optional().describe('iTerm window index to inspect (1-based, optional)'),
      tabIndex: z.number().int().min(1).optional().describe('iTerm tab index to inspect within the selected window (1-based, optional)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Read terminal pane layout failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_pane_layout',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'iTerm2',
              windowIndex: args.windowIndex,
              tabIndex: args.tabIndex,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.get_pane_layout'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.get_pane_layout',
            application: args.application || 'iTerm2',
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Read terminal pane layout failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_pane_layout',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'iTerm2',
              windowIndex: args.windowIndex,
              tabIndex: args.tabIndex,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'iTerm2',
          panes: [],
          totalPanes: 0,
          activePaneIndex: null,
          supportedSplitDirections: ['horizontal', 'vertical'],
          hierarchySource: 'synthetic_flat',
          splitHierarchy: {
            type: 'group',
            splitDirection: 'unknown',
            children: []
          },
          windowIndex: args.windowIndex,
          tabIndex: args.tabIndex
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_pane_layout',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            activePaneIndex: responseRecord.activePaneIndex,
            totalPanes: responseRecord.totalPanes,
            hierarchySource: responseRecord.hierarchySource,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Read terminal pane layout failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_pane_layout',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.get_pane_layout',
            application: args.application || 'iTerm2',
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalFocusSessionTool = tool(
    'terminal_focus_session',
    'Focus a specific Terminal or iTerm window, tab, or session through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Focus terminal session failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_focus_session',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              adapterId: 'terminal',
              adapterMethodId: 'terminal.focus_session'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.focus_session',
            application: args.application,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Focus terminal session failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_focus_session',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_focus_session',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Focus terminal session failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_focus_session',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.focus_session',
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalInterruptProcessTool = tool(
    'terminal_interrupt_process',
    'Send Control+C to a selected Terminal or iTerm session through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Terminal interrupt failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_interrupt_process',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              adapterId: 'terminal',
              adapterMethodId: 'terminal.interrupt_process'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.interrupt_process',
            application: args.application,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal interrupt failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_interrupt_process',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_interrupt_process',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal interrupt failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_interrupt_process',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.interrupt_process',
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalGetSessionStateTool = tool(
    'terminal_get_session_state',
    'Read the active, busy, title, and tty state for a selected Terminal or iTerm session through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Read terminal session state failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_session_state',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              adapterId: 'terminal',
              adapterMethodId: 'terminal.get_session_state'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.get_session_state',
            application: args.application,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Read terminal session state failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_session_state',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          windowIndex: args.windowIndex ?? 0,
          tabIndex: args.tabIndex ?? 0,
          sessionIndex: args.sessionIndex ?? 0,
          paneIndex: args.application === 'Terminal' ? undefined : (args.paneIndex ?? args.sessionIndex ?? 0),
          active: false,
          busy: false,
          title: '',
          tty: '',
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: []
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_session_state',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            active: responseRecord.active,
            busy: responseRecord.busy,
            title: responseRecord.title,
            tty: responseRecord.tty,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            sessionIndex: responseRecord.sessionIndex,
            paneIndex: responseRecord.paneIndex,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Read terminal session state failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_session_state',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.get_session_state',
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalGetLastCommandResultTool = tool(
    'terminal_get_last_command_result',
    'Read the last structured command result, including command identity and exit status, from a selected Terminal or iTerm session.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Read terminal last command result failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_last_command_result',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              adapterId: 'terminal',
              adapterMethodId: 'terminal.get_last_command_result'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.get_last_command_result',
            application: args.application,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Read terminal last command result failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_get_last_command_result',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              commandId: responseRecord.commandId,
              exitStatus: responseRecord.exitStatus,
              completed: responseRecord.completed,
              exitMarkerCount: responseRecord.exitMarkerCount,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          commandId: null,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          windowIndex: args.windowIndex,
          tabIndex: args.tabIndex,
          sessionIndex: args.sessionIndex,
          paneIndex: args.application === 'Terminal' ? undefined : (args.paneIndex ?? args.sessionIndex)
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_last_command_result',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            commandId: responseRecord.commandId,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            sessionIndex: responseRecord.sessionIndex,
            paneIndex: responseRecord.paneIndex,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Read terminal last command result failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_get_last_command_result',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.get_last_command_result',
            application: args.application || 'Terminal',
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalReadOutputTool = tool(
    'terminal_read_output',
    'Read the visible output from the active Terminal or iTerm session through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      maxChars: z.number().int().min(256).max(20_000).optional().describe('Maximum number of trailing characters to return (default: 4000)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Read terminal output failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_read_output',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              maxChars: args.maxChars,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.read_output'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.read_output',
            application: args.application,
            maxChars: args.maxChars,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Read terminal output failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_read_output',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              maxChars: args.maxChars,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          output: '',
          totalChars: 0,
          returnedChars: 0,
          truncated: false,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: []
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_read_output',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            maxChars: args.maxChars,
            ...pickTerminalTargetMetadata(args),
            outputChars: responseRecord.returnedChars,
            totalChars: responseRecord.totalChars,
            truncated: responseRecord.truncated,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Read terminal output failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_read_output',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.read_output',
            application: args.application || 'Terminal',
            maxChars: args.maxChars,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalWaitUntilNotBusyTool = tool(
    'terminal_wait_until_not_busy',
    'Wait until a selected Terminal or iTerm session is no longer busy through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Wait for terminal session idle failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_until_not_busy',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              adapterId: 'terminal',
              adapterMethodId: 'terminal.wait_until_not_busy'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.wait_until_not_busy',
            application: args.application,
            pollIntervalMs: args.pollIntervalMs,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Wait for terminal session idle failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_until_not_busy',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          windowIndex: args.windowIndex ?? 0,
          tabIndex: args.tabIndex ?? 0,
          sessionIndex: args.sessionIndex ?? 0,
          paneIndex: args.application === 'Terminal' ? undefined : (args.paneIndex ?? args.sessionIndex ?? 0),
          active: false,
          busy: false,
          title: '',
          tty: '',
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_until_not_busy',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            active: responseRecord.active,
            busy: responseRecord.busy,
            title: responseRecord.title,
            tty: responseRecord.tty,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            sessionIndex: responseRecord.sessionIndex,
            paneIndex: responseRecord.paneIndex,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Wait for terminal session idle failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_until_not_busy',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.wait_until_not_busy',
            application: args.application || 'Terminal',
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalWaitForOutputTool = tool(
    'terminal_wait_for_output',
    'Wait until expected text appears in the active Terminal or iTerm session through a structured desktop adapter.',
    {
      expectedText: z.string().min(1).describe('Expected text to wait for in the active terminal output'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      maxChars: z.number().int().min(256).max(20_000).optional().describe('Maximum number of trailing characters to return in the final observation (default: 4000)'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Wait for terminal output failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_for_output',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              expectedText: args.expectedText,
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.wait_for_output'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.wait_for_output',
            application: args.application,
            expectedText: args.expectedText,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Wait for terminal output failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_for_output',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              expectedText: args.expectedText,
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          expectedText: args.expectedText,
          output: '',
          totalChars: 0,
          returnedChars: 0,
          truncated: false,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          matched: false,
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_for_output',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            expectedText: args.expectedText,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            outputChars: responseRecord.returnedChars,
            totalChars: responseRecord.totalChars,
            truncated: responseRecord.truncated,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            matched: responseRecord.matched,
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Wait for terminal output failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_for_output',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.wait_for_output',
            application: args.application || 'Terminal',
            expectedText: args.expectedText,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalWaitUntilIdleTool = tool(
    'terminal_wait_until_idle',
    'Wait until Terminal or iTerm output stays unchanged for an idle window through a structured desktop adapter.',
    {
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      idleMs: z.number().int().min(100).max(30_000).optional().describe('How long the output must remain unchanged before treating the terminal as idle (default: 1500)'),
      maxChars: z.number().int().min(256).max(20_000).optional().describe('Maximum number of trailing characters to return in the final observation (default: 4000)'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Wait for terminal idle failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_until_idle',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              idleMs: args.idleMs,
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.wait_until_idle'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.wait_until_idle',
            application: args.application,
            idleMs: args.idleMs,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Wait for terminal idle failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_wait_until_idle',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              idleMs: args.idleMs,
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          idleMs: args.idleMs ?? 1500,
          output: '',
          totalChars: 0,
          returnedChars: 0,
          truncated: false,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          stable: false,
          checks: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_until_idle',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            idleMs: responseRecord.idleMs,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            outputChars: responseRecord.returnedChars,
            totalChars: responseRecord.totalChars,
            truncated: responseRecord.truncated,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            stable: responseRecord.stable,
            checks: responseRecord.checks,
            elapsedMs: responseRecord.elapsedMs,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Wait for terminal idle failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_wait_until_idle',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.wait_until_idle',
            application: args.application || 'Terminal',
            idleMs: args.idleMs,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalRunCommandAndWaitTool = tool(
    'terminal_run_command_and_wait',
    'Run a shell command in Terminal or iTerm and wait until the command reports a structured exit status marker.',
    {
      command: z.string().min(1).describe('Shell command to run in the selected terminal app'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      maxChars: z.number().int().min(256).max(20_000).optional().describe('Maximum number of trailing characters to return in the completion observation (default: 4000)'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds while waiting for completion (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Run terminal command and wait failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command_and_wait',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.run_command_and_wait'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.run_command_and_wait',
            application: args.application,
            command: args.command,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Run terminal command and wait failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command_and_wait',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          output: '',
          totalChars: 0,
          returnedChars: 0,
          truncated: false,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_and_wait',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            outputChars: responseRecord.returnedChars,
            totalChars: responseRecord.totalChars,
            truncated: responseRecord.truncated,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Run terminal command and wait failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_and_wait',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.run_command_and_wait',
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalRunCommandInDirectoryAndWaitTool = tool(
    'terminal_run_command_in_directory_and_wait',
    'Run a shell command in Terminal or iTerm after changing into a target directory and wait until it reports a structured exit status marker.',
    {
      command: z.string().min(1).describe('Shell command to run in the selected terminal app'),
      directory: z.string().min(1).describe('Absolute or workspace-relative directory to change into before running the command'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      ...terminalTargetSchema,
      maxChars: z.number().int().min(256).max(20_000).optional().describe('Maximum number of trailing characters to return in the completion observation (default: 4000)'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds while waiting for completion (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Run terminal command in directory and wait failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command_in_directory_and_wait',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Terminal',
              directory: args.directory,
              commandPreview: truncateDesktopInput(args.command),
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'terminal',
              adapterMethodId: 'terminal.run_command_in_directory_and_wait'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.run_command_in_directory_and_wait',
            application: args.application,
            target: args.directory,
            command: args.command,
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            windowIndex: args.windowIndex,
            tabIndex: args.tabIndex,
            sessionIndex: args.sessionIndex,
            paneIndex: args.paneIndex,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const responseRecord = execution.data && typeof execution.data === 'object'
            ? execution.data as Record<string, unknown>
            : {}
          const response = {
            content: [{
              type: 'text' as const,
              text: `Run terminal command in directory and wait failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}${formatTerminalRecoverySuffix(responseRecord)}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_run_command_in_directory_and_wait',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              directory: args.directory,
              commandPreview: truncateDesktopInput(args.command),
              maxChars: args.maxChars,
              pollIntervalMs: args.pollIntervalMs,
              ...pickTerminalTargetMetadata(args),
              ...pickTerminalRecoveryMetadata(responseRecord),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Terminal',
          output: '',
          totalChars: 0,
          returnedChars: 0,
          truncated: false,
          completed: false,
          exitStatus: null,
          exitMarkerCount: 0,
          completionState: 'unknown',
          recoveryHint: null,
          recoverySuggestions: [],
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_in_directory_and_wait',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            outputChars: responseRecord.returnedChars,
            totalChars: responseRecord.totalChars,
            truncated: responseRecord.truncated,
            completed: responseRecord.completed,
            exitStatus: responseRecord.exitStatus,
            exitMarkerCount: responseRecord.exitMarkerCount,
            ...pickTerminalRecoveryMetadata(responseRecord),
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Run terminal command in directory and wait failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_run_command_in_directory_and_wait',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.run_command_in_directory_and_wait',
            application: args.application || 'Terminal',
            directory: args.directory,
            commandPreview: truncateDesktopInput(args.command),
            maxChars: args.maxChars,
            pollIntervalMs: args.pollIntervalMs,
            ...pickTerminalTargetMetadata(args),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const terminalNewWindowRunCommandTool = tool(
    'terminal_new_window_run_command',
    'Open a new Terminal or iTerm window, then run a shell command through a structured desktop adapter. Use this only when the user explicitly wants a separate new window.',
    {
      command: z.string().min(1).describe('Shell command to run in the new terminal window'),
      application: terminalApplicationSchema.optional().describe('Terminal app to target (default: Terminal)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'terminal',
            methodId: 'terminal.new_window_run_command',
            application: args.application,
            command: args.command,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Terminal new-window command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'terminal_new_window_run_command',
            toolArgs: {
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              timeoutMs: args.timeoutMs
            },
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Terminal',
              commandPreview: truncateDesktopInput(args.command),
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_new_window_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Terminal new-window command failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'terminal_new_window_run_command',
          toolArgs: {
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            timeoutMs: args.timeoutMs
          },
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'terminal',
            adapterMethodId: 'terminal.new_window_run_command',
            application: args.application || 'Terminal',
            commandPreview: truncateDesktopInput(args.command),
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeOpenUrlTool = tool(
    'chrome_open_url',
    'Open an http or https URL in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      url: z.string().url().describe('URL to open in the selected browser'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      activate: z.boolean().optional().describe('Whether to bring the browser to the front (default: true)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.open_url',
            application: args.application,
            target: args.url,
            activate: args.activate,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome open URL failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_open_url',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              url: args.url,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_open_url',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            url: args.url,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome open URL failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_open_url',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.open_url',
            application: args.application || 'Google Chrome',
            url: args.url,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeOpenUrlInNewTabTool = tool(
    'chrome_open_url_in_new_tab',
    'Open an http or https URL in a new Google Chrome, Chrome, or Chromium tab through a structured desktop adapter.',
    {
      url: z.string().url().describe('URL to open in a new tab'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.open_url_in_new_tab',
            application: args.application,
            target: args.url,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome open URL in new tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_open_url_in_new_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              url: args.url,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_open_url_in_new_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            url: args.url,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome open URL in new tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_open_url_in_new_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.open_url_in_new_tab',
            application: args.application || 'Google Chrome',
            url: args.url,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeFocusTabTool = tool(
    'chrome_focus_tab',
    'Focus a Google Chrome, Chrome, or Chromium tab by partial title through a structured desktop adapter.',
    {
      title: z.string().min(1).describe('Partial title to match against existing browser tabs'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.focus_tab_by_title',
            application: args.application,
            target: args.title,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome tab focus failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_focus_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              title: args.title,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_focus_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            title: args.title,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome tab focus failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_focus_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.focus_tab_by_title',
            application: args.application || 'Google Chrome',
            title: args.title,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeNewTabTool = tool(
    'chrome_new_tab',
    'Open a new tab in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Chrome new tab failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_new_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              adapterId: 'chrome',
              adapterMethodId: 'chrome.new_tab'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.new_tab',
            application: args.application,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome new tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_new_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_new_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome new tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_new_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.new_tab',
            application: args.application || 'Google Chrome',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeReloadActiveTabTool = tool(
    'chrome_reload_active_tab',
    'Reload the active tab in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Chrome reload failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_reload_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              adapterId: 'chrome',
              adapterMethodId: 'chrome.reload_active_tab'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.reload_active_tab',
            application: args.application,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome reload failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_reload_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_reload_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome reload failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_reload_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.reload_active_tab',
            application: args.application || 'Google Chrome',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeFocusTabByUrlTool = tool(
    'chrome_focus_tab_by_url',
    'Focus a Google Chrome, Chrome, or Chromium tab by partial URL through a structured desktop adapter.',
    {
      url: z.string().min(1).describe('Partial URL to match against existing browser tabs'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.focus_tab_by_url',
            application: args.application,
            target: args.url,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Chrome tab focus by URL failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_focus_tab_by_url',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              url: args.url,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_focus_tab_by_url',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            url: args.url,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Chrome tab focus by URL failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_focus_tab_by_url',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.focus_tab_by_url',
            application: args.application || 'Google Chrome',
            url: args.url,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeListTabsTool = tool(
    'chrome_list_tabs',
    'List open tabs in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of tabs to return (default: all observed tabs)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `List Chrome tabs failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_list_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              limit: args.limit,
              adapterId: 'chrome',
              adapterMethodId: 'chrome.list_tabs'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.list_tabs',
            application: args.application,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `List Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_list_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          tabs: [],
          totalTabs: 0,
          returnedTabs: 0,
          truncated: false
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_list_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            limit: args.limit,
            tabCount: responseRecord.returnedTabs,
            totalTabs: responseRecord.totalTabs,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `List Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_list_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.list_tabs',
            application: args.application || 'Google Chrome',
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeGetActiveTabTool = tool(
    'chrome_get_active_tab',
    'Read the active tab in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Read active Chrome tab failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_get_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              adapterId: 'chrome',
              adapterMethodId: 'chrome.get_active_tab'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.get_active_tab',
            application: args.application,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Read active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_get_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          windowIndex: 0,
          tabIndex: 0,
          title: '',
          url: ''
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_get_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            title: responseRecord.title,
            url: responseRecord.url,
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Read active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_get_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.get_active_tab',
            application: args.application || 'Google Chrome',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeWaitForTabTool = tool(
    'chrome_wait_for_tab',
    'Wait until a matching tab appears in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      query: z.string().min(1).describe('Query to match against tab titles, URLs, or domains while waiting'),
      field: z.enum(['either', 'title', 'url', 'domain']).optional().describe('Which tab field to match against while waiting (default: either)'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matching tabs to return when the wait succeeds'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Wait for Chrome tab failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_wait_for_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'chrome',
              adapterMethodId: 'chrome.wait_for_tab'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.wait_for_tab',
            application: args.application,
            query: args.query,
            field: args.field,
            limit: args.limit,
            pollIntervalMs: args.pollIntervalMs,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Wait for Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_wait_for_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              pollIntervalMs: args.pollIntervalMs,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          query: args.query,
          field: args.field || 'either',
          tabs: [],
          totalMatches: 0,
          returnedMatches: 0,
          truncated: false,
          matched: false,
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_wait_for_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            query: responseRecord.query,
            field: responseRecord.field,
            limit: args.limit,
            totalMatches: responseRecord.totalMatches,
            returnedMatches: responseRecord.returnedMatches,
            matched: responseRecord.matched,
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Wait for Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_wait_for_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.wait_for_tab',
            application: args.application || 'Google Chrome',
            query: args.query,
            field: args.field || 'either',
            limit: args.limit,
            pollIntervalMs: args.pollIntervalMs,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeWaitForActiveTabTool = tool(
    'chrome_wait_for_active_tab',
    'Wait until the active tab in Google Chrome, Chrome, or Chromium matches a structured query.',
    {
      query: z.string().min(1).describe('Query to match against the active tab title, URL, or domain while waiting'),
      field: z.enum(['either', 'title', 'url', 'domain']).optional().describe('Which active-tab field to match against while waiting (default: either)'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      pollIntervalMs: z.number().int().min(100).max(5_000).optional().describe('Polling interval in milliseconds (default: 500)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Overall timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Wait for active Chrome tab failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_wait_for_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              pollIntervalMs: args.pollIntervalMs,
              adapterId: 'chrome',
              adapterMethodId: 'chrome.wait_for_active_tab'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.wait_for_active_tab',
            application: args.application,
            query: args.query,
            field: args.field,
            pollIntervalMs: args.pollIntervalMs,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Wait for active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_wait_for_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              pollIntervalMs: args.pollIntervalMs,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          query: args.query,
          field: args.field || 'either',
          windowIndex: 0,
          tabIndex: 0,
          title: '',
          url: '',
          matched: false,
          attempts: 0,
          elapsedMs: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_wait_for_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            query: responseRecord.query,
            field: responseRecord.field,
            title: responseRecord.title,
            url: responseRecord.url,
            windowIndex: responseRecord.windowIndex,
            tabIndex: responseRecord.tabIndex,
            matched: responseRecord.matched,
            attempts: responseRecord.attempts,
            elapsedMs: responseRecord.elapsedMs,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Wait for active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_wait_for_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.wait_for_active_tab',
            application: args.application || 'Google Chrome',
            query: args.query,
            field: args.field || 'either',
            pollIntervalMs: args.pollIntervalMs,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeFindTabsTool = tool(
    'chrome_find_tabs',
    'Find matching tabs in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      query: z.string().min(1).describe('Query to match against tab titles, URLs, or domains'),
      field: z.enum(['either', 'title', 'url', 'domain']).optional().describe('Which tab field to match against (default: either)'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matching tabs to return'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('run_applescript')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Find Chrome tabs failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_find_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              adapterId: 'chrome',
              adapterMethodId: 'chrome.find_tabs'
            }
          })
          return response
        }

        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.find_tabs',
            application: args.application,
            query: args.query,
            field: args.field,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Find Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_find_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          query: args.query,
          field: args.field || 'either',
          tabs: [],
          totalMatches: 0,
          returnedMatches: 0,
          truncated: false
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_find_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            query: responseRecord.query,
            field: responseRecord.field,
            limit: args.limit,
            totalMatches: responseRecord.totalMatches,
            returnedMatches: responseRecord.returnedMatches,
            truncated: responseRecord.truncated,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Find Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_find_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.find_tabs',
            application: args.application || 'Google Chrome',
            query: args.query,
            field: args.field || 'either',
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeCloseTabsTool = tool(
    'chrome_close_tabs',
    'Find and close matching tabs in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      query: z.string().min(1).describe('Query to match against tab titles, URLs, or domains before closing'),
      field: z.enum(['either', 'title', 'url', 'domain']).optional().describe('Which tab field to match against (default: either)'),
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum number of matching tabs to close'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Close Chrome tabs failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_close_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              adapterId: 'chrome',
              adapterMethodId: 'chrome.close_tabs'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.close_tabs',
            application: args.application,
            query: args.query,
            field: args.field,
            limit: args.limit,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Close Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_close_tabs',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              query: args.query,
              field: args.field || 'either',
              limit: args.limit,
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const responsePayload = execution.data ?? {
          application: args.application || 'Google Chrome',
          query: args.query,
          field: args.field || 'either',
          closedTabs: [],
          requestedMatches: 0,
          closedCount: 0,
          remainingMatches: 0
        }
        const response = {
          content: [{ type: 'text' as const, text: toToolText(responsePayload) }]
        }
        const responseRecord = responsePayload && typeof responsePayload === 'object'
          ? responsePayload as Record<string, unknown>
          : {}
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_close_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: responseRecord.application,
            query: responseRecord.query,
            field: responseRecord.field,
            limit: args.limit,
            requestedMatches: responseRecord.requestedMatches,
            closedCount: responseRecord.closedCount,
            remainingMatches: responseRecord.remainingMatches,
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Close Chrome tabs failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_close_tabs',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.close_tabs',
            application: args.application || 'Google Chrome',
            query: args.query,
            field: args.field || 'either',
            limit: args.limit,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const chromeCloseActiveTabTool = tool(
    'chrome_close_active_tab',
    'Close the active tab in Google Chrome, Chrome, or Chromium through a structured desktop adapter.',
    {
      application: z.enum(['Google Chrome', 'Chrome', 'Chromium']).optional().describe('Browser app to target (default: Google Chrome)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Close active Chrome tab failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_close_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application || 'Google Chrome',
              adapterId: 'chrome',
              adapterMethodId: 'chrome.close_active_tab'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'chrome',
            methodId: 'chrome.close_active_tab',
            application: args.application,
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Close active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'chrome_close_active_tab',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: args.application || 'Google Chrome',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_close_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: args.application || 'Google Chrome',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Close active Chrome tab failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'chrome_close_active_tab',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'chrome',
            adapterMethodId: 'chrome.close_active_tab',
            application: args.application || 'Google Chrome',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const skillsfanOpenSettingsTool = tool(
    'skillsfan_open_settings',
    'Open the SkillsFan settings window through a structured desktop adapter instead of free-form AppleScript.',
    {
      application: z.literal('SkillsFan').optional().describe('SkillsFan app target (default: SkillsFan)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Open settings failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'skillsfan_open_settings',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: 'SkillsFan',
              adapterId: 'skillsfan',
              adapterMethodId: 'skillsfan.open_settings'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'skillsfan',
            methodId: 'skillsfan.open_settings',
            application: 'SkillsFan',
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Open settings failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'skillsfan_open_settings',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'SkillsFan',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'skillsfan_open_settings',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'SkillsFan',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Open settings failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'skillsfan_open_settings',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'skillsfan',
            adapterMethodId: 'skillsfan.open_settings',
            application: 'SkillsFan',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const skillsfanFocusMainWindowTool = tool(
    'skillsfan_focus_main_window',
    'Focus the main SkillsFan window through a structured desktop adapter instead of relying on generic window targeting.',
    {
      application: z.literal('SkillsFan').optional().describe('SkillsFan app target (default: SkillsFan)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('focus_window')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Focus main window failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'skillsfan_focus_main_window',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: 'SkillsFan',
              adapterId: 'skillsfan',
              adapterMethodId: 'skillsfan.focus_main_window'
            }
          })
          return response
        }

        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const execution = await executeDesktopAdapterMethod({
          runtime: hostRuntime.desktop,
          platform: process.platform,
          input: {
            workDir: options.workDir,
            adapterId: 'skillsfan',
            methodId: 'skillsfan.focus_main_window',
            application: 'SkillsFan',
            timeoutMs: args.timeoutMs
          }
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')

        if (execution.result.returnCode !== 0 || execution.result.timedOut) {
          const failure = describeDesktopAutomationFailure(execution.result)
          const response = {
            content: [{
              type: 'text' as const,
              text: `Focus main window failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
            }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'skillsfan_focus_main_window',
            toolArgs: args,
            result: response,
            metadata: {
              adapterId: execution.adapterId,
              adapterMethodId: execution.methodId,
              adapterMethodStage: execution.stage,
              application: 'SkillsFan',
              returnCode: execution.result.returnCode,
              timedOut: execution.result.timedOut,
              errorCode: execution.result.errorCode,
              errorMessage: execution.result.errorMessage
            },
            autoPerception: { before: beforeArtifact, after: afterArtifact }
          })
          return response
        }

        const response = {
          content: [{ type: 'text' as const, text: execution.successText }]
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'skillsfan_focus_main_window',
          toolArgs: args,
          result: response,
          metadata: {
            adapterId: execution.adapterId,
            adapterMethodId: execution.methodId,
            adapterMethodStage: execution.stage,
            application: 'SkillsFan',
            returnCode: execution.result.returnCode,
            timedOut: execution.result.timedOut
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Focus main window failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'skillsfan_focus_main_window',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            adapterId: 'skillsfan',
            adapterMethodId: 'skillsfan.focus_main_window',
            application: 'SkillsFan',
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const regexToolSearch = tool(
    'tool_search_tool_regex',
    'Search the current local tool catalog with a regex pattern. Use this when you need to discover the best available tool before acting.',
    {
      pattern: z.string().min(1).describe('Regex pattern to match against tool names and descriptions'),
      caseSensitive: z.boolean().optional().describe('Whether regex matching should be case-sensitive'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return')
    },
    async (args) => {
      try {
        const result = searchToolsByRegex({
          catalog,
          pattern: args.pattern,
          caseSensitive: args.caseSensitive,
          limit: args.limit
        })
        return {
          content: [{ type: 'text' as const, text: toToolText({ pattern: args.pattern, results: result }) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const bm25ToolSearch = tool(
    'tool_search_tool_bm25',
    'Search the current local tool catalog with keyword relevance ranking.',
    {
      query: z.string().min(1).describe('Natural-language search query'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return')
    },
    async (args) => {
      try {
        const result = searchToolsByBm25({
          catalog,
          query: args.query,
          limit: args.limit
        })
        return {
          content: [{ type: 'text' as const, text: toToolText({ query: args.query, results: result }) }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
      }
    }
  )

  const subagentSpawnTool = options.includeSubagentTools === false
    ? null
    : tool(
        'subagent_spawn',
        'Launch a hosted subagent run managed by the SkillsFan app runtime. Prefer this over Task or TeamCreate when you want reliable background subagents.',
        {
          task: z.string().min(1).describe('The task the hosted subagent should complete'),
          label: z.string().optional().describe('Short label for UI display'),
          model: z.string().optional().describe('Optional model override for this hosted subagent'),
          modelSource: z.string().optional().describe('Optional provider/source override for this hosted subagent'),
          thinkingEffort: z.enum(['off', 'low', 'medium', 'high', 'xhigh']).optional().describe('Optional reasoning effort override'),
          timeoutMs: z.number().int().min(5_000).max(1_800_000).optional().describe('Optional overall timeout for the hosted subagent run')
        },
        async (args, extra) => {
          try {
            const { spawnSubagent } = await import('../agent/subagent/runtime')
            const run = await spawnSubagent({
              parentSpaceId: options.spaceId,
              parentConversationId: options.conversationId,
              workDir: options.workDir,
              task: args.task,
              label: args.label,
              model: args.model,
              modelSource: args.modelSource,
              thinkingEffort: args.thinkingEffort,
              timeoutMs: args.timeoutMs,
              toolUseId: getToolUseId(extra)
            })
            return {
              content: [{
                type: 'text' as const,
                text: toToolText({
                  ok: true,
                  run,
                  next: {
                    tool: 'mcp__local-tools__subagents',
                    action: 'wait',
                    runId: run.runId
                  }
                })
              }]
            }
          } catch (error) {
            return {
              content: [{ type: 'text' as const, text: (error as Error).message }],
              isError: true
            }
          }
        }
      )

  const subagentsTool = options.includeSubagentTools === false
    ? null
    : tool(
        'subagents',
        'Inspect, wait for, or terminate hosted subagent runs created by subagent_spawn in this conversation.',
        {
          action: z.enum(['list', 'info', 'wait', 'kill']),
          runId: z.string().optional().describe('Specific run ID. Omit for list, or to wait on all active hosted subagents in this conversation'),
          limit: z.number().int().min(1).max(20).optional().describe('Maximum number of runs to include when action=list'),
          includeCompleted: z.boolean().optional().describe('Whether action=list should include completed runs'),
          timeoutMs: z.number().int().min(1_000).max(1_800_000).optional().describe('Optional timeout when action=wait')
        },
        async (args) => {
          try {
            const {
              acknowledgeGatewaySubagentRuns,
              getGatewaySubagentRun,
              killGatewaySubagentRun,
              listGatewaySubagentRunsForConversation,
              waitForGatewayConversationSubagents,
              waitForGatewaySubagentRun
            } = await import('../../../gateway/automation/subagents')

            if (args.action === 'list') {
              const runs = listGatewaySubagentRunsForConversation(options.conversationId, {
                includeCompleted: args.includeCompleted,
                limit: args.limit
              })
              acknowledgeGatewaySubagentRuns(
                runs
                  .filter((run) => ['completed', 'failed', 'killed', 'timeout'].includes(run.status))
                  .map((run) => run.runId)
              )
              return {
                content: [{ type: 'text' as const, text: toToolText({ runs }) }]
              }
            }

            if (args.action === 'info') {
              if (!args.runId) {
                throw new Error('runId is required for action=info')
              }
              const run = getGatewaySubagentRun(args.runId)
              if (!run) {
                throw new Error(`Subagent run not found: ${args.runId}`)
              }
              if (['completed', 'failed', 'killed', 'timeout'].includes(run.status)) {
                acknowledgeGatewaySubagentRuns([run.runId])
              }
              return {
                content: [{ type: 'text' as const, text: toToolText({ run }) }]
              }
            }

            if (args.action === 'kill') {
              if (!args.runId) {
                throw new Error('runId is required for action=kill')
              }
              const run = await killGatewaySubagentRun(args.runId)
              if (['completed', 'failed', 'killed', 'timeout'].includes(run.status)) {
                acknowledgeGatewaySubagentRuns([run.runId])
              }
              return {
                content: [{ type: 'text' as const, text: toToolText({ run }) }]
              }
            }

            if (args.runId) {
              const run = await waitForGatewaySubagentRun(args.runId, args.timeoutMs)
              if (['completed', 'failed', 'killed', 'timeout'].includes(run.status)) {
                acknowledgeGatewaySubagentRuns([run.runId])
              }
              return {
                content: [{ type: 'text' as const, text: toToolText({ run }) }]
              }
            }

            const runs = await waitForGatewayConversationSubagents(options.conversationId, args.timeoutMs)
            acknowledgeGatewaySubagentRuns(
              runs
                .filter((run) => ['completed', 'failed', 'killed', 'timeout'].includes(run.status))
                .map((run) => run.runId)
            )
            return {
              content: [{ type: 'text' as const, text: toToolText({ runs }) }]
            }
          } catch (error) {
            return {
              content: [{ type: 'text' as const, text: (error as Error).message }],
              isError: true
            }
          }
        }
      )

  const desktopClickTool = tool(
    'desktop_click',
    'Click at a specific screen coordinate on macOS. Use read_desktop_ui_tree first to find element positions, then click using the coordinates.',
    {
      x: z.number().describe('X coordinate on screen'),
      y: z.number().describe('Y coordinate on screen'),
      button: z.enum(['left', 'right']).optional().describe('Mouse button (default: left)'),
      clickCount: z.number().int().min(1).max(3).optional().describe('Number of clicks (default: 1, use 2 for double-click)')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('click')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Click failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'click',
            toolArgs: args,
            result: response,
            metadata: preflight.metadata
          })
          return response
        }
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.clickAtCoordinate({
          workDir: options.workDir,
          ...args
        })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const text = isError
          ? `Click failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Clicked at (${args.x}, ${args.y})${args.button === 'right' ? ' (right-click)' : ''}${args.clickCount === 2 ? ' (double-click)' : ''}.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'click',
          toolArgs: args,
          result: response,
          metadata: {
            x: args.x,
            y: args.y,
            button: args.button,
            clickCount: args.clickCount,
            returnCode: result.returnCode,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Click failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'click',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopPressKeyTool = tool(
    'desktop_press_key',
    'Press a key or key combination on macOS. Use this for shortcuts like Command+L, Enter, Escape, Tab, or arrow keys.',
    {
      key: z.string().min(1).describe('Key name, such as "Enter", "Escape", "l", or "ArrowDown"'),
      modifiers: z.array(z.enum(['command', 'control', 'option', 'shift'])).optional().describe('Optional modifier keys')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('press_key')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Press key failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'desktop_press_key',
            toolArgs: { key: args.key, modifiers: args.modifiers },
            result: response,
            metadata: {
              ...preflight.metadata,
              key: args.key,
              modifiers: args.modifiers
            }
          })
          return response
        }
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.pressKey({ workDir: options.workDir, ...args })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const shortcut = [...(args.modifiers || []), args.key].join('+')
        const text = isError
          ? `Press key failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Pressed ${shortcut}.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'desktop_press_key',
          toolArgs: { key: args.key, modifiers: args.modifiers },
          result: response,
          metadata: {
            key: args.key,
            modifiers: args.modifiers,
            returnCode: result.returnCode,
            timedOut: result.timedOut,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Press key failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'desktop_press_key',
          toolArgs: { key: args.key, modifiers: args.modifiers },
          result: response,
          metadata: {
            thrown: true,
            key: args.key,
            modifiers: args.modifiers,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopTypeTextTool = tool(
    'desktop_type_text',
    'Type text into the currently focused macOS application. Activate or focus the target app/window first.',
    {
      text: z.string().min(1).describe('Text to type into the focused application')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('type_text')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Type text failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'desktop_type_text',
            toolArgs: { textLength: args.text.length },
            result: response,
            metadata: {
              ...preflight.metadata,
              textLength: args.text.length
            }
          })
          return response
        }
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.typeText({ workDir: options.workDir, text: args.text })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const text = isError
          ? `Type text failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Typed ${args.text.length} characters.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'desktop_type_text',
          toolArgs: { textLength: args.text.length },
          result: response,
          metadata: {
            textLength: args.text.length,
            returnCode: result.returnCode,
            timedOut: result.timedOut,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Type text failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'desktop_type_text',
          toolArgs: { textLength: args.text.length },
          result: response,
          metadata: {
            thrown: true,
            textLength: args.text.length,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopMoveMouseTool = tool(
    'desktop_move_mouse',
    'Move the mouse cursor to a specific screen coordinate on macOS without clicking.',
    {
      x: z.number().describe('X coordinate on screen'),
      y: z.number().describe('Y coordinate on screen')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('move_mouse')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Move mouse failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'move_mouse',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              x: args.x,
              y: args.y
            }
          })
          return response
        }
        const result = await hostRuntime.desktop.moveMouse({ workDir: options.workDir, ...args })
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const text = isError
          ? `Move mouse failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Moved mouse to (${args.x}, ${args.y}).`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'move_mouse',
          toolArgs: args,
          result: response,
          metadata: {
            x: args.x,
            y: args.y,
            returnCode: result.returnCode,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Move mouse failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'move_mouse',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopScrollTool = tool(
    'desktop_scroll',
    'Scroll at a specific screen coordinate on macOS. Moves the mouse to the position first, then scrolls.',
    {
      x: z.number().describe('X coordinate on screen where to scroll'),
      y: z.number().describe('Y coordinate on screen where to scroll'),
      deltaX: z.number().optional().describe('Horizontal scroll amount (positive = right, negative = left)'),
      deltaY: z.number().optional().describe('Vertical scroll amount (positive = down, negative = up)')
    },
    async (args, extra) => {
      try {
        const preflight = await checkDesktopActionPreflight('scroll')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Scroll failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'scroll',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              x: args.x,
              y: args.y,
              deltaX: args.deltaX,
              deltaY: args.deltaY
            }
          })
          return response
        }
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.scroll({ workDir: options.workDir, ...args })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const text = isError
          ? `Scroll failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Scrolled at (${args.x}, ${args.y}) deltaX=${args.deltaX ?? 0} deltaY=${args.deltaY ?? 0}.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'scroll',
          toolArgs: args,
          result: response,
          metadata: {
            x: args.x,
            y: args.y,
            deltaX: args.deltaX,
            deltaY: args.deltaY,
            returnCode: result.returnCode,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Scroll failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'scroll',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopListWindowsTool = tool(
    'desktop_list_windows',
    'List open windows on macOS with their names, positions, sizes, and minimized state. Optionally filter by application name.',
    {
      application: z.string().optional().describe('Optional application name to filter windows (e.g. "Google Chrome")')
    },
    async (args, extra) => {
      const adapter = resolveDesktopAppAdapter(args.application, process.platform)
      try {
        const preflight = await checkDesktopActionPreflight('list_windows')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `List windows failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'list_windows',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application,
              adapterId: adapter.id,
              adapterStage: adapter.stage
            }
          })
          return response
        }
        const result = await hostRuntime.desktop.listWindows({ workDir: options.workDir, ...args })
        const response = { content: [{ type: 'text' as const, text: toToolText(result) }] }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'list_windows',
          toolArgs: args,
          result: response,
          metadata: {
            application: args.application,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            windowCount: result.windows.length
          }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `List windows failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'list_windows',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            application: args.application,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const desktopFocusWindowTool = tool(
    'desktop_focus_window',
    'Focus (bring to front) a specific window on macOS. Activates the application and raises the target window.',
    {
      application: z.string().min(1).describe('Application name (e.g. "Google Chrome", "Finder")'),
      windowName: z.string().optional().describe('Window name/title to focus. If omitted, focuses the first window.'),
      windowIndex: z.number().int().min(1).optional().describe('1-based window index. Use desktop_list_windows to find indices.')
    },
    async (args, extra) => {
      const adapter = resolveDesktopAppAdapter(args.application, process.platform)
      try {
        const preflight = await checkDesktopActionPreflight('focus_window')
        if (preflight) {
          const response = {
            content: [{ type: 'text' as const, text: `Focus window failed (${preflight.errorCode}): ${preflight.detail}` }],
            isError: true
          }
          recordToolExecutionStep({
            defaultTaskId: options.conversationId,
            defaultSpaceId: options.spaceId,
            defaultConversationId: options.conversationId,
            extra,
            category: 'desktop',
            action: 'focus_window',
            toolArgs: args,
            result: response,
            metadata: {
              ...preflight.metadata,
              application: args.application,
              windowName: args.windowName,
              windowIndex: args.windowIndex,
              adapterId: adapter.id,
              adapterStage: adapter.stage
            }
          })
          return response
        }
        const beforeArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'before')
        const result = await hostRuntime.desktop.focusWindow({ workDir: options.workDir, ...args })
        const afterArtifact = await captureDesktopPerceptionArtifact(options.workDir, 'after')
        const isError = result.returnCode !== 0 || result.timedOut
        const failure = isError ? describeDesktopAutomationFailure(result) : undefined
        const windowDesc = args.windowName ? ` "${args.windowName}"` : args.windowIndex ? ` #${args.windowIndex}` : ''
        const text = isError
          ? `Focus window failed${formatDesktopErrorCode(failure?.errorCode)}: ${failure?.detail || 'Unknown error'}`
          : `Focused ${args.application}${windowDesc}.`
        const response = { content: [{ type: 'text' as const, text }], ...(isError && { isError: true }) }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'focus_window',
          toolArgs: args,
          result: response,
          metadata: {
            application: args.application,
            windowName: args.windowName,
            windowIndex: args.windowIndex,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            returnCode: result.returnCode,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage
          },
          autoPerception: { before: beforeArtifact, after: afterArtifact }
        })
        return response
      } catch (error) {
        const failure = describeDesktopAutomationException(error)
        const response = {
          content: [{
            type: 'text' as const,
            text: `Focus window failed${formatDesktopErrorCode(failure.errorCode)}: ${failure.detail}`
          }],
          isError: true
        }
        recordToolExecutionStep({
          defaultTaskId: options.conversationId,
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'desktop',
          action: 'focus_window',
          toolArgs: args,
          result: response,
          metadata: {
            thrown: true,
            application: args.application,
            windowName: args.windowName,
            windowIndex: args.windowIndex,
            adapterId: adapter.id,
            adapterStage: adapter.stage,
            errorCode: failure.errorCode,
            errorMessage: failure.detail
          }
        })
        return response
      }
    }
  )

  const tools: Array<any> = [
    memoryTool,
    codeExecutionTool,
    bashCodeExecutionTool,
    textEditorTool,
    openUrlTool,
    openApplicationTool,
    activateApplicationTool,
    runAppleScriptTool,
    finderRevealPathTool,
    finderOpenFolderTool,
    finderOpenHomeFolderTool,
    finderNewWindowTool,
    finderSearchTool,
    terminalNewTabRunCommandTool,
    terminalRunCommandTool,
    terminalNewWindowRunCommandTool,
    terminalRunCommandInDirectoryTool,
    terminalListSessionsTool,
    terminalListPanesTool,
    terminalGetPaneLayoutTool,
    terminalFocusSessionTool,
    terminalSplitPaneRunCommandTool,
    terminalInterruptProcessTool,
    terminalGetSessionStateTool,
    terminalGetLastCommandResultTool,
    terminalReadOutputTool,
    terminalWaitUntilNotBusyTool,
    terminalWaitForOutputTool,
    terminalWaitUntilIdleTool,
    terminalRunCommandAndWaitTool,
    terminalRunCommandInDirectoryAndWaitTool,
    chromeOpenUrlTool,
    chromeOpenUrlInNewTabTool,
    chromeFocusTabTool,
    chromeNewTabTool,
    chromeReloadActiveTabTool,
    chromeFocusTabByUrlTool,
    chromeListTabsTool,
    chromeWaitForTabTool,
    chromeWaitForActiveTabTool,
    chromeFindTabsTool,
    chromeCloseTabsTool,
    chromeGetActiveTabTool,
    chromeCloseActiveTabTool,
    skillsfanOpenSettingsTool,
    skillsfanFocusMainWindowTool,
    desktopPressKeyTool,
    desktopTypeTextTool,
    desktopClickTool,
    desktopMoveMouseTool,
    desktopScrollTool,
    desktopListWindowsTool,
    desktopFocusWindowTool,
    regexToolSearch,
    bm25ToolSearch
  ]

  if (subagentSpawnTool) {
    tools.push(subagentSpawnTool)
  }

  if (subagentsTool) {
    tools.push(subagentsTool)
  }

  return createSdkMcpServer({
    name: 'local-tools',
    version: '1.0.0',
    tools
  })
}
