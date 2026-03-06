import { describe, expect, it } from 'vitest'

import { sanitizeWebSearchInput } from '../../../../src/main/services/agent/tool-input-utils'

describe('sanitizeWebSearchInput', () => {
  it('removes empty domain filters and normalizes query whitespace', () => {
    expect(sanitizeWebSearchInput({
      query: '  南京   明天天气   ',
      allowed_domains: [],
      blocked_domains: []
    })).toEqual({
      query: '南京 明天天气'
    })
  })

  it('prefers allowed_domains when both domain filters are present', () => {
    expect(sanitizeWebSearchInput({
      query: '南京天气',
      allowed_domains: ['Weather.com.cn', 'weather.com.cn'],
      blocked_domains: ['weather.com']
    })).toEqual({
      query: '南京天气',
      allowed_domains: ['weather.com.cn']
    })
  })

  it('drops blank blocked_domains entries before validation', () => {
    expect(sanitizeWebSearchInput({
      query: '  南京   明天天气  ',
      blocked_domains: ['   ', '']
    })).toEqual({
      query: '南京 明天天气'
    })
  })
})
