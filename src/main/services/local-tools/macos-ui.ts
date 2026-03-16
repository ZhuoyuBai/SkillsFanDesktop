import { spawn } from 'child_process'
import { copyFileSync, mkdtempSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import process from 'process'
import { tmpdir } from 'os'
import { normalizeLocalFilePath, truncateText } from './path-utils'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000
const MAX_OUTPUT_CHARS = 40_000

export interface MacOSAutomationResult {
  runner: string
  cwd: string
  returnCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  timeoutMs: number
  ok: boolean
  errorCode?: MacOSAutomationErrorCode
  errorMessage?: string
}

export interface MacOSBinaryCaptureResult {
  filePath: string
  mimeType: string
  data?: string
}

export type MacOSAutomationErrorCode =
  | 'unsupported_platform'
  | 'invalid_input'
  | 'timeout'
  | 'permission_denied'
  | 'app_not_found'
  | 'window_not_found'
  | 'execution_failed'

type MacOSAutomationError = Error & { code?: MacOSAutomationErrorCode }

function normalizeTimeout(timeoutMs?: number): number {
  const value = Number.isFinite(timeoutMs) ? Math.floor(Number(timeoutMs)) : DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(value, 1_000), MAX_TIMEOUT_MS)
}

function appendChunk(current: string, chunk: Buffer | string): string {
  return truncateText(current + chunk.toString(), MAX_OUTPUT_CHARS)
}

function createMacOSAutomationError(
  code: MacOSAutomationErrorCode,
  message: string
): MacOSAutomationError {
  const error = new Error(message) as MacOSAutomationError
  error.code = code
  return error
}

function extractMacOSAutomationErrorMessage(args: {
  stdout: string
  stderr: string
  timedOut: boolean
  timeoutMs: number
}): string {
  if (args.timedOut) {
    return `Command timed out after ${args.timeoutMs}ms.`
  }

  return truncateText((args.stderr || args.stdout || 'Command failed.').trim(), MAX_OUTPUT_CHARS)
}

export function classifyMacOSAutomationFailure(args: {
  stdout: string
  stderr: string
  timedOut: boolean
  returnCode: number | null
}): MacOSAutomationErrorCode | undefined {
  if (args.timedOut) {
    return 'timeout'
  }

  const output = `${args.stderr}\n${args.stdout}`.toLowerCase().replace(/['']/g, "'")

  const permissionPatterns = [
    'not allowed assistive access',
    'accessibility permission',
    'screen recording permission',
    'not authorized to send apple events',
    'operation not permitted',
    'permission denied'
  ]
  if (permissionPatterns.some((pattern) => output.includes(pattern))) {
    return 'permission_denied'
  }

  const appPatterns = [
    'application not found',
    "application isn't running",
    "can't get application process",
    'unable to find application named',
    "can't get application"
  ]
  if (appPatterns.some((pattern) => output.includes(pattern))) {
    return 'app_not_found'
  }

  if (args.returnCode === null || args.returnCode !== 0) {
    return 'execution_failed'
  }

  return undefined
}

function finalizeMacOSAutomationResult(result: Omit<MacOSAutomationResult, 'ok' | 'errorCode' | 'errorMessage'>): MacOSAutomationResult {
  const errorCode = classifyMacOSAutomationFailure(result)
  return {
    ...result,
    ok: !errorCode,
    errorCode,
    errorMessage: errorCode
      ? extractMacOSAutomationErrorMessage(result)
      : undefined
  }
}

function createMacOSAutomationFailureFromResult(
  result: MacOSAutomationResult,
  fallbackMessage: string
): MacOSAutomationError {
  return createMacOSAutomationError(
    result.errorCode ?? 'execution_failed',
    result.errorMessage ?? truncateText((result.stderr || result.stdout || fallbackMessage).trim(), MAX_OUTPUT_CHARS)
  )
}

function ensureMacOS(): void {
  if (process.platform !== 'darwin') {
    throw createMacOSAutomationError(
      'unsupported_platform',
      'macOS UI automation is only supported on macOS.'
    )
  }
}

function createTempOutputPath(prefix: string, ext: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  return join(tempDir, `capture.${ext}`)
}

