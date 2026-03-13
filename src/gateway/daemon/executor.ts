import { copyFileSync, mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import {
  getGatewayDaemonPreparedInstallManifestPath,
  loadGatewayDaemonPreparedInstallManifest,
  prepareGatewayDaemonInstallBundle
} from './installer'
import { setGatewayDaemonError, registerGatewayDaemon, unregisterGatewayDaemon } from './status'
import type { GatewayDaemonCommandSpec, GatewayDaemonManager } from './plan'

export type GatewayDaemonExecutionAction = 'install' | 'uninstall'

export interface GatewayDaemonExecutedCommand {
  command: string
  args: string[]
  startedAt: string
  finishedAt: string
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}

export interface GatewayDaemonExecutionResult {
  action: GatewayDaemonExecutionAction
  success: boolean
  manager: GatewayDaemonManager
  bundleDir: string
  manifestPath: string
  preparedAt: string
  executedAt: string
  copiedFileCount: number
  copiedTargets: string[]
  commands: GatewayDaemonExecutedCommand[]
  rollbackHints: string[]
  cleanupHints: string[]
  error: string | null
  note: string | null
}

function buildGatewayDaemonExecutionHints(args: {
  action: GatewayDaemonExecutionAction
  bundleDir: string
  manifest: ReturnType<typeof loadGatewayDaemonPreparedInstallManifest>
  copiedTargets: string[]
  success: boolean
}): {
  rollbackHints: string[]
  cleanupHints: string[]
} {
  const rollbackHints: string[] = []
  const cleanupHints: string[] = []
  const uninstallCommandsFilePath = args.manifest.uninstallCommands.length > 0
    ? join(args.bundleDir, 'uninstall-commands.txt')
    : null

  if (args.action === 'install') {
    if (uninstallCommandsFilePath) {
      rollbackHints.push(`Run the prepared uninstall commands from ${uninstallCommandsFilePath} if you need to revert service registration.`)
    }

    if (args.copiedTargets.length > 0) {
      for (const targetPath of args.copiedTargets) {
        rollbackHints.push(`Remove copied target file if you need to revert this install: ${targetPath}`)
      }
    }

    if (!args.success && args.copiedTargets.length > 0) {
      cleanupHints.push('Install commands failed after staged files were copied. Review and remove copied target files if the daemon should not remain partially installed.')
    }
  } else {
    for (const targetPath of args.manifest.stagedFiles.map((file) => file.targetPath)) {
      cleanupHints.push(`Remove leftover target file manually if it still exists after uninstall: ${targetPath}`)
    }
  }

  cleanupHints.push(`Remove the prepared bundle directory when it is no longer needed: ${args.bundleDir}`)

  return {
    rollbackHints,
    cleanupHints
  }
}

function executeCommand(
  spec: GatewayDaemonCommandSpec,
  options?: { cwd?: string }
): Promise<GatewayDaemonExecutedCommand> {
  const startedAt = new Date().toISOString()

  return new Promise((resolve) => {
    execFile(spec.command, spec.args, { cwd: options?.cwd }, (error, stdout, stderr) => {
      const finishedAt = new Date().toISOString()
      const exitCode = typeof (error as NodeJS.ErrnoException | null)?.code === 'number'
        ? ((error as NodeJS.ErrnoException).code as number)
        : null
      const errorMessage = error instanceof Error ? error.message : ''
      const mergedStderr = [stderr, errorMessage].filter(Boolean).join(stderr && errorMessage ? '\n' : '')

      resolve({
        command: spec.command,
        args: [...spec.args],
        startedAt,
        finishedAt,
        success: !error,
        exitCode,
        stdout: stdout || '',
        stderr: mergedStderr
      })
    })
  })
}

function applyInstallFiles(bundleDir: string): string[] {
  const manifest = loadGatewayDaemonPreparedInstallManifest(bundleDir)
  const copiedTargets: string[] = []

  for (const file of manifest.stagedFiles) {
    mkdirSync(dirname(file.targetPath), { recursive: true })
    copyFileSync(file.stagedPath, file.targetPath)
    copiedTargets.push(file.targetPath)
  }

  return copiedTargets
}

export async function executeGatewayDaemonPreparedBundle(options: {
  action: GatewayDaemonExecutionAction
  bundleDir?: string
}): Promise<GatewayDaemonExecutionResult> {
  const bundleDir = options.bundleDir
    || prepareGatewayDaemonInstallBundle().bundleDir
  const manifest = loadGatewayDaemonPreparedInstallManifest(bundleDir)
  const manifestPath = getGatewayDaemonPreparedInstallManifestPath(bundleDir)
  const commandsToRun = options.action === 'install'
    ? manifest.installCommands
    : manifest.uninstallCommands
  const copiedTargets = options.action === 'install'
    ? applyInstallFiles(bundleDir)
    : []

  const commands: GatewayDaemonExecutedCommand[] = []
  let error: string | null = null

  for (const command of commandsToRun) {
    const result = await executeCommand(command, { cwd: bundleDir })
    commands.push(result)

    if (!result.success) {
      error = result.stderr || `Command failed: ${command.command}`
      break
    }
  }

  if (error) {
    setGatewayDaemonError(error)
  } else {
    setGatewayDaemonError(null)
    if (options.action === 'install') {
      registerGatewayDaemon()
    } else {
      unregisterGatewayDaemon()
    }
  }

  const { rollbackHints, cleanupHints } = buildGatewayDaemonExecutionHints({
    action: options.action,
    bundleDir,
    manifest,
    copiedTargets,
    success: !error
  })

  return {
    action: options.action,
    success: !error,
    manager: manifest.manager,
    bundleDir,
    manifestPath,
    preparedAt: manifest.generatedAt,
    executedAt: new Date().toISOString(),
    copiedFileCount: copiedTargets.length,
    copiedTargets,
    commands,
    rollbackHints,
    cleanupHints,
    error,
    note: options.action === 'uninstall'
      ? 'Staged target files are left on disk for manual cleanup.'
      : copiedTargets.length > 0
        ? 'Staged files were copied to target paths before commands ran.'
        : null
  }
}
