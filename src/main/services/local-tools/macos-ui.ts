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
  ok: boolean
  errorCode?: MacOSAutomationErrorCode
  errorMessage?: string
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

export type MacOSAutomationErrorCode =
  | 'unsupported_platform'
  | 'invalid_input'
  | 'timeout'
  | 'permission_denied'
  | 'app_not_found'
  | 'window_not_found'
  | 'execution_failed'

export interface MacOSPermissionStatus {
  state: MacOSPermissionState
}

export type MacOSKeyModifier = 'command' | 'control' | 'option' | 'shift'

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

export function getMacOSAutomationErrorCode(error: unknown): MacOSAutomationErrorCode | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const code = (error as MacOSAutomationError).code
  return typeof code === 'string' ? code : undefined
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

  const output = `${args.stderr}\n${args.stdout}`.toLowerCase().replace(/[’‘]/g, "'")

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

  const windowPatterns = [
    "can't get window",
    'window inspection failed',
    'invalid index',
    "doesn't exist",
    'tab not found',
    'session not found',
    'has no open windows'
  ]
  if (windowPatterns.some((pattern) => output.includes(pattern))) {
    return 'window_not_found'
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

function quoteAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function buildAppleScriptModifierList(modifiers?: MacOSKeyModifier[]): string {
  if (!modifiers?.length) {
    return ''
  }

  const normalized = Array.from(new Set(modifiers))
  const values = normalized
    .map((modifier) => {
      switch (modifier) {
        case 'command':
          return 'command down'
        case 'control':
          return 'control down'
        case 'option':
          return 'option down'
        case 'shift':
          return 'shift down'
        default:
          return null
      }
    })
    .filter((value): value is string => Boolean(value))

  return values.length > 0 ? ` using {${values.join(', ')}}` : ''
}

function normalizeKeyName(key: string): string {
  return key.trim().toLowerCase()
}

function resolveAppleScriptKeyAction(key: string): { command: 'keystroke' | 'key code'; value: string } {
  const normalizedKey = normalizeKeyName(key)
  const specialKeyCodes: Record<string, number> = {
    enter: 36,
    return: 36,
    tab: 48,
    space: 49,
    delete: 51,
    backspace: 51,
    escape: 53,
    esc: 53,
    left: 123,
    right: 124,
    down: 125,
    up: 126
  }

  const specialKeyCode = specialKeyCodes[normalizedKey]
  if (specialKeyCode !== undefined) {
    return {
      command: 'key code',
      value: String(specialKeyCode)
    }
  }

  return {
    command: 'keystroke',
    value: quoteAppleScriptString(key)
  }
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

async function runJxa(args: {
  script: string
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  return await runProcess({
    command: 'osascript',
    argv: ['-l', 'JavaScript'],
    cwd: process.cwd(),
    stdinText: args.script,
    timeoutMs: args.timeoutMs ?? 5_000
  })
}

async function runJxaBooleanCheck(script: string): Promise<boolean | null> {
  try {
    const result = await runJxa({ script })

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
    throw createMacOSAutomationError('invalid_input', 'Application name cannot be empty.')
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
    throw createMacOSAutomationError('invalid_input', 'AppleScript cannot be empty.')
  }

  return await runProcess({
    command: 'osascript',
    argv: [],
    cwd: args.workDir,
    stdinText: script,
    timeoutMs: args.timeoutMs
  })
}

export async function activateMacOSApplication(args: {
  workDir: string
  application: string
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const application = args.application.trim()
  if (!application) {
    throw createMacOSAutomationError('invalid_input', 'Application name cannot be empty.')
  }

  return await executeAppleScript({
    workDir: args.workDir,
    script: `tell application ${quoteAppleScriptString(application)} to activate`,
    timeoutMs: args.timeoutMs
  })
}

export async function pressMacOSKey(args: {
  workDir: string
  key: string
  modifiers?: MacOSKeyModifier[]
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const key = args.key.trim()
  if (!key) {
    throw createMacOSAutomationError('invalid_input', 'Key cannot be empty.')
  }

  const action = resolveAppleScriptKeyAction(key)
  const modifierList = buildAppleScriptModifierList(args.modifiers)
  const script = `
tell application "System Events"
  ${action.command} ${action.value}${modifierList}
end tell
  `.trim()

  return await executeAppleScript({
    workDir: args.workDir,
    script,
    timeoutMs: args.timeoutMs
  })
}

export async function typeMacOSText(args: {
  workDir: string
  text: string
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  if (!args.text.trim()) {
    throw createMacOSAutomationError('invalid_input', 'Text cannot be empty.')
  }

  const script = `
tell application "System Events"
  keystroke ${quoteAppleScriptString(args.text)}
end tell
  `.trim()

  return await executeAppleScript({
    workDir: args.workDir,
    script,
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
        set elemPos to position of currentElement
        set output to output & ", pos=(" & (item 1 of elemPos as text) & "," & (item 2 of elemPos as text) & ")"
      end try
      try
        set elemSize to size of currentElement
        set output to output & ", size=(" & (item 1 of elemSize as text) & "," & (item 2 of elemSize as text) & ")"
      end try

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
            set childPosText to ""
            set childSizeText to ""
            try
              set childRoleText to my safeText(role of childElement)
            end try
            try
              set childNameText to my safeText(name of childElement)
            end try
            try
              set cp to position of childElement
              set childPosText to ", pos=(" & (item 1 of cp as text) & "," & (item 2 of cp as text) & ")"
            end try
            try
              set cs to size of childElement
              set childSizeText to ", size=(" & (item 1 of cs as text) & "," & (item 2 of cs as text) & ")"
            end try
            set output to output & linefeed & "  - role=" & childRoleText & ", name=" & childNameText & childPosText & childSizeText
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
    throw createMacOSAutomationFailureFromResult(result, 'Failed to read desktop UI tree.')
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

// ============================================
// Mouse Operations (CoreGraphics via JXA)
// ============================================

export type MacOSMouseButton = 'left' | 'right'

export async function clickMacOSAtCoordinate(args: {
  workDir: string
  x: number
  y: number
  button?: MacOSMouseButton
  clickCount?: number
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const x = Math.round(args.x)
  const y = Math.round(args.y)
  const button = args.button || 'left'
  const clickCount = Math.max(1, Math.min(args.clickCount ?? 1, 3))

  const isRight = button === 'right'
  const downEvent = isRight ? '$.kCGEventRightMouseDown' : '$.kCGEventLeftMouseDown'
  const upEvent = isRight ? '$.kCGEventRightMouseUp' : '$.kCGEventLeftMouseUp'
  const mouseButton = isRight ? '$.kCGMouseButtonRight' : '$.kCGMouseButtonLeft'

  const script = `
ObjC.import('CoreGraphics')

var point = $.CGPointMake(${x}, ${y})

for (var i = 0; i < ${clickCount}; i++) {
  var down = $.CGEventCreateMouseEvent(null, ${downEvent}, point, ${mouseButton})
  $.CGEventSetIntegerValueField(down, $.kCGMouseEventClickState, i + 1)
  $.CGEventPost($.kCGHIDEventTap, down)

  var up = $.CGEventCreateMouseEvent(null, ${upEvent}, point, ${mouseButton})
  $.CGEventSetIntegerValueField(up, $.kCGMouseEventClickState, i + 1)
  $.CGEventPost($.kCGHIDEventTap, up)

  if (i < ${clickCount} - 1) {
    delay(0.05)
  }
}

"clicked"
  `.trim()

  return await runJxa({ script, timeoutMs: args.timeoutMs })
}

export async function moveMacOSMouse(args: {
  workDir: string
  x: number
  y: number
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const x = Math.round(args.x)
  const y = Math.round(args.y)

  const script = `
ObjC.import('CoreGraphics')

var point = $.CGPointMake(${x}, ${y})
var event = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft)
$.CGEventPost($.kCGHIDEventTap, event)

"moved"
  `.trim()

  return await runJxa({ script, timeoutMs: args.timeoutMs })
}

// ============================================
// Scroll (CoreGraphics via JXA)
// ============================================

export async function scrollMacOS(args: {
  workDir: string
  x: number
  y: number
  deltaX?: number
  deltaY?: number
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const x = Math.round(args.x)
  const y = Math.round(args.y)
  const deltaX = Math.round(args.deltaX ?? 0)
  const deltaY = Math.round(args.deltaY ?? -3)

  const script = `
ObjC.import('CoreGraphics')

var point = $.CGPointMake(${x}, ${y})
var move = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft)
$.CGEventPost($.kCGHIDEventTap, move)

delay(0.05)

var scroll = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 2, ${deltaY}, ${deltaX})
$.CGEventPost($.kCGHIDEventTap, scroll)

"scrolled"
  `.trim()

  return await runJxa({ script, timeoutMs: args.timeoutMs })
}

// ============================================
// Window Management (AppleScript)
// ============================================

export interface MacOSWindowInfo {
  application: string
  name: string
  index: number
  position: { x: number; y: number } | null
  size: { width: number; height: number } | null
  minimized: boolean
}

export interface MacOSWindowListResult {
  windows: MacOSWindowInfo[]
}

export async function listMacOSWindows(args: {
  workDir: string
  application?: string
  timeoutMs?: number
}): Promise<MacOSWindowListResult> {
  ensureMacOS()

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
  set appName to my safeText(name of targetProcess)
  set allWindows to windows of targetProcess
  set windowCount to count of allWindows
  set output to ""

  repeat with i from 1 to windowCount
    set w to item i of allWindows
    set wName to ""
    set wPos to ""
    set wSize to ""
    set wMinimized to "false"
    try
      set wName to my safeText(name of w)
    end try
    try
      set p to position of w
      set wPos to ((item 1 of p) as text) & "," & ((item 2 of p) as text)
    end try
    try
      set s to size of w
      set wSize to ((item 1 of s) as text) & "," & ((item 2 of s) as text)
    end try
    try
      if value of attribute "AXMinimized" of w is true then
        set wMinimized to "true"
      end if
    end try

    set output to output & appName & "\\t" & wName & "\\t" & i & "\\t" & wPos & "\\t" & wSize & "\\t" & wMinimized & linefeed
  end repeat

  return output
end tell
  `.trim()

  const result = await executeAppleScript({
    workDir: args.workDir,
    script,
    timeoutMs: args.timeoutMs
  })

  if (result.returnCode !== 0 || result.timedOut) {
    throw createMacOSAutomationFailureFromResult(result, 'Failed to list windows.')
  }

  const windows: MacOSWindowInfo[] = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, _idx) => {
      const parts = line.split('\t')
      const posStr = parts[3] || ''
      const sizeStr = parts[4] || ''
      const posParts = posStr.split(',').map(Number)
      const sizeParts = sizeStr.split(',').map(Number)
      return {
        application: parts[0] || '',
        name: parts[1] || '',
        index: Number(parts[2]) || 1,
        position: posParts.length === 2 && Number.isFinite(posParts[0])
          ? { x: posParts[0], y: posParts[1] }
          : null,
        size: sizeParts.length === 2 && Number.isFinite(sizeParts[0])
          ? { width: sizeParts[0], height: sizeParts[1] }
          : null,
        minimized: parts[5]?.trim() === 'true'
      }
    })

  return { windows }
}

export async function focusMacOSWindow(args: {
  workDir: string
  application: string
  windowName?: string
  windowIndex?: number
  timeoutMs?: number
}): Promise<MacOSAutomationResult> {
  ensureMacOS()

  const application = args.application.trim()
  if (!application) {
    throw createMacOSAutomationError('invalid_input', 'Application name cannot be empty.')
  }

  let windowSelector: string
  if (args.windowName) {
    windowSelector = `window ${quoteAppleScriptString(args.windowName)}`
  } else if (args.windowIndex) {
    windowSelector = `window ${args.windowIndex}`
  } else {
    windowSelector = 'front window'
  }

  const script = `
tell application ${quoteAppleScriptString(application)} to activate

tell application "System Events"
  tell application process ${quoteAppleScriptString(application)}
    try
      perform action "AXRaise" of ${windowSelector}
    end try
    set frontmost to true
  end tell
end tell
  `.trim()

  return await executeAppleScript({
    workDir: args.workDir,
    script,
    timeoutMs: args.timeoutMs
  })
}
