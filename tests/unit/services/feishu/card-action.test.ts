import { describe, expect, it } from 'vitest'
import { parseFeishuCardActionValue } from '../../../../src/main/services/feishu/card-action'

describe('parseFeishuCardActionValue', () => {
  it('parses direct JSON string payloads', () => {
    const value = parseFeishuCardActionValue('{"action":"tool_approve","conversationId":"conv-1"}')
    expect(value).toEqual({
      action: 'tool_approve',
      conversationId: 'conv-1'
    })
  })

  it('parses double-encoded JSON payloads', () => {
    const value = parseFeishuCardActionValue('"{\\"action\\":\\"tool_approve\\",\\"conversationId\\":\\"conv-2\\"}"')
    expect(value).toEqual({
      action: 'tool_approve',
      conversationId: 'conv-2'
    })
  })

  it('parses URL-encoded JSON payloads', () => {
    const raw = encodeURIComponent('{"action":"tool_reject","conversationId":"conv-3"}')
    const value = parseFeishuCardActionValue(raw)
    expect(value).toEqual({
      action: 'tool_reject',
      conversationId: 'conv-3'
    })
  })

  it('parses query-string payloads', () => {
    const value = parseFeishuCardActionValue('action=tool_approve&conversationId=conv-4&toolCallId=tool-1')
    expect(value).toEqual({
      action: 'tool_approve',
      conversationId: 'conv-4',
      toolCallId: 'tool-1'
    })
  })

  it('parses object payloads with nested value strings', () => {
    const value = parseFeishuCardActionValue({
      value: '{"action":"tool_approve","conversationId":"conv-5"}'
    })
    expect(value).toEqual({
      action: 'tool_approve',
      conversationId: 'conv-5'
    })
  })
})
