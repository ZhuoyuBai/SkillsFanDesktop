import { trimBoundaryBlankLines } from './linear-stream-text'

const EXPLICIT_RICH_MARKDOWN_RE = /(^|\n)\s*(?:```|~~~|#{1,6}\s|>\s|!\[[^\]]*\]\([^)]+\)|<[^>\n]+>)/
const TABLE_RE = /(^|\n)\s*\|.+\|\s*(\n|$)/
const LIST_RE = /^(?:[-*+]\s|\d+\.\s|•\s)/
const TOOLISH_LINE_RE = /^(?:Bash|Read|Write|Edit|Glob|Grep|WebFetch|WebSearch|Task|Skill)\b|^\{.+\}$|^\w+\(/
const INLINE_RICH_MARKDOWN_RE = /(?:\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/

function countLeadingIndent(line: string): number {
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

function trimIndent(line: string, amount: number): string {
  if (!line.trim()) return ''

  let removed = 0
  let index = 0
  while (index < line.length && removed < amount) {
    const char = line[index]
    if (char === ' ') {
      removed += 1
      index += 1
      continue
    }
    if (char === '\t') {
      removed += 2
      index += 1
      continue
    }
    break
  }
  return line.slice(index)
}

export function normalizeCompactLogText(content: string): string {
  const normalized = trimBoundaryBlankLines(content.replace(/\r\n?/g, '\n'))
    .replace(/\n{3,}/g, '\n\n')

  const lines = normalized.split('\n')
  const nonEmptyLines = lines.filter(line => line.trim())
  if (nonEmptyLines.length === 0) return ''

  const indents = nonEmptyLines.map(countLeadingIndent)
  const indentedLines = indents.filter(indent => indent >= 2)

  if (indentedLines.length >= Math.ceil(nonEmptyLines.length * 0.6)) {
    const minIndent = Math.min(...indentedLines)
    if (minIndent >= 2 && minIndent <= 8) {
      return lines
        .map(line => trimIndent(line, minIndent))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
    }
  }

  return normalized
}

export function shouldUseCompactLogText(content: string, preferCompact = false): boolean {
  const normalized = normalizeCompactLogText(content)
  if (!normalized) return false

  if (
    EXPLICIT_RICH_MARKDOWN_RE.test(normalized)
    || TABLE_RE.test(normalized)
    || INLINE_RICH_MARKDOWN_RE.test(normalized)
  ) {
    return false
  }

  const nonEmptyLines = normalized
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())

  if (nonEmptyLines.length < 3) return false

  const shortRatio = nonEmptyLines.filter(line => line.trim().length <= 120).length / nonEmptyLines.length
  const indentedCount = nonEmptyLines.filter(line => countLeadingIndent(line) >= 2).length
  const listCount = nonEmptyLines.filter((line) => LIST_RE.test(line.trimStart())).length
  const toolishCount = nonEmptyLines.filter((line) => TOOLISH_LINE_RE.test(line.trimStart())).length
  const plainShortLineCount = nonEmptyLines.filter((line) => {
    const trimmed = line.trimStart()
    return !LIST_RE.test(trimmed) && !TOOLISH_LINE_RE.test(trimmed) && trimmed.length <= 80
  }).length

  if (shortRatio < 0.8) return false

  if (preferCompact) {
    return indentedCount > 0 || toolishCount >= 1 || (listCount >= 1 && plainShortLineCount >= 1)
  }

  return indentedCount >= 2 || toolishCount >= 1 || (listCount >= 2 && plainShortLineCount >= 2)
}
