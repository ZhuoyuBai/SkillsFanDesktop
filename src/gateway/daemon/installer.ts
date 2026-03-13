import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { atomicWriteJsonSync } from '../../main/utils/atomic-write'
import {
  getGatewayDaemonInstallPlan,
  type GatewayDaemonCommandSpec,
  type GatewayDaemonInstallFile,
  type GatewayDaemonManager
} from './plan'
import { getGatewayDaemonStatus } from './status'

export interface GatewayDaemonPreparedInstallFile {
  kind: GatewayDaemonInstallFile['kind']
  targetPath: string
  stagedPath: string
}

export interface GatewayDaemonPreparedInstallBundle {
  supported: boolean
  manager: GatewayDaemonManager
  generatedAt: string
  stagingRootDir: string
  bundleDir: string
  manifestPath: string
  readmePath: string
  installCommandsFilePath: string | null
  uninstallCommandsFilePath: string | null
  fileCount: number
  stagedFiles: GatewayDaemonPreparedInstallFile[]
  installCommands: GatewayDaemonCommandSpec[]
  uninstallCommands: GatewayDaemonCommandSpec[]
  notes: string[]
}

export interface GatewayDaemonPreparedInstallManifest {
  version: 1
  generatedAt: string
  supported: boolean
  manager: GatewayDaemonManager
  stagingRootDir: string
  bundleDir: string
  fileCount: number
  stagedFiles: GatewayDaemonPreparedInstallFile[]
  installCommands: GatewayDaemonCommandSpec[]
  uninstallCommands: GatewayDaemonCommandSpec[]
  notes: string[]
}

export function getGatewayDaemonPreparedInstallManifestPath(bundleDir: string): string {
  return join(bundleDir, 'manifest.json')
}

export function loadGatewayDaemonPreparedInstallManifest(
  bundleDir: string
): GatewayDaemonPreparedInstallManifest {
  const manifestPath = getGatewayDaemonPreparedInstallManifestPath(bundleDir)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as GatewayDaemonPreparedInstallManifest

  if (
    !manifest
    || manifest.version !== 1
    || typeof manifest.generatedAt !== 'string'
    || typeof manifest.manager !== 'string'
    || typeof manifest.bundleDir !== 'string'
    || !Array.isArray(manifest.stagedFiles)
    || !Array.isArray(manifest.installCommands)
    || !Array.isArray(manifest.uninstallCommands)
    || !Array.isArray(manifest.notes)
  ) {
    throw new Error('Gateway daemon install manifest is invalid.')
  }

  return manifest
}

function resolveDefaultStagingRootDir(): string {
  const daemonStatus = getGatewayDaemonStatus()
  return daemonStatus.statusFilePath
    ? join(dirname(daemonStatus.statusFilePath), 'installer-staging')
    : join(process.cwd(), '.skillsfan', 'gateway-installer-staging')
}

function buildBundleId(generatedAt: string, manager: GatewayDaemonManager): string {
  return `${generatedAt.replace(/[^0-9TZ]/g, '').replace(/Z$/, '')}-${manager}`
}

function formatCommand(spec: GatewayDaemonCommandSpec): string {
  return [spec.command, ...spec.args].join(' ')
}

function buildStagedFilePath(bundleDir: string, index: number, file: GatewayDaemonInstallFile): string {
  const fileName = `${String(index + 1).padStart(2, '0')}-${file.kind}-${basename(file.path)}`
  return join(bundleDir, 'files', fileName)
}

