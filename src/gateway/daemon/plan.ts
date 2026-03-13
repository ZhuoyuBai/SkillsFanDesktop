import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { getGatewayDaemonStatus, type GatewayDaemonManager } from './status'

export type GatewayDaemonInstallFileKind =
  | 'launch-agent'
  | 'systemd-unit'
  | 'task-scheduler-xml'

export interface GatewayDaemonCommandSpec {
  command: string
  args: string[]
}

export interface GatewayDaemonInstallFile {
  kind: GatewayDaemonInstallFileKind
  path: string
  content: string
}

export interface GatewayDaemonInstallPlan {
  supported: boolean
  manager: GatewayDaemonManager
  label: string
  taskName: string
  executablePath: string
  args: string[]
  workingDirectory: string | null
  environment: Record<string, string>
  files: GatewayDaemonInstallFile[]
  installCommands: GatewayDaemonCommandSpec[]
  uninstallCommands: GatewayDaemonCommandSpec[]
  notes: string[]
}

interface GatewayDaemonInstallPlanOptions {
  platform?: NodeJS.Platform
  userHome?: string
  executablePath?: string
  workingDirectory?: string | null
}

function resolveDaemonManagerForPlatform(platform: NodeJS.Platform): GatewayDaemonManager {
  switch (platform) {
    case 'darwin':
      return 'launch-agent'
    case 'linux':
      return 'systemd'
    case 'win32':
      return 'task-scheduler'
    default:
      return 'manual'
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeSystemdValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function quoteWindowsArgument(value: string): string {
  if (!value.includes(' ') && !value.includes('"')) {
    return value
  }

  return `"${value.replace(/"/g, '\\"')}"`
}

function resolveWorkingDirectory(options?: GatewayDaemonInstallPlanOptions): string | null {
  if (options?.workingDirectory !== undefined) {
    return options.workingDirectory
  }

  const daemonStatus = getGatewayDaemonStatus()
  return daemonStatus.statusFilePath ? dirname(dirname(daemonStatus.statusFilePath)) : process.cwd()
}

function buildLaunchAgentPlan(args: {
  label: string
  executablePath: string
  appArgs: string[]
  workingDirectory: string | null
  environment: Record<string, string>
  userHome: string
}): Pick<GatewayDaemonInstallPlan, 'files' | 'installCommands' | 'uninstallCommands' | 'notes'> {
  const filePath = join(args.userHome, 'Library', 'LaunchAgents', `${args.label}.plist`)
  const programArguments = [args.executablePath, ...args.appArgs]
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join('\n')
  const environmentVariables = Object.entries(args.environment)
    .map(([key, value]) => `      <key>${escapeXml(key)}</key>\n      <string>${escapeXml(value)}</string>`)
    .join('\n')

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${escapeXml(args.label)}</string>
    <key>ProgramArguments</key>
    <array>
${programArguments}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
${args.workingDirectory ? `    <key>WorkingDirectory</key>\n    <string>${escapeXml(args.workingDirectory)}</string>\n` : ''}    <key>EnvironmentVariables</key>
    <dict>
${environmentVariables}
    </dict>
  </dict>
</plist>
`

  return {
    files: [{
      kind: 'launch-agent',
      path: filePath,
      content
    }],
    installCommands: [
      {
        command: 'launchctl',
        args: ['bootstrap', `gui/${process.getuid?.() || '<uid>'}`, filePath]
      },
      {
        command: 'launchctl',
        args: ['enable', `gui/${process.getuid?.() || '<uid>'}/${args.label}`]
      }
    ],
    uninstallCommands: [
      {
        command: 'launchctl',
        args: ['bootout', `gui/${process.getuid?.() || '<uid>'}/${args.label}`]
      }
    ],
    notes: [
      'Write the plist to ~/Library/LaunchAgents before running launchctl bootstrap.',
      'This skeleton does not yet invoke launchctl automatically.'
    ]
  }
}

function buildSystemdPlan(args: {
  label: string
  executablePath: string
  appArgs: string[]
  workingDirectory: string | null
  environment: Record<string, string>
  userHome: string
}): Pick<GatewayDaemonInstallPlan, 'files' | 'installCommands' | 'uninstallCommands' | 'notes'> {
  const filePath = join(args.userHome, '.config', 'systemd', 'user', `${args.label}.service`)
  const environmentLines = Object.entries(args.environment)
    .map(([key, value]) => `Environment="${escapeSystemdValue(key)}=${escapeSystemdValue(value)}"`)
    .join('\n')
  const execStart = [args.executablePath, ...args.appArgs]
    .map((value) => quoteWindowsArgument(value))
    .join(' ')

  const content = `[Unit]
Description=SkillsFan Gateway
After=default.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=always
RestartSec=3
${args.workingDirectory ? `WorkingDirectory=${escapeSystemdValue(args.workingDirectory)}\n` : ''}${environmentLines}

[Install]
WantedBy=default.target
`

  return {
    files: [{
      kind: 'systemd-unit',
      path: filePath,
      content
    }],
    installCommands: [
      {
        command: 'systemctl',
        args: ['--user', 'daemon-reload']
      },
      {
        command: 'systemctl',
        args: ['--user', 'enable', '--now', `${args.label}.service`]
      }
    ],
    uninstallCommands: [
      {
        command: 'systemctl',
        args: ['--user', 'disable', '--now', `${args.label}.service`]
      }
    ],
    notes: [
      'Write the service file to ~/.config/systemd/user before enabling it.',
      'This skeleton does not yet invoke systemctl automatically.'
    ]
  }
}

function buildTaskSchedulerPlan(args: {
  taskName: string
  executablePath: string
  appArgs: string[]
  workingDirectory: string | null
  environment: Record<string, string>
  userHome: string
}): Pick<GatewayDaemonInstallPlan, 'files' | 'installCommands' | 'uninstallCommands' | 'notes'> {
  const filePath = join(args.userHome, 'AppData', 'Local', 'SkillsFan', 'gateway', `${args.taskName}.xml`)
  const argumentsText = escapeXml(args.appArgs.map((value) => quoteWindowsArgument(value)).join(' '))
  const commandText = escapeXml(args.executablePath)
  const workingDirectoryText = args.workingDirectory ? escapeXml(args.workingDirectory) : ''
  const environmentComment = Object.entries(args.environment)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')

  const content = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <StartWhenAvailable>true</StartWhenAvailable>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${commandText}</Command>
      <Arguments>${argumentsText}</Arguments>
      ${workingDirectoryText ? `<WorkingDirectory>${workingDirectoryText}</WorkingDirectory>` : ''}
    </Exec>
  </Actions>
  <!-- Environment: ${escapeXml(environmentComment)} -->
</Task>
`

  return {
    files: [{
      kind: 'task-scheduler-xml',
      path: filePath,
      content
    }],
    installCommands: [
      {
        command: 'schtasks',
        args: ['/Create', '/TN', args.taskName, '/XML', filePath, '/F']
      }
    ],
    uninstallCommands: [
      {
        command: 'schtasks',
        args: ['/Delete', '/TN', args.taskName, '/F']
      }
    ],
    notes: [
      'Write the XML to disk before creating the scheduled task.',
      'Windows Task Scheduler cannot inject arbitrary environment variables directly, so the skeleton records them alongside the XML.'
    ]
  }
}

export function getGatewayDaemonInstallPlan(
  options?: GatewayDaemonInstallPlanOptions
): GatewayDaemonInstallPlan {
  const daemonStatus = getGatewayDaemonStatus()
  const platform = options?.platform || process.platform
  const manager = resolveDaemonManagerForPlatform(platform)
  const userHome = options?.userHome || homedir()
  const executablePath = options?.executablePath || process.execPath
  const workingDirectory = resolveWorkingDirectory(options)
  const label = 'com.skillsfan.gateway'
  const taskName = 'SkillsFanGateway'
  const appArgs = ['--gateway-external']
  const environment = {
    SKILLSFAN_GATEWAY_ONLY: '1',
    SKILLSFAN_GATEWAY_ROLE: 'external'
  }

  const basePlan: GatewayDaemonInstallPlan = {
    supported: manager !== 'manual',
    manager,
    label,
    taskName,
    executablePath,
    args: appArgs,
    workingDirectory,
    environment,
    files: [],
    installCommands: [],
    uninstallCommands: [],
    notes: []
  }

  if (platform === 'darwin') {
    return {
      ...basePlan,
      ...buildLaunchAgentPlan({
        label,
        executablePath,
        appArgs,
        workingDirectory,
        environment,
        userHome
      })
    }
  }

  if (platform === 'linux') {
    return {
      ...basePlan,
      ...buildSystemdPlan({
        label,
        executablePath,
        appArgs,
        workingDirectory,
        environment,
        userHome
      })
    }
  }

  if (platform === 'win32') {
    return {
      ...basePlan,
      ...buildTaskSchedulerPlan({
        taskName,
        executablePath,
        appArgs,
        workingDirectory,
        environment,
        userHome
      })
    }
  }

  return {
    ...basePlan,
    supported: false,
    manager: 'manual',
    notes: [
      'Gateway daemon installation is not supported on this platform yet.'
    ]
  }
}
