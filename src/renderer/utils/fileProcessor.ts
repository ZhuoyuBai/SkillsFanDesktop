/**
 * File Processor - General file processing for attachments
 *
 * Handles PDF, code, text, and data files.
 * Images are still handled by imageProcessor.ts.
 */

import { processImage, isValidImageType } from './imageProcessor'
import type { Attachment, PdfAttachment, TextAttachment, ImageMediaType } from '../types'

// ========== Size Limits ==========
const MAX_PDF_SIZE = 32 * 1024 * 1024     // 32MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024      // 1MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024    // 20MB

// ========== Accepted Extensions ==========
const TEXT_EXTENSIONS = new Set([
  // Code
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  'rb', 'swift', 'kt', 'scala', 'sh', 'bash', 'zsh',
  'css', 'scss', 'less', 'vue', 'svelte',
  // Markup
  'md', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml',
  // Data
  'json', 'csv', 'tsv', 'sql', 'graphql',
  // Text
  'txt', 'log', 'env', 'conf', 'cfg', 'ini',
  'gitignore', 'dockerignore', 'editorconfig',
])

// Extension → Language mapping (for code block hints)
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', rs: 'rust', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', swift: 'swift', kt: 'kotlin', scala: 'scala',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml',
  md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sql: 'sql', csv: 'csv', tsv: 'tsv', graphql: 'graphql',
  sh: 'bash', bash: 'bash', zsh: 'zsh',
  vue: 'vue', svelte: 'svelte',
}

// ========== Type Detection ==========

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isTextFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')
}

export function isSupportedFile(file: File): boolean {
  return isValidImageType(file) || isPdfFile(file) || isTextFile(file)
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

function getLanguage(filename: string): string | undefined {
  const ext = getFileExtension(filename)
  return EXTENSION_LANGUAGE_MAP[ext]
}

function generateId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ========== Size Validation ==========

export function checkFileSize(file: File): { valid: boolean; error?: string } {
  if (isValidImageType(file)) {
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: `Image too large (max 20MB): ${file.name}` }
    }
  } else if (isPdfFile(file)) {
    if (file.size > MAX_PDF_SIZE) {
      return { valid: false, error: `PDF too large (max 32MB): ${file.name}` }
    }
  } else if (isTextFile(file)) {
    if (file.size > MAX_TEXT_SIZE) {
      return { valid: false, error: `Text file too large (max 1MB): ${file.name}` }
    }
  } else {
    return { valid: false, error: `Unsupported file type: ${file.name}` }
  }
  return { valid: true }
}

// ========== File Processors ==========

async function processPdf(file: File): Promise<PdfAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer
      const uint8Array = new Uint8Array(arrayBuffer)

      // Convert to Base64
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length))
        binary += String.fromCharCode(...chunk)
      }
      const base64 = btoa(binary)

      resolve({
        id: generateId(),
        type: 'pdf',
        mediaType: 'application/pdf',
        data: base64,
        name: file.name,
        size: file.size
      })
    }
    reader.onerror = () => reject(new Error(`Failed to read PDF: ${file.name}`))
    reader.readAsArrayBuffer(file)
  })
}

async function processTextFile(file: File): Promise<TextAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: generateId(),
        type: 'text',
        mediaType: file.type || 'text/plain',
        content: reader.result as string,
        name: file.name,
        size: file.size,
        language: getLanguage(file.name)
      })
    }
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

// ========== Main Entry Point ==========

/**
 * Process any supported file into an Attachment
 */
export async function processFile(file: File): Promise<Attachment> {
  const sizeCheck = checkFileSize(file)
  if (!sizeCheck.valid) {
    throw new Error(sizeCheck.error)
  }

  if (isValidImageType(file)) {
    const processed = await processImage(file)
    return {
      id: generateId(),
      type: 'image',
      mediaType: processed.mediaType as ImageMediaType,
      data: processed.data,
      name: file.name,
      size: processed.compressedSize
    }
  }

  if (isPdfFile(file)) {
    return processPdf(file)
  }

  if (isTextFile(file)) {
    return processTextFile(file)
  }

  throw new Error(`Unsupported file type: ${file.name}`)
}

/**
 * Get accepted file extensions string for file input accept attribute
 */
export function getAcceptedExtensions(): string {
  const imageExts = '.jpg,.jpeg,.png,.gif,.webp'
  const pdfExts = '.pdf'
  const textExts = Array.from(TEXT_EXTENSIONS).map(e => `.${e}`).join(',')
  return `${imageExts},${pdfExts},${textExts}`
}
