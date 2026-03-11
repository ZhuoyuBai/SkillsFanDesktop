import path from 'path'
import { homedir } from 'os'

export interface ResolvedPath {
  absolutePath: string
  relativePath: string
}

export function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const absoluteRoot = path.resolve(rootDir)
  const absoluteTarget = path.resolve(targetPath)

  return (
    absoluteTarget === absoluteRoot
    || absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)
  )
}

export function resolvePathWithinRoot(rootDir: string, targetPath: string): ResolvedPath {
  const absoluteRoot = path.resolve(rootDir)
  const absolutePath = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(absoluteRoot, targetPath)

  if (!isWithinRoot(absoluteRoot, absolutePath)) {
    throw new Error(`Path is outside the current workspace: ${targetPath}`)
  }

  const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join('/')

  return {
    absolutePath,
    relativePath: relativePath || '.'
  }
}

export function clampRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function normalizeLineRange(range?: number[]): [number, number] | null {
  if (!Array.isArray(range) || range.length === 0) return null

  const first = Math.max(1, Math.floor(range[0] || 1))
  const second = Math.max(first, Math.floor((range[1] || range[0] || first)))
  return [first, second]
}

export function truncateText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value
}

function normalizeFileUrl(targetPath: string): string {
  if (!targetPath.startsWith('file://')) {
    return targetPath
  }

  try {
    const parsed = new URL(targetPath)
    return decodeURIComponent(parsed.pathname)
  } catch {
    return targetPath
  }
}

function normalizeMacOSHfsPath(targetPath: string): string {
  if (
    process.platform !== 'darwin'
    || path.isAbsolute(targetPath)
    || targetPath.includes('/')
    || targetPath.includes('\\')
    || !targetPath.includes(':')
  ) {
    return targetPath
  }

  const segments = targetPath.split(':').filter(Boolean)
  if (segments.length < 2) {
    return targetPath
  }

  const [volumeName, ...rest] = segments
  const basePath = volumeName === 'Macintosh HD'
    ? path.sep
    : path.join(path.sep, 'Volumes', volumeName)

  return path.resolve(basePath, ...rest)
}

export function normalizeLocalFilePath(targetPath: string, workDir?: string): string {
  let normalized = targetPath.trim()
  if (!normalized) {
    return normalized
  }

  normalized = normalizeFileUrl(normalized)

  if (normalized.startsWith('~')) {
    normalized = path.join(homedir(), normalized.slice(1))
  }

  normalized = normalizeMacOSHfsPath(normalized)

  if (path.isAbsolute(normalized)) {
    return path.resolve(normalized)
  }

  if (workDir) {
    return path.resolve(workDir, normalized)
  }

  return normalized
}
