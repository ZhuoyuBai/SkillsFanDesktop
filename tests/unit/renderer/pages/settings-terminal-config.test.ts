import { describe, expect, it } from 'vitest'

import { mergeTerminalConfig } from '../../../../src/renderer/pages/settings-terminal-config'

describe('mergeTerminalConfig', () => {
  it('preserves sibling terminal toggles when updating one field', () => {
    expect(mergeTerminalConfig({
      skipClaudeLogin: true,
      noFlicker: true,
      skipPermissions: true,
      shiftEnterNewline: true,
    }, {
      noFlicker: false,
    })).toEqual({
      skipClaudeLogin: true,
      noFlicker: false,
      skipPermissions: true,
      shiftEnterNewline: true,
    })
  })

  it('fills missing terminal fields from defaults', () => {
    expect(mergeTerminalConfig(undefined, {
      shiftEnterNewline: true,
    })).toEqual({
      skipClaudeLogin: true,
      noFlicker: false,
      skipPermissions: false,
      shiftEnterNewline: true,
    })
  })
})