function resolveOutputPath(workDir: string, outputPath?: string): string | undefined {
  if (!outputPath) return undefined
  return normalizeLocalFilePath(outputPath, workDir)
}

function quoteAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function runProcess(args: {
  command: string
  argv: string[]
  cwd: string
  stdinText?: string
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  const timeoutMs = normalizeTimeout(args.timeoutMs)

  return await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(args.command, args.argv, {
      cwd: args.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const killTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref()
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout = appendChunk(stdout, chunk)
    })

    child.stderr?.on('data', (chunk) => {
      stderr = appendChunk(stderr, chunk)
    })

    child.on('error', (error) => {
      clearTimeout(killTimer)
      resolve(finalizeMacOSAutomationResult({
        runner: [args.command, ...args.argv].join(' '),
        cwd: args.cwd,
        returnCode: null,
        stdout,
        stderr: truncateText(`${stderr}${stderr ? '\n' : ''}${error.message}`, MAX_OUTPUT_CHARS),
        timedOut,
        timeoutMs
      }))
    })

    child.on('close', (code) => {
      clearTimeout(killTimer)
      resolve(finalizeMacOSAutomationResult({
        runner: [args.command, ...args.argv].join(' '),
        cwd: args.cwd,
        returnCode: timedOut ? null : code,
        stdout,
        stderr,
        timedOut,
        timeoutMs
      }))
    })

    if (args.stdinText) {
      child.stdin?.end(args.stdinText)
    } else {
      child.stdin?.end()
    }
  })
}

export async function openMacOSApplication(args: {
  workDir: string
  application: string
  target?: string
  activate?: boolean
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const application = args.application.trim()
  if (!application) {
    throw new Error('Application name cannot be empty.')
  }

  const openResult = await runProcess({
    command: 'open',
    argv: args.target ? ['-a', application, args.target] : ['-a', application],
    cwd: args.workDir,
    timeoutMs: args.timeoutMs
  })

  if (openResult.returnCode !== 0 || openResult.timedOut || args.activate === false) {
    return openResult
  }

  const activateResult = await executeAppleScript({
    workDir: args.workDir,
    script: `tell application ${quoteAppleScriptString(application)} to activate`,
    timeoutMs: args.timeoutMs
  })

  return finalizeMacOSAutomationResult({
    runner: `${openResult.runner} && ${activateResult.runner}`,
    cwd: args.workDir,
    returnCode: activateResult.returnCode,
    stdout: [openResult.stdout, activateResult.stdout].filter(Boolean).join('\n'),
    stderr: [openResult.stderr, activateResult.stderr].filter(Boolean).join('\n'),
    timedOut: openResult.timedOut || activateResult.timedOut,
    timeoutMs: normalizeTimeout(args.timeoutMs)
  })
}

export async function executeAppleScript(args: {
  workDir: string
  script: string
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const script = args.script.trim()
  if (!script) {
    throw new Error('AppleScript cannot be empty.')
  }

  return await runProcess({
    command: 'osascript',
    argv: [],
    cwd: args.workDir,
    stdinText: script,
    timeoutMs: args.timeoutMs
  })
}

export async function captureMacOSDesktopScreenshot(args: {
  workDir: string
  filePath?: string
  timeoutMs?: number
}): Promise<MacOSBinaryCaptureResult> {
  ensureMacOS()

  const tempPath = createTempOutputPath('skillsfan-desktop-screenshot', 'png')
  const result = await runProcess({
    command: 'screencapture',
    argv: ['-x', tempPath],
    cwd: args.workDir,
    timeoutMs: args.timeoutMs
  })

  if (result.returnCode !== 0 || result.timedOut) {
    throw createMacOSAutomationFailureFromResult(result, 'Failed to capture desktop screenshot.')
  }

  const resolvedOutputPath = resolveOutputPath(args.workDir, args.filePath)
  const outputPath = resolvedOutputPath || tempPath
  if (resolvedOutputPath) {
    copyFileSync(tempPath, resolvedOutputPath)
    unlinkSync(tempPath)
  }

  const data = readFileSync(outputPath).toString('base64')
  return {
    filePath: outputPath,
    mimeType: 'image/png',
    data
  }
}
