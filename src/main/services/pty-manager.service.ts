/**
 * PTY Manager Service
 *
 * Manages pseudo-terminal instances for embedding Claude Code CLI
 * inside the SkillsFan Canvas. Each terminal tab gets its own PTY
 * running the Claude Code CLI with the user's configured model.
 *
 * Key design:
 * - PTY ID = Canvas tab ID (1:1 mapping)
 * - Uses bundled @anthropic-ai/claude-code/cli.js (no extra install needed)
 * - Model config injected via env vars (reuses existing resolveSdkTransport pipeline)
 * - Electron used as Node.js runtime (ELECTRON_RUN_AS_NODE=1)
 */

import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { getConfig, getHaloDir } from './config.service'
import { getPtyRuntimePath } from './headless-electron.service'
import { getApiCredentialsForSource, getWorkingDir, resolveSdkTransport } from './pty-credentials'

// Lazy-loaded to avoid native module issues at import time
let pty: typeof import('node-pty') | null = null

function getPty() {
  if (!pty) {
    pty = require('node-pty')
  }
  return pty!
}

interface PtyInstance {
  id: string
  pty: import('node-pty').IPty
  spaceId: string
  model: string
  isAlive: boolean
}

const ptyInstances = new Map<string, PtyInstance>()
const EMBEDDED_CLAUDE_CONFIG_FILE_NAMES = ['.config.json', '.claude.json']

// Reference to main window for sending events
let mainWindowRef: BrowserWindow | null = null

export function setPtyMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window
}

function unwrapAsarPath(filePath: string): string {
  return filePath
    .replace('app.asar', 'app.asar.unpacked')
    .replace('node_modules.asar', 'node_modules.asar.unpacked')
}

function ensureReadableFile(filePath: string, label: string): void {
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath || '(empty path)'}.`)
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}.`)
  }

  accessSync(filePath, constants.R_OK)
}

