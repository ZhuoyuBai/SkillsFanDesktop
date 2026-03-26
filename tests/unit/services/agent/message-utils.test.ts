import { describe, expect, it } from 'vitest'

import {
  parseSDKMessage,
  parseSDKMessageThoughts,
  shouldSuppressSdkStatus
} from '../../../../src/main/services/agent/message-utils'
import { stripLeadingSetModelStatus } from '../../../../src/shared/utils/sdk-status'

describe('parseSDKMessage', () => {
  it('sanitizes WebSearch tool inputs for display and dedupe logic', () => {
    const thought = parseSDKMessage({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'WebSearch',
            input: {
              query: '  南京   明天天气  ',
              allowed_domains: [],
              blocked_domains: ['']
            }
          }
        ]
      }
    })

    expect(thought).toMatchObject({
      id: 'tool-1',
      type: 'tool_use',
      toolName: 'WebSearch',
      toolInput: {
        query: '南京 明天天气'
      }
    })
  })
})

describe('parseSDKMessageThoughts', () => {
  it('normalizes routed web-search blocks into visible tool activity', () => {
    const thoughts = parseSDKMessageThoughts({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'server_tool_use',
            id: 'srvtool-1',
            name: 'web_search',
            input: { query: ' latest minimax 2.7 news ' }
          },
          {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtool-1',
            content: [
              { type: 'web_search_result', title: 'MiniMax 2.7 released', url: 'https://example.com/news' }
            ]
          },
          {
            type: 'text',
            text: '已经整理好了。'
          }
        ]
      }
    })

    expect(thoughts).toEqual([
      expect.objectContaining({
        id: 'srvtool-1',
        type: 'tool_use',
        toolName: 'WebSearch',
        toolInput: { query: 'latest minimax 2.7 news' }
      }),
      expect.objectContaining({
        id: 'srvtool-1',
        type: 'tool_result',
        toolName: 'WebSearch',
        toolOutput: 'MiniMax 2.7 released - https://example.com/news'
      }),
      expect.objectContaining({
        type: 'text',
        content: '已经整理好了。'
      })
    ])
  })
})

describe('shouldSuppressSdkStatus', () => {
  it('suppresses set model status lines', () => {
    expect(shouldSuppressSdkStatus('Set model to MiniMax-M2.1')).toBe(true)
    expect(shouldSuppressSdkStatus('\u001B[32mSet model to MiniMax-M2.1\u001B[0m')).toBe(true)
  })

  it('keeps useful status lines visible', () => {
    expect(shouldSuppressSdkStatus('Connecting to MCP server...')).toBe(false)
  })
})

describe('stripLeadingSetModelStatus', () => {
  it('removes only the leading set-model status line', () => {
    expect(stripLeadingSetModelStatus('Set model to GLM-5\n\n正常回答')).toBe('正常回答')
    expect(stripLeadingSetModelStatus('\u001B[32mSet model to GLM-5\u001B[0m\n\n正常回答')).toBe('正常回答')
  })
})

describe('parseSDKMessage status-prefixed text', () => {
  it('keeps assistant text after stripping the set-model prefix', () => {
    const thought = parseSDKMessage({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Set model to GLM-5\n\n我来帮你创建一个辩论队。'
          }
        ]
      }
    })

    expect(thought).toMatchObject({
      type: 'text',
      content: '我来帮你创建一个辩论队。'
    })
  })
})
