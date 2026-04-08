import { describe, expect, it } from 'vitest'

import {
  SHIFT_ENTER_NEWLINE_PASTE_TEXT,
  shouldHandleShiftEnterNewline,
} from '../../../src/renderer/components/terminal/input-shortcuts'

describe('SHIFT_ENTER_NEWLINE_PASTE_TEXT', () => {
  it('uses a real newline so shift-enter does not inject a visible backslash', () => {
    expect(SHIFT_ENTER_NEWLINE_PASTE_TEXT).toBe('\n')
  })
})

describe('shouldHandleShiftEnterNewline', () => {
  it('handles plain shift-enter keydown events', () => {
    expect(shouldHandleShiftEnterNewline({
      type: 'keydown',
      key: 'Enter',
      shiftKey: true,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    })).toBe(true)
  })

  it('ignores enter without shift', () => {
    expect(shouldHandleShiftEnterNewline({
      type: 'keydown',
      key: 'Enter',
      shiftKey: false,
    })).toBe(false)
  })

  it('ignores modified enter combinations beyond shift', () => {
    expect(shouldHandleShiftEnterNewline({
      type: 'keydown',
      key: 'Enter',
      shiftKey: true,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
    })).toBe(false)
  })

  it('ignores non-keydown events', () => {
    expect(shouldHandleShiftEnterNewline({
      type: 'keyup',
      key: 'Enter',
      shiftKey: true,
    })).toBe(false)
  })
})
