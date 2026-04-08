import { describe, expect, it } from 'vitest'

import { canLaunchTerminal, DEFAULT_CONFIG } from '../../../src/renderer/types'

describe('renderer terminal readiness helpers', () => {
  it('allows launching the terminal with Claude Code login even without configured model APIs', () => {
    expect(canLaunchTerminal({
      ...DEFAULT_CONFIG,
      terminal: {
        ...DEFAULT_CONFIG.terminal,
        skipClaudeLogin: false
      },
      aiSources: {
        current: 'custom'
      }
    })).toBe(true)
  })

  it('requires a configured AI source in custom API terminal mode', () => {
    expect(canLaunchTerminal({
      ...DEFAULT_CONFIG,
      terminal: {
        ...DEFAULT_CONFIG.terminal,
        skipClaudeLogin: true
      },
      aiSources: {
        current: 'custom'
      }
    })).toBe(false)
  })
})
