/**
 * Minimal YAML frontmatter parser for SKILL.md.
 * Supports leading whitespace, BOM, quoted values, and simple block scalars.
 */

export interface FrontmatterResult {
  data: Record<string, string>
  body: string
}

const FRONTMATTER_RE = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/

function stripBom(input: string): string {
  return input.replace(/^\uFEFF/, '')
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function readBlock(lines: string[], startIndex: number): { block: string[]; nextIndex: number } {
  const block: string[] = []
  let indent: number | undefined
  let i = startIndex

  for (; i < lines.length; i++) {
    const line = lines[i]
    if (indent === undefined) {
      if (line.trim() === '') {
        block.push('')
        continue
      }
      indent = line.match(/^(\s*)/)?.[1].length ?? 0
    }

    if (line.trim() === '') {
      block.push('')
      continue
    }

    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0
    if (lineIndent < (indent ?? 0)) break

    block.push(line.slice(indent))
  }

  return { block, nextIndex: i - 1 }
}

function foldBlock(lines: string[]): string {
  const parts: string[] = []
  let current = ''

  for (const line of lines) {
    if (line === '') {
      if (current) {
        parts.push(current)
        current = ''
      }
      parts.push('')
      continue
    }

    if (current) current += ` ${line}`
    else current = line
  }

  if (current) parts.push(current)

  return parts.join('\n')
}

function parseYamlFrontmatter(yaml: string): Record<string, string> {
  const data: Record<string, string> = {}
  const lines = yaml.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue

    const match = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/)
    if (!match) continue

    const key = match[1].toLowerCase()
    let value = match[2].trim()

    if (value.startsWith('|') || value.startsWith('>')) {
      const { block, nextIndex } = readBlock(lines, i + 1)
      i = nextIndex
      value = value.startsWith('>') ? foldBlock(block).trim() : block.join('\n').trim()
    } else {
      value = stripQuotes(value)
    }

    data[key] = value
  }

  return data
}

export function parseFrontmatter(content: string): FrontmatterResult | null {
  const normalized = stripBom(content)
  const match = normalized.match(FRONTMATTER_RE)
  if (!match) return null

  const data = parseYamlFrontmatter(match[1])
  const body = normalized.slice(match[0].length).trim()

  return { data, body }
}
