import { z } from 'zod'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { executeCodeSnippet, executeShellCommand } from './code-execution'
import { executeAppleScript, openMacOSApplication } from './macos-ui'
import { executeMemoryCommand } from './memory-tool'
import { executeTextEditorCommand } from './text-editor'
import { buildToolCatalog } from './tool-catalog'
import { searchToolsByBm25, searchToolsByRegex } from './tool-search'

function toToolText(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

export interface CreateLocalToolsMcpServerOptions {
  workDir: string
  spaceId: string
  conversationId: string
  aiBrowserEnabled?: boolean
  includeSkillMcp?: boolean
}

export function createLocalToolsMcpServer(options: CreateLocalToolsMcpServerOptions) {
  const catalog = buildToolCatalog({
    aiBrowserEnabled: options.aiBrowserEnabled,
    includeSkillMcp: options.includeSkillMcp
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
    'Open a real macOS application, optionally with a URL or file target. Use this to launch the user\'s actual Google Chrome instead of the sandboxed AI browser.',
    {
      application: z.string().min(1).describe('macOS application name, such as "Google Chrome" or "Safari"'),
      target: z.string().optional().describe('Optional URL or file path to open with the application'),
      activate: z.boolean().optional().describe('Whether to bring the application to the front (default: true)'),
      timeoutMs: z.number().int().min(1_000).max(120_000).optional().describe('Execution timeout in milliseconds')
    },
    async (args) => {
      try {
        const result = await openMacOSApplication({
          workDir: options.workDir,
          application: args.application,
          target: args.target,
          activate: args.activate,
          timeoutMs: args.timeoutMs
        })

        if (result.returnCode !== 0 || result.timedOut) {
          const detail = result.stderr || result.stdout || 'Unknown error'
          return {
            content: [{ type: 'text' as const, text: `Failed to open ${args.application}: ${detail}` }],
            isError: true
          }
        }

        const targetText = args.target ? ` with ${args.target}` : ''
        return {
          content: [{ type: 'text' as const, text: `Opened ${args.application}${targetText}.` }]
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true
        }
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
    async (args) => {
      try {
        const result = await executeAppleScript({
          workDir: options.workDir,
          script: args.script,
          timeoutMs: args.timeoutMs
        })

        if (result.returnCode !== 0 || result.timedOut) {
          const detail = result.stderr || result.stdout || 'Unknown error'
          return {
            content: [{ type: 'text' as const, text: `AppleScript failed: ${detail}` }],
            isError: true
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: result.stdout.trim() ? `AppleScript completed:\n${result.stdout.trim()}` : 'AppleScript completed.'
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

  return createSdkMcpServer({
    name: 'local-tools',
    version: '1.0.0',
    tools: [
      memoryTool,
      codeExecutionTool,
      bashCodeExecutionTool,
      textEditorTool,
      openUrlTool,
      openApplicationTool,
      runAppleScriptTool,
      regexToolSearch,
      bm25ToolSearch
    ]
  })
}
