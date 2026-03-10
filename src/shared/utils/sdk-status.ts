const ANSI_ESCAPE_SEQUENCE_REGEX = /\x1b\[[0-9;]*m/g
const ANSI_CONTROL_SEQUENCE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const NON_LAYOUT_CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function sanitizeSdkText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_SEQUENCE_REGEX, '')
    .replace(ANSI_CONTROL_SEQUENCE_REGEX, '')
    .replace(NON_LAYOUT_CONTROL_CHARS_REGEX, '')
}

export function normalizeSdkStatusText(text: string): string {
  return sanitizeSdkText(text)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

export function shouldSuppressSetModelStatus(text: string): boolean {
  return normalizeSdkStatusText(text).toLowerCase().startsWith('set model to')
}

export function stripLeadingSetModelStatus(text: string): string {
  let remaining = sanitizeSdkText(text)
  let strippedAny = false

  while (true) {
    const trimmedStart = remaining.replace(/^\s+/, '')
    const match = trimmedStart.match(/^set model to[^\r\n]*(?:\r?\n)*/i)
    if (!match) {
      return strippedAny ? trimmedStart : remaining
    }

    strippedAny = true
    remaining = trimmedStart.slice(match[0].length)
  }
}
