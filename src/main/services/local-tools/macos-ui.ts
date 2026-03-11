import { spawn } from 'child_process'
import { copyFileSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
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
}

export interface MacOSBinaryCaptureResult {
  filePath: string
  mimeType: string
  data?: string
}

export interface MacOSUiTreeResult {
  text: string
  filePath?: string
}

export type MacOSPermissionState = 'granted' | 'needs_permission' | 'unsupported' | 'unknown'

export interface MacOSPermissionStatus {
  state: MacOSPermissionState
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

async function runJxaBooleanCheck(script: string): Promise<boolean | null> {
  try {
    const result = await runProcess({
      command: 'osascript',
      argv: ['-l', 'JavaScript'],
      cwd: process.cwd(),
      stdinText: script,
      timeoutMs: 5_000
    })

    if (result.returnCode !== 0 || result.timedOut) {
      return null
    }

    const match = result.stdout.match(/\b(true|false)\b/i)
    if (!match) return null

    return match[1].toLowerCase() === 'true'
  } catch {
    return null
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

export async function getMacOSAccessibilityPermissionStatus(): Promise<MacOSPermissionStatus> {
  if (process.platform !== 'darwin') {
    return { state: 'unsupported' }
  }

  const granted = await runJxaBooleanCheck(`
ObjC.import('ApplicationServices')
ObjC.bindFunction('AXIsProcessTrusted', ['bool', []])
console.log($.AXIsProcessTrusted())
  `.trim())

  if (granted === true) return { state: 'granted' }
  if (granted === false) return { state: 'needs_permission' }
  return { state: 'unknown' }
}

export async function getMacOSScreenRecordingPermissionStatus(): Promise<MacOSPermissionStatus> {
  if (process.platform !== 'darwin') {
    return { state: 'unsupported' }
  }

  const granted = await runJxaBooleanCheck(`
ObjC.import('Cocoa')
ObjC.bindFunction('CGPreflightScreenCaptureAccess', ['bool', []])
console.log($.CGPreflightScreenCaptureAccess())
  `.trim())

  if (granted === true) return { state: 'granted' }
  if (granted === false) return { state: 'needs_permission' }
  return { state: 'unknown' }
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
    throw new Error(result.stderr || result.stdout || 'Failed to capture desktop screenshot.')
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

export async function readMacOSDesktopUiTree(args: {
  workDir: string
  application?: string
  filePath?: string
  maxElements?: number
  maxChildrenPerElement?: number
  timeoutMs?: number
}): Promise<MacOSUiTreeResult> {
  ensureMacOS()

  const maxElements = Math.min(Math.max(args.maxElements ?? 40, 1), 200)
  const maxChildrenPerElement = Math.min(Math.max(args.maxChildrenPerElement ?? 5, 0), 20)
  const targetApplication = args.application?.trim()
  const applicationFilter = targetApplication
    ? `whose name is ${quoteAppleScriptString(targetApplication)}`
    : 'whose frontmost is true'

  const script = `
on safeText(theValue)
  try
    return theValue as text
  on error
    return ""
  end try
end safeText

tell application "System Events"
  set targetProcess to first application process ${applicationFilter}
  set output to "Application: " & my safeText(name of targetProcess) & linefeed

  try
    set targetWindow to front window of targetProcess
    set output to output & "Window: " & my safeText(name of targetWindow) & linefeed
    set topElements to UI elements of targetWindow
    set topCount to count of topElements
    repeat with i from 1 to topCount
      if i > ${maxElements} then exit repeat
      set currentElement to item i of topElements
      set roleText to ""
      set nameText to ""
      set descriptionText to ""
      set valueText to ""
      try
        set roleText to my safeText(role of currentElement)
      end try
      try
        set nameText to my safeText(name of currentElement)
      end try
      try
        set descriptionText to my safeText(description of currentElement)
      end try
      try
        set valueText to my safeText(value of currentElement)
      end try
      set output to output & "- role=" & roleText & ", name=" & nameText
      if descriptionText is not "" then
        set output to output & ", description=" & descriptionText
      end if
      if valueText is not "" then
        set output to output & ", value=" & valueText
      end if

      try
        set childElements to UI elements of currentElement
        set childCount to count of childElements
        if childCount > 0 then
          set output to output & ", children=" & childCount
          repeat with j from 1 to childCount
            if j > ${maxChildrenPerElement} then exit repeat
            set childElement to item j of childElements
            set childRoleText to ""
            set childNameText to ""
            try
              set childRoleText to my safeText(role of childElement)
            end try
            try
              set childNameText to my safeText(name of childElement)
            end try
            set output to output & linefeed & "  - role=" & childRoleText & ", name=" & childNameText
          end repeat
        end if
      end try

      set output to output & linefeed
    end repeat
  on error errMsg
    set output to output & "Window inspection failed: " & errMsg & linefeed
  end try

  return output
end tell
  `.trim()

  const result = await executeAppleScript({
    workDir: args.workDir,
    script,
    timeoutMs: args.timeoutMs
  })

  if (result.returnCode !== 0 || result.timedOut) {
    throw new Error(result.stderr || result.stdout || 'Failed to read desktop UI tree.')
  }

  const text = result.stdout.trim() || 'Desktop UI tree is empty.'
  const outputPath = resolveOutputPath(args.workDir, args.filePath)
  if (outputPath) {
    writeFileSync(outputPath, text, 'utf-8')
  }

  return {
    text,
    filePath: outputPath
  }
}
