import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import {
  resetNativeRuntimeInteractionForTests,
  resolveNativeToolApproval
} from '../../../../src/gateway/runtime/native/interaction'

describe('executeNativeFunctionTool approval flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativeRuntimeInteractionForTests()
    mocks.getConfig.mockReturnValue({
      browserAutomation: { mode: 'system-browser' },
      permissions: {
        commandExecution: 'ask',
        trustMode: false
      }
    })
  })

  it('waits for native tool approval when conversation context is provided', async () => {
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

    const execution = executeNativeFunctionTool({
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
      workDir: '/tmp/work',
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command',
        status: 'waiting_approval'
      })
    )

    expect(resolveNativeToolApproval('conv-1', true)).toBe(true)

    await expect(execution).resolves.toEqual({
      outputText: 'ok',
      isError: false
    })
  })
})
