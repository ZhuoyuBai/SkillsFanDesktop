import { clipboard } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { getTempSpacePath } from './config.service'

export interface SavedTerminalImage {
  filePath: string
  name: string
  size: number
  mediaType: string
}

export type TerminalClipboardPasteResult =
  | { kind: 'image'; image: SavedTerminalImage }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }

interface SaveTerminalImageInput {
  terminalId: string
  base64Data: string
  mediaType?: string
  name?: string
}

const TERMINAL_IMAGE_DIR = 'terminal-images'

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function sanitizeFileName(value: string): string {
  const normalized = value.trim().replace(/[\\/:"*?<>|]+/g, '-')
  return normalized || `pasted-${Date.now()}`
}

function stripDataUrlPrefix(value: string): string {
  const marker = 'base64,'
  const markerIndex = value.indexOf(marker)
  return markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value
}

function getExtensionForMediaType(mediaType: string): string {
  switch (mediaType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/png':
    default:
      return 'png'
  }
}

function ensureNamedFile(fileName: string, mediaType: string): string {
  if (/\.[a-zA-Z0-9]+$/.test(fileName)) {
    return fileName
  }
  return `${fileName}.${getExtensionForMediaType(mediaType)}`
}

async function ensureTerminalDir(terminalId: string): Promise<string> {
  const dir = join(getTempSpacePath(), TERMINAL_IMAGE_DIR, sanitizePathSegment(terminalId))
  await mkdir(dir, { recursive: true })
  return dir
}

export async function saveTerminalImage(input: SaveTerminalImageInput): Promise<SavedTerminalImage> {
  const mediaType = input.mediaType || 'image/png'
  const dataBuffer = Buffer.from(stripDataUrlPrefix(input.base64Data), 'base64')

  if (dataBuffer.length === 0) {
    throw new Error('Clipboard image data is empty.')
  }

  const dir = await ensureTerminalDir(input.terminalId)
  const uniquePrefix = `${Date.now()}-${randomUUID()}`
  const baseName = input.name
    ? `${uniquePrefix}-${ensureNamedFile(sanitizeFileName(input.name), mediaType)}`
    : `pasted-${uniquePrefix}.${getExtensionForMediaType(mediaType)}`
  const filePath = join(dir, baseName)
  await writeFile(filePath, dataBuffer)

  return {
    filePath,
    name: baseName,
    size: dataBuffer.length,
    mediaType,
  }
}

export async function readTerminalClipboardPaste(terminalId: string): Promise<TerminalClipboardPasteResult> {
  const image = clipboard.readImage()
  if (!image.isEmpty()) {
    const png = image.toPNG()
    const savedImage = await saveTerminalImage({
      terminalId,
      base64Data: png.toString('base64'),
      mediaType: 'image/png',
    })
    return { kind: 'image', image: savedImage }
  }

  const text = clipboard.readText()
  if (text) {
    return { kind: 'text', text }
  }

  return { kind: 'empty' }
}
