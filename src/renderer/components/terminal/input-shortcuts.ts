export interface TerminalShortcutKeyboardEvent {
  type: string
  key: string
  shiftKey: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

// xterm paste uses bracketed paste mode when available, which lets Claude Code
// treat the inserted newline as prompt content instead of a submitted Enter key.
export const SHIFT_ENTER_NEWLINE_PASTE_TEXT = '\n'

export function shouldHandleShiftEnterNewline(
  event: TerminalShortcutKeyboardEvent
): boolean {
  return event.type === 'keydown'
    && event.key === 'Enter'
    && event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
}
