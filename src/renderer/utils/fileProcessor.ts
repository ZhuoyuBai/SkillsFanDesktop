/**
 * File Processor - General file processing for attachments
 *
 * Handles PDF, Excel, Word, code, text, and data files.
 * Images are still handled by imageProcessor.ts.
 */

import { processImage, isValidImageType } from './imageProcessor'
import type { Attachment, PdfAttachment, TextAttachment, ImageMediaType } from '../types'

// ========== Size Limits ==========
const MAX_PDF_SIZE = 32 * 1024 * 1024     // 32MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024      // 1MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024    // 20MB
const MAX_OFFICE_SIZE = 20 * 1024 * 1024   // 20MB for Excel/Word

// ========== Office Document Extensions ==========
const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb'])
const WORD_EXTENSIONS = new Set(['docx'])

// ========== Accepted Extensions ==========
const TEXT_EXTENSIONS = new Set([
  // Code - Web
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'css', 'scss', 'less', 'vue', 'svelte', 'astro',
  // Code - Systems
  'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cc', 'cxx', 'hh',
  'cs', 'fs', 'vb',
  // Code - Mobile/Desktop
  'rb', 'swift', 'kt', 'kts', 'scala', 'dart', 'mm', 'm',
  // Code - Scripting
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'lua', 'pl', 'pm', 'php', 'r', 'jl', 'ex', 'exs',
  'clj', 'cljs', 'edn', 'elm', 'erl', 'hrl',
  'hs', 'lhs', 'ml', 'mli', 'nim', 'zig',
  // Markup & Docs
  'md', 'mdx', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml',
  'rst', 'tex', 'adoc', 'textile', 'org',
  // Data
  'json', 'jsonl', 'ndjson', 'geojson', 'csv', 'tsv', 'sql', 'graphql',
  // Config
  'txt', 'log', 'env', 'conf', 'cfg', 'ini', 'properties',
  'gitignore', 'dockerignore', 'editorconfig', 'eslintrc',
  'prettierrc', 'babelrc', 'nvmrc',
  // Infra & Schema
  'hcl', 'tf', 'tfvars', 'proto', 'prisma', 'thrift', 'avsc',
  // Build
  'makefile', 'cmake', 'gradle', 'sbt',
  'dockerfile', 'vagrantfile',
  // Other
  'diff', 'patch', 'plist', 'lock', 'snap',
  'svg', 'asm', 's', 'wasm', 'wat',
])

// Extension → Language mapping (for code block hints)
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', rs: 'rust', java: 'java',
  c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', fs: 'fsharp', vb: 'vb',
  rb: 'ruby', swift: 'swift', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  dart: 'dart', mm: 'objectivec', m: 'objectivec',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', svg: 'svg',
  md: 'markdown', mdx: 'mdx', json: 'json', jsonl: 'json', ndjson: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sql: 'sql', csv: 'csv', tsv: 'tsv', graphql: 'graphql',
  sh: 'bash', bash: 'bash', zsh: 'zsh', fish: 'fish',
  ps1: 'powershell', bat: 'batch', cmd: 'batch',
  lua: 'lua', pl: 'perl', pm: 'perl', php: 'php',
  r: 'r', jl: 'julia', ex: 'elixir', exs: 'elixir',
  clj: 'clojure', cljs: 'clojure', elm: 'elm',
  erl: 'erlang', hrl: 'erlang', hs: 'haskell', lhs: 'haskell',
  ml: 'ocaml', mli: 'ocaml', nim: 'nim', zig: 'zig',
  vue: 'vue', svelte: 'svelte', astro: 'astro',
  hcl: 'hcl', tf: 'terraform', proto: 'protobuf', prisma: 'prisma',
  dockerfile: 'dockerfile', makefile: 'makefile', cmake: 'cmake',
  gradle: 'gradle', sbt: 'scala',
  diff: 'diff', patch: 'diff',
  rst: 'rst', tex: 'latex',
  asm: 'asm', s: 'asm', wat: 'wasm',
}

// ========== Type Detection ==========

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isExcelFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return EXCEL_EXTENSIONS.has(ext)
}

export function isWordFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return WORD_EXTENSIONS.has(ext)
}

export function isTextFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')
}

export function isSupportedFile(file: File): boolean {
  return isValidImageType(file) || isPdfFile(file) || isExcelFile(file) || isWordFile(file) || isTextFile(file)
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
  } else if (isExcelFile(file) || isWordFile(file)) {
    if (file.size > MAX_OFFICE_SIZE) {
      return { valid: false, error: `File too large (max 20MB): ${file.name}` }
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

/**
 * Process Excel file (.xlsx, .xls) → convert all sheets to CSV text
 */
async function processExcel(file: File): Promise<TextAttachment> {
  const { read, utils } = await import('xlsx')

  const arrayBuffer = await file.arrayBuffer()
  const workbook = read(arrayBuffer, { type: 'array' })

  // Convert each sheet to CSV, combine with sheet name headers
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = utils.sheet_to_csv(sheet)
    if (workbook.SheetNames.length > 1) {
      parts.push(`## Sheet: ${sheetName}\n${csv}`)
    } else {
      parts.push(csv)
    }
  }

  const content = parts.join('\n\n')

  return {
    id: generateId(),
    type: 'text',
    mediaType: 'text/csv',
    content,
    name: file.name,
    size: file.size,
    language: 'csv'
  }
}

/**
 * Process Word file (.docx) → extract text content
 */
async function processWord(file: File): Promise<TextAttachment> {
  const mammoth = await import('mammoth')

  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToMarkdown({ arrayBuffer })

  return {
    id: generateId(),
    type: 'text',
    mediaType: 'text/markdown',
    content: result.value,
    name: file.name,
    size: file.size,
    language: 'markdown'
  }
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

  if (isExcelFile(file)) {
    return processExcel(file)
  }

  if (isWordFile(file)) {
    return processWord(file)
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
  const officeExts = Array.from(EXCEL_EXTENSIONS).concat(Array.from(WORD_EXTENSIONS)).map(e => `.${e}`).join(',')
  const textExts = Array.from(TEXT_EXTENSIONS).map(e => `.${e}`).join(',')
  return `${imageExts},${pdfExts},${officeExts},${textExts}`
}