function ensureDirectoryExists(dirPath: string, label: string): void {
  if (!dirPath || !existsSync(dirPath)) {
    throw new Error(`${label} does not exist: ${dirPath || '(empty path)'}.`)
  }

  const stat = statSync(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${dirPath}.`)
  }
}

function ensureExecutableFile(filePath: string, label: string): void {
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath || '(empty path)'}.`)
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}.`)
  }

  try {
    accessSync(filePath, constants.X_OK)
  } catch {
    chmodSync(filePath, 0o755)
    accessSync(filePath, constants.X_OK)
    console.log(`[PTY] Repaired execute permission for ${label}: ${filePath}`)
  }
}

function resolveNodePtySpawnHelperPath(): string | null {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    const packageJsonPath = require.resolve('node-pty/package.json')
    const packageDir = dirname(packageJsonPath)
    const relativeHelperPath = join('prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    const candidates = [
      join(unwrapAsarPath(packageDir), relativeHelperPath),
      join(packageDir, relativeHelperPath)
    ]

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? null
  } catch {
    return null
  }
}

function validatePtyLaunchPrerequisites(params: {
  electronPath: string
  cliPath: string
  workDir: string
}): { helperPath: string | null } {
  const { electronPath, cliPath, workDir } = params

  ensureExecutableFile(electronPath, 'Electron runtime')
  ensureReadableFile(cliPath, 'Claude Code CLI')
  ensureDirectoryExists(workDir, 'Terminal working directory')

  const helperPath = resolveNodePtySpawnHelperPath()
  if (helperPath) {
    ensureExecutableFile(helperPath, 'node-pty spawn helper')
  }

  return { helperPath }
}

function buildPtyStartupError(
  code: string,
  summary: string,
  details: Array<string | null | undefined>
): Error {
  return new Error([`[${code}] ${summary}`, ...details.filter(Boolean)].join('\n'))
}

function wrapPtyStartupError(
  error: unknown,
  context: {
    electronPath?: string
    cliPath?: string
    workDir?: string
    helperPath?: string | null
  }
): Error {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  if (message.startsWith('[')) {
    return error instanceof Error ? error : new Error(message)
  }

  if (
    lowerMessage.includes('login') ||
    lowerMessage.includes('api key') ||
    lowerMessage.includes('oauth token') ||
    lowerMessage.includes('ai source configured')
  ) {
    return buildPtyStartupError('PTY_AUTH_REQUIRED', 'AI source is not ready for Claude Code terminal.', [
      `Technical details: ${message}`
    ])
  }

  if (lowerMessage.includes('working directory')) {
    return buildPtyStartupError('PTY_WORKDIR_UNAVAILABLE', 'Claude Code terminal working directory is unavailable.', [
      context.workDir ? `Working directory: ${context.workDir}` : null,
      `Technical details: ${message}`
    ])
  }

  if (lowerMessage.includes('claude code cli not found') || lowerMessage.includes('@anthropic-ai/claude-code')) {
    return buildPtyStartupError('PTY_CLI_MISSING', 'Bundled Claude Code CLI is missing.', [
      context.cliPath ? `CLI path: ${context.cliPath}` : null,
      `Technical details: ${message}`
    ])
  }

  if (
    lowerMessage.includes('spawn helper') ||
    lowerMessage.includes('spawn-helper') ||
    lowerMessage.includes('posix_spawnp failed')
  ) {
    return buildPtyStartupError('PTY_HELPER_START_FAILED', 'macOS terminal helper failed to launch.', [
      context.helperPath ? `Helper path: ${context.helperPath}` : null,
      `Technical details: ${message}`
    ])
  }

  if (lowerMessage.includes('node-pty')) {
    return buildPtyStartupError('PTY_RUNTIME_UNAVAILABLE', 'Local PTY runtime failed to load.', [
      `Technical details: ${message}`
    ])
  }

  return buildPtyStartupError('PTY_START_FAILED', 'Claude Code terminal failed to start.', [
    context.electronPath ? `Runtime path: ${context.electronPath}` : null,
    context.cliPath ? `CLI path: ${context.cliPath}` : null,
    context.workDir ? `Working directory: ${context.workDir}` : null,
    `Technical details: ${message}`
  ])
}

/**
 * Resolve Claude CLI environment from current model configuration.
 * Reuses the same credential pipeline as SDK mode.
 */
type JsonObject = Record<string, unknown>

function asJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as JsonObject
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function resolveEmbeddedClaudeGlobalConfigPath(configDir: string): string {
  for (const fileName of EMBEDDED_CLAUDE_CONFIG_FILE_NAMES) {
    const filePath = join(configDir, fileName)
    if (existsSync(filePath)) {
      return filePath
    }
  }

  return join(configDir, '.config.json')
}

function buildEmbeddedClaudeProjectState(existingProjects: unknown, workDir: string): JsonObject {
  const nextProjects = asJsonObject(existingProjects)
    ? { ...asJsonObject(existingProjects)! }
    : {}
  const projectDirs = new Set<string>([workDir.normalize('NFC')])

  try {
    projectDirs.add(realpathSync(workDir).normalize('NFC'))
  } catch {
    // Fall back to the working directory when realpath resolution is unavailable.
  }

  for (const projectDir of projectDirs) {
    const existingProject = asJsonObject(nextProjects[projectDir]) ?? {}
    nextProjects[projectDir] = {
      ...existingProject,
      hasTrustDialogAccepted: true
    }
  }

  return nextProjects
}

function buildEmbeddedClaudeApiKeyState(existingValue: unknown, apiKey: string): JsonObject {
  const existing = asJsonObject(existingValue)
  const approved = new Set(asStringArray(existing?.approved))
  const truncatedApiKey = apiKey.slice(-20)

  if (truncatedApiKey) {
    approved.add(truncatedApiKey)
  }

  return {
    approved: Array.from(approved),
    rejected: asStringArray(existing?.rejected).filter((value) => value !== truncatedApiKey)
  }
}

function ensureEmbeddedClaudeGlobalConfig(params: { configDir: string; apiKey: string; workDir: string }): void {
  const configPath = resolveEmbeddedClaudeGlobalConfigPath(params.configDir)
  let existingConfig: JsonObject = {}

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8').trim()
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        existingConfig = asJsonObject(parsed) ?? {}
      }
    } catch (error) {
      console.warn(
        `[PTY] Failed to parse embedded Claude config at ${configPath}, recreating it`,
        error
      )
    }
  }

  const nextConfig: JsonObject = {
    ...existingConfig,
    theme:
      typeof existingConfig.theme === 'string'
        ? existingConfig.theme
        : nativeTheme.shouldUseDarkColors
          ? 'dark'
          : 'light',
    hasCompletedOnboarding: true,
    customApiKeyResponses: buildEmbeddedClaudeApiKeyState(
      existingConfig.customApiKeyResponses,
      params.apiKey
    ),
    projects: buildEmbeddedClaudeProjectState(existingConfig.projects, params.workDir)
  }

  writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf-8')
}

export async function resolveClaudeCliEnv(params: {
  workDir: string
  source?: string
  modelOverride?: string
}): Promise<{
  env: Record<string, string>
  model: string
  skipClaudeLogin: boolean
}> {
  const config = getConfig()
  const source = params.source || ((config as Record<string, any>).aiSources?.current || 'custom')
  const skipClaudeLogin = config.terminal?.skipClaudeLogin !== false
  const sharedClaudeEnv = {
    // Prevent in-app sessions from attempting self-updates or other
    // non-essential network calls that users cannot complete from the
    // bundled runtime.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  }

  // When skipClaudeLogin is false, let Claude Code CLI manage authentication
  // and model selection itself. Do not inject app-managed API credentials or a
  // persisted custom model, otherwise new terminals can silently keep using the
  // previous Custom API provider after the user switches back to Claude login.
  if (!skipClaudeLogin) {
    return {
      env: sharedClaudeEnv,
      model: '',
      skipClaudeLogin: false
    }
  }

  // skipClaudeLogin=true: requires pre-configured API credentials
  const credentials = await getApiCredentialsForSource(config, source, params.modelOverride)
  const transport = await resolveSdkTransport(credentials)
  const embeddedClaudeConfigDir = getEmbeddedClaudeConfigDir()

  if (embeddedClaudeConfigDir) {
    try {
      ensureEmbeddedClaudeGlobalConfig({
        configDir: embeddedClaudeConfigDir,
        apiKey: transport.anthropicApiKey,
        workDir: params.workDir
      })
    } catch (error) {
      console.warn('[PTY] Failed to seed embedded Claude config', error)
    }
  }

  return {
    env: {
      ...sharedClaudeEnv,
      ANTHROPIC_API_KEY: transport.anthropicApiKey,
      ANTHROPIC_BASE_URL: transport.anthropicBaseUrl,
      DISABLE_TELEMETRY: '1',
      NO_PROXY: 'localhost,127.0.0.1',
      no_proxy: 'localhost,127.0.0.1',
      ...(embeddedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: embeddedClaudeConfigDir } : {}),
    },
    model: credentials.model,
    skipClaudeLogin: true
  }
}

function getEmbeddedClaudeConfigDir(): string {
  const configDir = join(getHaloDir(), 'claude-code', 'embedded')

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Symlink user's ~/.claude/ subdirectories into embedded config so the CLI
  // can discover user-installed skills, agents, plugins, commands and settings.
  // Auth-related files (.config.json, projects/, sessions/) are NOT linked
  // to keep the embedded CLI's auth isolated from the user's standalone CLI.
  const claudeDir = join(homedir(), '.claude')
  for (const entry of ['skills', 'commands', 'agents', 'plugins', 'settings.json']) {
    const source = join(claudeDir, entry)
    const target = join(configDir, entry)
    if (existsSync(source) && !existsSync(target)) {
      try {
        symlinkSync(source, target)
      } catch {
        // Ignore if symlink creation fails
      }
    }
  }

  return configDir
}

/**
 * Find the bundled Claude Code CLI path.
 * Falls back to global `claude` if bundled version not found.
 */
export function findClaudeCliPath(): string {
  const candidates = [
    join(app.getAppPath(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    join(unwrapAsarPath(app.getAppPath()), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  ]

  // Priority 2: Resolve from module system
  try {
    candidates.push(require.resolve('@anthropic-ai/claude-code/cli.js'))
  } catch {
    // Not found
  }

  // Priority 3: Try relative to __dirname (for packaged app)
  candidates.push(
    join(__dirname, '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    join(unwrapAsarPath(__dirname), '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  )

  const resolvedPath = Array.from(new Set(candidates)).find((candidate) => existsSync(candidate))
  if (resolvedPath) {
    return resolvedPath
  }

  throw new Error(
    'Claude Code CLI not found. Please ensure @anthropic-ai/claude-code is installed.'
  )
}

export interface CreatePtyOptions {
  id: string
  spaceId: string
  cols: number
  rows: number
  source?: string
  modelOverride?: string
}

/**
 * Create a PTY instance and spawn Claude Code CLI.
 */
export async function createPty(options: CreatePtyOptions): Promise<{ model: string }> {
  const { id, spaceId, cols, rows, source, modelOverride } = options

  const existing = ptyInstances.get(id)
  if (existing?.isAlive) {
    resizePty(id, cols, rows)
    return { model: existing.model }
  }

  // Clean up any stale PTY with the same ID before recreating it.
  if (existing) {
    destroyPty(id)
  }

  let electronPath = ''
  let cliPath = ''
  let workDir = ''
  let helperPath: string | null = null

  try {
    cliPath = findClaudeCliPath()
    // On macOS, launching the app bundle path directly causes a transient Dock icon
    // for every terminal child process. A stable symlink suppresses that behavior.
    electronPath = getPtyRuntimePath()
    workDir = getWorkingDir(spaceId)
    helperPath = validatePtyLaunchPrerequisites({ electronPath, cliPath, workDir }).helperPath

    const nodePty = getPty()
    const ptyConfig = getConfig()
    const { env: claudeEnv, model, skipClaudeLogin } = await resolveClaudeCliEnv({
      workDir,
      source,
      modelOverride
    })

    const args = model ? [cliPath, '--model', model] : [cliPath]

    const spawnEnv = {
      ...process.env,
    } as Record<string, string>

    delete spawnEnv.ANTHROPIC_API_KEY
    delete spawnEnv.ANTHROPIC_BASE_URL
    delete spawnEnv.CLAUDE_CONFIG_DIR

    if (skipClaudeLogin) {
      delete spawnEnv.ANTHROPIC_AUTH_TOKEN
    }

    console.log(
      `[PTY] Creating terminal ${id} with model ${model} in ${workDir} via ${electronPath} (${skipClaudeLogin ? 'local-model mode' : 'default auth mode'})`
    )

    const ptyProcess = nodePty.spawn(electronPath, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workDir,
      env: {
        ...spawnEnv,
        ELECTRON_RUN_AS_NODE: '1',
        // Don't set ELECTRON_NO_ATTACH_CONSOLE - we need TTY interaction
        ...claudeEnv,
        ...(ptyConfig.terminal?.noFlicker ? { CLAUDE_CODE_NO_FLICKER: '1' } : {}),
      } as Record<string, string>
    })

    const instance: PtyInstance = {
      id,
      pty: ptyProcess,
      spaceId,
      model,
      isAlive: true
    }

    ptyInstances.set(id, instance)

    // Forward PTY data to renderer
    ptyProcess.onData((data: string) => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('pty:data', { id, data })
      }
    })

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[PTY] Terminal ${id} exited with code ${exitCode}`)
      instance.isAlive = false
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('pty:exit', { id, exitCode })
      }
    })

    return { model }
  } catch (error) {
    const wrappedError = wrapPtyStartupError(error, {
      electronPath,
      cliPath,
      workDir,
      helperPath
    })

    console.error(`[PTY] Failed to create terminal ${id}:`, wrappedError.message)
    throw wrappedError
  }
}

