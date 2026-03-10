import { describe, expect, it } from 'vitest'

import { parseSDKMessage, shouldSuppressSdkStatus } from '../../../../src/main/services/agent/message-utils'
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
