import { spawn } from 'child_process'
import process from 'process'
import { truncateText } from './path-utils'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000
const MAX_OUTPUT_CHARS = 40_000

export interface LocalExecutionResult {
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

async function runCommand(args: {
  command: string
  argv: string[]
  cwd: string
  timeoutMs?: number
}): Promise<LocalExecutionResult> {
  const timeoutMs = normalizeTimeout(args.timeoutMs)

  return await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(args.command, args.argv, {
      cwd: args.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
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
  })
}

async function runFirstAvailable(args: {
  candidates: Array<{ command: string; argv: string[] }>
  cwd: string
  timeoutMs?: number
}): Promise<LocalExecutionResult> {
  let lastResult: LocalExecutionResult | null = null

  for (const candidate of args.candidates) {
    const result = await runCommand({
      command: candidate.command,
      argv: candidate.argv,
      cwd: args.cwd,
      timeoutMs: args.timeoutMs
    })

    if (!result.stderr.includes('ENOENT') && !result.stderr.includes('not found')) {
      return result
    }

    lastResult = result
  }

  return lastResult || {
    runner: 'unavailable',
    cwd: args.cwd,
    returnCode: null,
    stdout: '',
    stderr: 'No compatible runtime was found.',
    timedOut: false,
    timeoutMs: normalizeTimeout(args.timeoutMs)
  }
}

export async function executeCodeSnippet(args: {
  workDir: string
  code: string
  language: string
  timeoutMs?: number
}): Promise<LocalExecutionResult> {
  const language = args.language.trim().toLowerCase()

  if (!args.code.trim()) {
    throw new Error('Code snippet cannot be empty.')
  }

  if (language === 'javascript' || language === 'js' || language === 'node') {
    return await runFirstAvailable({
      candidates: [{ command: 'node', argv: ['-e', args.code] }],
      cwd: args.workDir,
      timeoutMs: args.timeoutMs
    })
  }

  if (language === 'python' || language === 'python3' || language === 'py') {
    const candidates = process.platform === 'win32'
      ? [
          { command: 'python', argv: ['-c', args.code] },
          { command: 'python3', argv: ['-c', args.code] }
        ]
      : [
          { command: 'python3', argv: ['-c', args.code] },
          { command: 'python', argv: ['-c', args.code] }
        ]

    return await runFirstAvailable({
      candidates,
      cwd: args.workDir,
      timeoutMs: args.timeoutMs
    })
  }

  if (language === 'bash' || language === 'sh' || language === 'shell' || language === 'zsh') {
    return await executeShellCommand({
      workDir: args.workDir,
      command: args.code,
      timeoutMs: args.timeoutMs
    })
  }

  throw new Error(`Unsupported language "${args.language}". Use javascript, python, or bash.`)
}

export async function executeShellCommand(args: {
  workDir: string
  command: string
  timeoutMs?: number
}): Promise<LocalExecutionResult> {
  if (!args.command.trim()) {
    throw new Error('Command cannot be empty.')
  }

  if (process.platform === 'win32') {
    return await runCommand({
      command: 'cmd.exe',
      argv: ['/d', '/s', '/c', args.command],
      cwd: args.workDir,
      timeoutMs: args.timeoutMs
    })
  }

  const shell = process.env.SHELL || '/bin/zsh'
  return await runCommand({
    command: shell,
    argv: ['-lc', args.command],
    cwd: args.workDir,
    timeoutMs: args.timeoutMs
  })
}
