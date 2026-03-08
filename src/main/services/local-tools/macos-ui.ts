import { spawn } from 'child_process'
import process from 'process'
import { truncateText } from './path-utils'

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
}

function normalizeTimeout(timeoutMs?: number): number {
  const value = Number.isFinite(timeoutMs) ? Math.floor(Number(timeoutMs)) : DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(value, 1_000), MAX_TIMEOUT_MS)
}

function appendChunk(current: string, chunk: Buffer | string): string {
  return truncateText(current + chunk.toString(), MAX_OUTPUT_CHARS)
}

function ensureMacOS(): void {
  if (process.platform !== 'darwin') {
    throw new Error('macOS UI automation is only supported on macOS.')
  }
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
      resolve({
        runner: [args.command, ...args.argv].join(' '),
        cwd: args.cwd,
        returnCode: null,
        stdout,
        stderr: truncateText(`${stderr}${stderr ? '\n' : ''}${error.message}`, MAX_OUTPUT_CHARS),
        timedOut,
        timeoutMs
      })
    })

    child.on('close', (code) => {
      clearTimeout(killTimer)
      resolve({
        runner: [args.command, ...args.argv].join(' '),
        cwd: args.cwd,
        returnCode: timedOut ? null : code,
        stdout,
        stderr,
        timedOut,
        timeoutMs
      })
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

  return {
    runner: `${openResult.runner} && ${activateResult.runner}`,
    cwd: args.workDir,
    returnCode: activateResult.returnCode,
    stdout: [openResult.stdout, activateResult.stdout].filter(Boolean).join('\n'),
    stderr: [openResult.stderr, activateResult.stderr].filter(Boolean).join('\n'),
    timedOut: openResult.timedOut || activateResult.timedOut,
    timeoutMs: normalizeTimeout(args.timeoutMs)
  }
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
