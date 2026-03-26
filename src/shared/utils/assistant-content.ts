const WHITESPACE_ONLY_LINE_RE = /^[ \t]+$/
const FENCE_RE = /^(?:```|~~~)/
const LIST_RE = /^(?:[-*+]\s|\d+\.\s|\[[ xX]\]\s)/
const BLOCK_RE = /^(?:#{1,6}\s|>\s?|[-*_]{3,}\s*$|\|)/
const PLAIN_TEXTISH_RE = /^(?:\*\*|__|~~|[A-Za-z\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u

function countIndent(line: string): number {
  let indent = 0
  for (const char of line) {
    if (char === ' ') {
      indent += 1
      continue
    }
    if (char === '\t') {
      indent += 2
      continue
    }
    break
  }
  return indent
}

export function normalizeAssistantContent(content: string): string {
  if (!content) return ''

  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let inFence = false

  for (const rawLine of lines) {
    if (WHITESPACE_ONLY_LINE_RE.test(rawLine)) {
      output.push('')
      continue
    }

    const trimmedEnd = rawLine.replace(/[ \t]+$/g, '')
    const trimmedStart = trimmedEnd.trimStart()
    const indent = countIndent(trimmedEnd)

    if (FENCE_RE.test(trimmedStart)) {
      inFence = !inFence
      output.push(trimmedStart)
      continue
    }

    if (inFence) {
      output.push(trimmedEnd)
      continue
    }

    if (!trimmedStart) {
      output.push('')
      continue
    }

    if (indent <= 3) {
      output.push(trimmedStart)
      continue
    }

    if (LIST_RE.test(trimmedStart) || BLOCK_RE.test(trimmedStart)) {
      output.push(trimmedEnd)
      continue
    }

    if (PLAIN_TEXTISH_RE.test(trimmedStart)) {
      output.push(trimmedStart)
      continue
    }

    output.push(trimmedEnd)
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
