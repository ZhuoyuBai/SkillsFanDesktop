import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  sendToRenderer: vi.fn()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  sendToRenderer: mocks.sendToRenderer
}))

import { executeNativeFunctionTool } from '../../../../src/gateway/runtime/native/tool-executor'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'
import {
  resetNativeRuntimeInteractionForTests,
  resolveNativeUserQuestion
} from '../../../../src/gateway/runtime/native/interaction'
import { NATIVE_BUILTIN_PROVIDER_ID } from '../../../../src/gateway/tools/types'

describe('executeNativeFunctionTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativeRuntimeInteractionForTests()
    mocks.getConfig.mockReturnValue({
      browserAutomation: { mode: 'system-browser' },
      permissions: {
        commandExecution: 'allow',
        trustMode: false
      }
    })
  })

  it('executes an in-process SDK MCP tool and returns text output', async () => {
    const localToolsServer = createSdkMcpServer({
      name: 'local-tools',
      version: '1.0.0',
      tools: [
        tool(
          'open_url',
          'Open a URL.',
          {
            url: z.string().url()
          },
          async (args) => ({
            content: [{ type: 'text' as const, text: `opened:${args.url}` }]
          })
        )
      ]
    })

    const result = await executeNativeFunctionTool({
      mcpServers: {
        'local-tools': localToolsServer
      },
      tool: {
        name: 'mcp__local-tools__open_url',
        providerId: 'local-tools',
        sourceToolName: 'open_url',
        description: 'Open a URL.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string' }
          },
          required: ['url'],
          additionalProperties: false
        },
        strict: false
      },
      args: {
        url: 'https://example.com'
      },
      workDir: '/tmp/work'
    })

    expect(result).toEqual({
      outputText: 'opened:https://example.com',
      isError: false
    })
  })

  it('returns an explicit approval error for approval-gated tools in ask mode', async () => {
    mocks.getConfig.mockReturnValue({
      browserAutomation: { mode: 'system-browser' },
      permissions: {
        commandExecution: 'ask',
        trustMode: false
      }
    })

    const localToolsServer = createSdkMcpServer({
      name: 'local-tools',
      version: '1.0.0',
      tools: [
        tool(
          'terminal_run_command',
          'Run a command.',
          {
            command: z.string()
          },
          async () => ({
            content: [{ type: 'text' as const, text: 'ok' }]
          })
        )
      ]
    })

    const result = await executeNativeFunctionTool({
      mcpServers: {
        'local-tools': localToolsServer
      },
      tool: {
        name: 'mcp__local-tools__terminal_run_command',
        providerId: 'local-tools',
        sourceToolName: 'terminal_run_command',
        description: 'Run a command.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' }
          },
          required: ['command'],
          additionalProperties: false
        },
        strict: false
      },
      args: {
        command: 'echo hi'
      },
      workDir: '/tmp/work'
    })

    expect(result).toEqual({
      outputText: getNativeUserFacingMessage('approvalUnavailable'),
      isError: true
    })
  })

  it('asks the user a structured follow-up question through the built-in native tool bridge', async () => {
    const execution = executeNativeFunctionTool({
      mcpServers: {},
      tool: {
        name: 'app__ask_user_question',
        providerId: NATIVE_BUILTIN_PROVIDER_ID,
        sourceToolName: 'AskUserQuestion',
        description: 'Ask the user one short follow-up question.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string' }
          },
          required: ['question'],
          additionalProperties: false
        },
        strict: false
      },
      args: {
        question: '你想继续处理哪一个项目？',
        header: '请选择',
        options: [
          { label: 'web-app', description: '继续处理前台项目' },
          { label: 'admin-panel', description: '继续处理后台项目' }
        ]
      },
      workDir: '/tmp/work',
      spaceId: 'space-1',
      conversationId: 'conv-question'
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:user-question',
      'space-1',
      'conv-question',
      expect.objectContaining({
        questions: [
          expect.objectContaining({
            header: '请选择',
            question: '你想继续处理哪一个项目？',
            options: [
              { label: 'web-app', description: '继续处理前台项目' },
              { label: 'admin-panel', description: '继续处理后台项目' }
            ]
          })
        ]
      })
    )

    expect(resolveNativeUserQuestion('conv-question', {
      '你想继续处理哪一个项目？': 'web-app'
    })).toBe(true)

    const result = await execution
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.outputText)).toEqual({
      question: '你想继续处理哪一个项目？',
      answers: {
        '你想继续处理哪一个项目？': 'web-app'
      },
      primaryAnswer: 'web-app'
    })
  })
})
