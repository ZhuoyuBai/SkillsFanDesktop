import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { normalizeLineRange, resolvePathWithinRoot, truncateText } from './path-utils'

function previewContent(content: string, maxChars: number = 4_000): string {
  return truncateText(content, maxChars)
}

function findOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return []

  const positions: number[] = []
  let fromIndex = 0

  while (fromIndex <= haystack.length) {
    const index = haystack.indexOf(needle, fromIndex)
    if (index === -1) break
    positions.push(index)
    fromIndex = index + needle.length
  }

  return positions
}

function computeLineNumber(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split('\n').length
}

export async function executeTextEditorCommand(args: {
  workDir: string
  command: string
  path: string
  view_range?: number[]
  file_text?: string
  old_str?: string
  new_str?: string
}): Promise<Record<string, unknown>> {
  const resolved = resolvePathWithinRoot(args.workDir, args.path)
  const command = args.command.trim().toLowerCase()

  if (command === 'view') {
    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`File not found: ${resolved.relativePath}`)
    }

    const raw = readFileSync(resolved.absolutePath, 'utf-8')
    const lines = raw.split('\n')
    const range = normalizeLineRange(args.view_range)
    const startLine = range ? range[0] : 1
    const endLine = range ? Math.min(range[1], lines.length) : lines.length
    const selected = lines.slice(startLine - 1, endLine)

    return {
      command: 'view',
      path: resolved.relativePath,
      startLine,
      endLine,
      totalLines: lines.length,
      content: previewContent(selected.join('\n'))
    }
  }

  if (command === 'create') {
    if (typeof args.file_text !== 'string') {
      throw new Error('file_text is required for create.')
    }

    const isFileUpdate = existsSync(resolved.absolutePath)
    mkdirSync(dirname(resolved.absolutePath), { recursive: true })
    writeFileSync(resolved.absolutePath, args.file_text, 'utf-8')

    return {
      command: 'create',
      path: resolved.relativePath,
      isFileUpdate
    }
  }

  if (command === 'str_replace') {
    if (typeof args.old_str !== 'string' || typeof args.new_str !== 'string') {
      throw new Error('old_str and new_str are required for str_replace.')
    }
    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`File not found: ${resolved.relativePath}`)
    }

    const raw = readFileSync(resolved.absolutePath, 'utf-8')
    const occurrences = findOccurrences(raw, args.old_str)

    if (occurrences.length === 0) {
      throw new Error('old_str was not found in the file.')
    }
    if (occurrences.length > 1) {
      throw new Error('old_str matched multiple locations. Use a more specific string.')
    }

    const index = occurrences[0]
    const updated = raw.replace(args.old_str, args.new_str)
    writeFileSync(resolved.absolutePath, updated, 'utf-8')

    const oldStart = computeLineNumber(raw, index)
    const oldLines = args.old_str.split('\n').length
    const newLines = args.new_str.split('\n').length
    const previewLines = updated.split('\n').slice(Math.max(0, oldStart - 3), oldStart + newLines + 2)

    return {
      command: 'str_replace',
      path: resolved.relativePath,
      oldStart,
      oldLines,
      newStart: oldStart,
      newLines,
      content: previewContent(previewLines.join('\n'))
    }
  }

  throw new Error(`Unsupported text editor command "${args.command}". Use view, create, or str_replace.`)
}
