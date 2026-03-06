import { describe, expect, it } from 'vitest'

import { parseSDKMessage } from '../../../../src/main/services/agent/message-utils'

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