/**
 * Write data to a PTY (forward user keyboard input).
 */
export function writePty(id: string, data: string): void {
  const instance = ptyInstances.get(id)
  if (instance?.isAlive) {
    instance.pty.write(data)
  }
}

/**
 * Resize a PTY terminal.
 */
export function resizePty(id: string, cols: number, rows: number): void {
  const instance = ptyInstances.get(id)
  if (instance?.isAlive) {
    try {
      instance.pty.resize(cols, rows)
    } catch (e) {
      console.error(`[PTY] Failed to resize terminal ${id}:`, e)
    }
  }
}

/**
 * Destroy a PTY instance and kill its process.
 */
export function destroyPty(id: string): void {
  const instance = ptyInstances.get(id)
  if (instance) {
    console.log(`[PTY] Destroying terminal ${id}`)
    if (instance.isAlive) {
      try {
        instance.pty.kill()
      } catch (e) {
        console.error(`[PTY] Failed to kill terminal ${id}:`, e)
      }
    }
    ptyInstances.delete(id)
  }
}

/**
 * Destroy all PTY instances. Called on app shutdown.
 */
export function destroyAllPtys(): void {
  console.log(`[PTY] Destroying all terminals (${ptyInstances.size} active)`)
  for (const id of Array.from(ptyInstances.keys())) {
    destroyPty(id)
  }
}

/**
 * Get info about a PTY instance.
 */
export function getPtyInfo(id: string): { model: string; isAlive: boolean } | null {
  const instance = ptyInstances.get(id)
  if (!instance) return null
  return { model: instance.model, isAlive: instance.isAlive }
}

/**
 * List all active PTY IDs.
 */
export function getPtyIds(): string[] {
  return Array.from(ptyInstances.keys())
}
