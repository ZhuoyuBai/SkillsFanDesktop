import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  configureGatewayDaemonStatus,
  getGatewayDaemonInstallPlan,
  resetGatewayDaemonStatusForTests
} from '../../../../src/gateway/daemon'

describe('gateway daemon install plan', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skillsfan-daemon-plan-'))
  const statusFilePath = join(tempRoot, 'daemon.json')
  const lockFilePath = join(tempRoot, 'daemon.lock')

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
    mkdirSync(tempRoot, { recursive: true })
    resetGatewayDaemonStatusForTests()
    configureGatewayDaemonStatus({
      desiredMode: 'manual',
      statusFilePath,
      lockFilePath
    })
  })

  it('builds a LaunchAgent install plan for macOS', () => {
    const plan = getGatewayDaemonInstallPlan({
      platform: 'darwin',
      userHome: '/Users/tester',
      executablePath: '/Applications/SkillsFan.app/Contents/MacOS/SkillsFan'
    })

    expect(plan.supported).toBe(true)
    expect(plan.manager).toBe('launch-agent')
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0]).toMatchObject({
      kind: 'launch-agent',
      path: '/Users/tester/Library/LaunchAgents/com.skillsfan.gateway.plist'
    })
    expect(plan.files[0].content).toContain('<string>--gateway-external</string>')
    expect(plan.files[0].content).toContain('SKILLSFAN_GATEWAY_ONLY')
    expect(plan.installCommands[0]).toEqual(expect.objectContaining({
      command: 'launchctl'
    }))
  })

  it('builds a systemd user service plan for Linux', () => {
    const plan = getGatewayDaemonInstallPlan({
      platform: 'linux',
      userHome: '/home/tester',
      executablePath: '/opt/SkillsFan/skillsfan'
    })

    expect(plan.supported).toBe(true)
    expect(plan.manager).toBe('systemd')
    expect(plan.files[0]).toMatchObject({
      kind: 'systemd-unit',
      path: '/home/tester/.config/systemd/user/com.skillsfan.gateway.service'
    })
    expect(plan.files[0].content).toContain('ExecStart=/opt/SkillsFan/skillsfan --gateway-external')
    expect(plan.files[0].content).toContain('Environment="SKILLSFAN_GATEWAY_ONLY=1"')
    expect(plan.installCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'systemctl', args: ['--user', 'daemon-reload'] })
    ]))
  })

  it('builds a Task Scheduler plan for Windows', () => {
    const plan = getGatewayDaemonInstallPlan({
      platform: 'win32',
      userHome: 'C:\\Users\\tester',
      executablePath: 'C:\\Program Files\\SkillsFan\\SkillsFan.exe'
    })

    expect(plan.supported).toBe(true)
    expect(plan.manager).toBe('task-scheduler')
    expect(plan.files[0]).toMatchObject({
      kind: 'task-scheduler-xml',
      path: 'C:\\Users\\tester/AppData/Local/SkillsFan/gateway/SkillsFanGateway.xml'
    })
    expect(plan.files[0].content).toContain('<Command>C:\\Program Files\\SkillsFan\\SkillsFan.exe</Command>')
    expect(plan.files[0].content).toContain('<Arguments>--gateway-external</Arguments>')
    expect(plan.installCommands[0]).toEqual({
      command: 'schtasks',
      args: ['/Create', '/TN', 'SkillsFanGateway', '/XML', 'C:\\Users\\tester/AppData/Local/SkillsFan/gateway/SkillsFanGateway.xml', '/F']
    })
  })
})
