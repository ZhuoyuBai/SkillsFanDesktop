import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { getSpace } from '../space.service'
import { getMemoryIndexManager } from '../memory'
import { normalizeLineRange, truncateText } from './path-utils'

function getWorkspaceRoot(spaceId: string, workDir: string): { workspaceRoot: string; isTemp: boolean } {
  const space = getSpace(spaceId)
  if (!space) {
    return { workspaceRoot: workDir, isTemp: false }
  }
  return {
    workspaceRoot: space.path,
    isTemp: space.isTemp
  }
}

function normalizeMemoryPath(inputPath?: string): string {
  const normalized = (inputPath || 'MEMORY.md')
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')

  return normalized || 'MEMORY.md'
}

function resolveMemoryPath(workspaceRoot: string, inputPath?: string): { absolutePath: string; relativePath: string } {
  const rawPath = (inputPath || 'MEMORY.md').trim()
  const absolutePath = isAbsolute(rawPath)
    ? resolve(rawPath)
    : join(workspaceRoot, normalizeMemoryPath(rawPath))
  const relativePath = relative(workspaceRoot, absolutePath).split('\\').join('/') || 'MEMORY.md'

  if (relativePath !== 'MEMORY.md' && relativePath !== 'memory' && !relativePath.startsWith('memory/')) {
    throw new Error('Memory tool paths must stay inside MEMORY.md or memory/.')
  }

  return {
    absolutePath,
    relativePath
  }
}

function ensureWritableMemoryWorkspace(spaceId: string, workDir: string): string {
  const { workspaceRoot, isTemp } = getWorkspaceRoot(spaceId, workDir)
  if (isTemp) {
    throw new Error('Project memory files are unavailable in temporary spaces.')
  }
  return workspaceRoot
}

function renderMemoryView(path: string, raw: string, viewRange?: number[]): Record<string, unknown> {
  const lines = raw.split('\n')
  const range = normalizeLineRange(viewRange)
  const startLine = range ? range[0] : 1
  const endLine = range ? Math.min(range[1], lines.length) : lines.length
  const content = lines.slice(startLine - 1, endLine).join('\n')

  return {
    command: 'view',
    path,
    startLine,
    endLine,
    totalLines: lines.length,
    content: truncateText(content, 6_000)
  }
}

export async function executeMemoryCommand(args: {
  workDir: string
  spaceId: string
  conversationId: string
  command: string
  query?: string
  limit?: number
  path?: string
  view_range?: number[]
  file_text?: string
  insert_line?: number
  insert_text?: string
  old_str?: string
  new_str?: string
  old_path?: string
  new_path?: string
}): Promise<Record<string, unknown>> {
  const command = args.command.trim().toLowerCase()

  if (command === 'search') {
    if (!args.query?.trim()) {
      throw new Error('query is required for memory search.')
    }

    const manager = getMemoryIndexManager()
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit || 5)))
    // Warm embedding for semantic search before querying
    await manager.warmQueryEmbedding(args.query)
    let results = manager.searchRelevant(args.spaceId, args.query, args.conversationId, limit)

    if (results.length < 2) {
      const recent = manager.getRecentFragments(args.spaceId, args.conversationId, limit)
      const seen = new Set(results.map((item) => item.id))
      for (const fragment of recent) {
        if (!seen.has(fragment.id)) {
          results.push(fragment)
          seen.add(fragment.id)
        }
      }
      results = results.slice(0, limit)
    }

    return {
      command: 'search',
      query: args.query,
      total: results.length,
      results: results.map((fragment) => ({
        conversationId: fragment.conversation_id,
        conversationTitle: fragment.conversation_title,
        role: fragment.role,
        createdAt: fragment.created_at,
        content: truncateText(fragment.content, 500)
      }))
    }
  }

  const workspaceRoot = ensureWritableMemoryWorkspace(args.spaceId, args.workDir)

  if (command === 'view') {
    const resolved = resolveMemoryPath(workspaceRoot, args.path)

    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`Memory path not found: ${resolved.relativePath}`)
    }

    const stats = statSync(resolved.absolutePath)
    if (stats.isDirectory()) {
      return {
        command: 'view',
        path: resolved.relativePath,
        entries: readdirSync(resolved.absolutePath).sort()
      }
    }

    return renderMemoryView(resolved.relativePath, readFileSync(resolved.absolutePath, 'utf-8'), args.view_range)
  }

  if (command === 'create') {
    if (typeof args.file_text !== 'string') {
      throw new Error('file_text is required for create.')
    }

    const resolved = resolveMemoryPath(workspaceRoot, args.path)
    const isFileUpdate = existsSync(resolved.absolutePath)
    mkdirSync(dirname(resolved.absolutePath), { recursive: true })
    writeFileSync(resolved.absolutePath, args.file_text, 'utf-8')

    return {
      command: 'create',
      path: resolved.relativePath,
      isFileUpdate
    }
  }

  if (command === 'insert') {
    if (typeof args.insert_text !== 'string') {
      throw new Error('insert_text is required for insert.')
    }

    const resolved = resolveMemoryPath(workspaceRoot, args.path)
    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`Memory path not found: ${resolved.relativePath}`)
    }

    const raw = readFileSync(resolved.absolutePath, 'utf-8')
    const lines = raw.split('\n')
    const insertLine = Math.max(1, Math.floor(args.insert_line || (lines.length + 1)))
    lines.splice(insertLine - 1, 0, args.insert_text)
    writeFileSync(resolved.absolutePath, lines.join('\n'), 'utf-8')

    return {
      command: 'insert',
      path: resolved.relativePath,
      insertLine
    }
  }

  if (command === 'str_replace') {
    if (typeof args.old_str !== 'string' || typeof args.new_str !== 'string') {
      throw new Error('old_str and new_str are required for str_replace.')
    }

    const resolved = resolveMemoryPath(workspaceRoot, args.path)
    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`Memory path not found: ${resolved.relativePath}`)
    }

    const raw = readFileSync(resolved.absolutePath, 'utf-8')
    const occurrences = raw.split(args.old_str).length - 1

    if (occurrences === 0) {
      throw new Error('old_str was not found in the target memory file.')
    }
    if (occurrences > 1) {
      throw new Error('old_str matched multiple locations. Use a more specific string.')
    }

    writeFileSync(resolved.absolutePath, raw.replace(args.old_str, args.new_str), 'utf-8')

    return {
      command: 'str_replace',
      path: resolved.relativePath,
      replaced: true
    }
  }

  if (command === 'delete') {
    const resolved = resolveMemoryPath(workspaceRoot, args.path)
    if (!existsSync(resolved.absolutePath)) {
      throw new Error(`Memory path not found: ${resolved.relativePath}`)
    }

    rmSync(resolved.absolutePath, { recursive: true, force: false })
    return {
      command: 'delete',
      path: resolved.relativePath
    }
  }

  if (command === 'rename') {
    const oldResolved = resolveMemoryPath(workspaceRoot, args.old_path)
    const newResolved = resolveMemoryPath(workspaceRoot, args.new_path)

    if (!existsSync(oldResolved.absolutePath)) {
      throw new Error(`Memory path not found: ${oldResolved.relativePath}`)
    }

    mkdirSync(dirname(newResolved.absolutePath), { recursive: true })
    renameSync(oldResolved.absolutePath, newResolved.absolutePath)

    return {
      command: 'rename',
      oldPath: oldResolved.relativePath,
      newPath: newResolved.relativePath
    }
  }

  throw new Error(`Unsupported memory command "${args.command}". Use search, view, create, insert, str_replace, delete, or rename.`)
}
