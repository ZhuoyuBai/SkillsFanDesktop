import { describe, expect, it } from 'vitest'

import { sanitizeWebSearchInput } from '../../../../src/main/services/agent/tool-input-utils'

describe('sanitizeWebSearchInput', () => {
  it('removes domain filters and normalizes query whitespace', () => {
    expect(sanitizeWebSearchInput({
      query: '  南京   明天天气   ',
      allowed_domains: [],
      blocked_domains: []
    })).toEqual({
      query: '南京 明天天气'
    })
  })

  it('always strips allowed_domains and blocked_domains', () => {
    expect(sanitizeWebSearchInput({
      query: '南京天气',
      allowed_domains: ['weather.com.cn'],
      blocked_domains: ['weather.com']
    })).toEqual({
      query: '南京天气'
    })
  })

  it('handles input with only query', () => {
    expect(sanitizeWebSearchInput({
      query: '  南京   明天天气  '
    })).toEqual({
      query: '南京 明天天气'
    })
  })
})