function buildReadmeContent(args: {
  generatedAt: string
  manager: GatewayDaemonManager
  stagedFiles: GatewayDaemonPreparedInstallFile[]
  installCommands: GatewayDaemonCommandSpec[]
  uninstallCommands: GatewayDaemonCommandSpec[]
  notes: string[]
}): string {
  const installCommands = args.installCommands.length > 0
    ? args.installCommands.map((command) => `- \`${formatCommand(command)}\``).join('\n')
    : '- None'
  const uninstallCommands = args.uninstallCommands.length > 0
    ? args.uninstallCommands.map((command) => `- \`${formatCommand(command)}\``).join('\n')
    : '- None'
  const stagedFiles = args.stagedFiles.length > 0
    ? args.stagedFiles.map((file) => `- \`${file.stagedPath}\` -> \`${file.targetPath}\``).join('\n')
    : '- None'
  const notes = args.notes.length > 0
    ? args.notes.map((note) => `- ${note}`).join('\n')
    : '- None'

  return [
    '# SkillsFan Gateway Daemon Install Bundle',
    '',
    `Generated at: ${args.generatedAt}`,
    `Manager: ${args.manager}`,
    '',
    '## Staged Files',
    stagedFiles,
    '',
    '## Install Commands',
    installCommands,
    '',
    '## Uninstall Commands',
    uninstallCommands,
    '',
    '## Notes',
    notes,
    ''
  ].join('\n')
}

export function prepareGatewayDaemonInstallBundle(options?: {
  stagingRootDir?: string
  cleanExisting?: boolean
  planOptions?: Parameters<typeof getGatewayDaemonInstallPlan>[0]
}): GatewayDaemonPreparedInstallBundle {
  const plan = getGatewayDaemonInstallPlan(options?.planOptions)
  if (!plan.supported) {
    throw new Error('Gateway daemon installation is not supported on this platform yet.')
  }

  const generatedAt = new Date().toISOString()
  const stagingRootDir = options?.stagingRootDir || resolveDefaultStagingRootDir()
  const bundleDir = join(stagingRootDir, buildBundleId(generatedAt, plan.manager))

  mkdirSync(stagingRootDir, { recursive: true })

  if (options?.cleanExisting !== false) {
    rmSync(bundleDir, { recursive: true, force: true })
  }

  mkdirSync(bundleDir, { recursive: true })

  const stagedFiles = plan.files.map((file, index) => {
    const stagedPath = buildStagedFilePath(bundleDir, index, file)
    mkdirSync(dirname(stagedPath), { recursive: true })
    writeFileSync(stagedPath, file.content, 'utf-8')

    return {
      kind: file.kind,
      targetPath: file.path,
      stagedPath
    }
  })

  const installCommandsFilePath = plan.installCommands.length > 0
    ? join(bundleDir, 'install-commands.txt')
    : null
  if (installCommandsFilePath) {
    writeFileSync(
      installCommandsFilePath,
      `${plan.installCommands.map((spec) => formatCommand(spec)).join('\n')}\n`,
      'utf-8'
    )
  }

  const uninstallCommandsFilePath = plan.uninstallCommands.length > 0
    ? join(bundleDir, 'uninstall-commands.txt')
    : null
  if (uninstallCommandsFilePath) {
    writeFileSync(
      uninstallCommandsFilePath,
      `${plan.uninstallCommands.map((spec) => formatCommand(spec)).join('\n')}\n`,
      'utf-8'
    )
  }

  const readmePath = join(bundleDir, 'README.md')
  writeFileSync(readmePath, buildReadmeContent({
    generatedAt,
    manager: plan.manager,
    stagedFiles,
    installCommands: plan.installCommands,
    uninstallCommands: plan.uninstallCommands,
    notes: plan.notes
  }), 'utf-8')

  const manifestPath = join(bundleDir, 'manifest.json')
  const manifest: GatewayDaemonPreparedInstallManifest = {
    version: 1,
    generatedAt,
    supported: plan.supported,
    manager: plan.manager,
    stagingRootDir,
    bundleDir,
    fileCount: stagedFiles.length,
    stagedFiles,
    installCommands: plan.installCommands,
    uninstallCommands: plan.uninstallCommands,
    notes: plan.notes
  }
  atomicWriteJsonSync(manifestPath, manifest, { backup: true })

  return {
    supported: plan.supported,
    manager: plan.manager,
    generatedAt,
    stagingRootDir,
    bundleDir,
    manifestPath,
    readmePath,
    installCommandsFilePath,
    uninstallCommandsFilePath,
    fileCount: stagedFiles.length,
    stagedFiles,
    installCommands: plan.installCommands,
    uninstallCommands: plan.uninstallCommands,
    notes: plan.notes
  }
}
