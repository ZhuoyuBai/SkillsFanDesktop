import { describe, expect, it } from 'vitest'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { buildNativeFunctionToolDefinitions } from '../../../../src/gateway/tools/native-tools'
import { NATIVE_BUILTIN_PROVIDER_ID } from '../../../../src/gateway/tools/types'

describe('buildNativeFunctionToolDefinitions', () => {
  it('extracts native-capable SDK MCP tools into OpenAI function definitions', () => {
    const localToolsServer = createSdkMcpServer({
      name: 'local-tools',
      version: '1.0.0',
      tools: [
        tool(
          'open_url',
          'Open a URL in the default browser.',
          {
            url: z.string().url(),
            background: z.boolean().optional()
          },
          async () => ({
            content: [{ type: 'text' as const, text: 'ok' }]
          })
        )
      ]
    })

    const definitions = buildNativeFunctionToolDefinitions({
      mcpServers: {
        'local-tools': localToolsServer,
        skill: { type: 'stdio', command: 'skill-mcp' }
      },
      providers: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        },
        {
          id: 'skill',
          kind: 'mcp',
          source: 'app',
          description: 'skill tools',
          runtimeKinds: ['claude-sdk']
        }
      ]
    })

    expect(definitions).toHaveLength(2)
    expect(definitions).toEqual(expect.arrayContaining([
      {
        name: 'app__ask_user_question',
        providerId: NATIVE_BUILTIN_PROVIDER_ID,
        sourceToolName: 'AskUserQuestion',
        description: 'Pause and ask the user one short follow-up question when a key detail is still unclear.',
        parameters: {
          type: 'object',
          properties: expect.objectContaining({
            question: expect.objectContaining({ type: 'string' }),
            header: expect.objectContaining({ type: 'string' }),
            options: expect.objectContaining({ type: 'array' })
          }),
          required: ['question'],
          additionalProperties: false
        },
        strict: false
      },
      {
      name: 'mcp__local-tools__open_url',
      providerId: 'local-tools',
      sourceToolName: 'open_url',
      description: 'Open a URL in the default browser.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            format: 'uri'
          },
          background: {
            type: 'boolean'
          }
        },
        required: ['url'],
        additionalProperties: false
      },
      strict: false
      }
    ]))
  })

  it('skips disabled SDK tools', () => {
    const localToolsServer = createSdkMcpServer({
      name: 'local-tools',
      version: '1.0.0',
      tools: [
        tool(
          'hidden_tool',
          'Should not be exposed.',
          {
            query: z.string()
          },
          async () => ({
            content: [{ type: 'text' as const, text: 'ok' }]
          })
        )
      ]
    })

    ;(localToolsServer.instance as any)._registeredTools.hidden_tool.enabled = false

    const definitions = buildNativeFunctionToolDefinitions({
      mcpServers: {
        'local-tools': localToolsServer
      },
      providers: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['native']
        }
      ]
    })

    expect(definitions).toEqual([
      expect.objectContaining({
        name: 'app__ask_user_question',
        providerId: NATIVE_BUILTIN_PROVIDER_ID,
        sourceToolName: 'AskUserQuestion'
      })
    ])
  })
})
