import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  configureGatewayDaemonStatus,
  prepareGatewayDaemonInstallBundle,
  resetGatewayDaemonStatusForTests
} from '../../../../src/gateway/daemon'

describe('gateway daemon installer', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skillsfan-daemon-installer-'))
  const statusFilePath = join(tempRoot, 'daemon.json')
  const lockFilePath = join(tempRoot, 'daemon.lock')
  const stagingRootDir = join(tempRoot, 'staging')

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

  it('writes a staged install bundle with manifest, readme, and command files', () => {
    const bundle = prepareGatewayDaemonInstallBundle({
      stagingRootDir,
      planOptions: {
        platform: 'linux',
        userHome: '/home/tester',
        executablePath: '/opt/SkillsFan/skillsfan'
      }
    })

    expect(bundle.supported).toBe(true)
    expect(bundle.manager).toBe('systemd')
    expect(bundle.fileCount).toBe(1)
    expect(bundle.bundleDir.startsWith(stagingRootDir)).toBe(true)
    expect(existsSync(bundle.manifestPath)).toBe(true)
    expect(existsSync(bundle.readmePath)).toBe(true)
    expect(bundle.installCommandsFilePath && existsSync(bundle.installCommandsFilePath)).toBe(true)
    expect(bundle.uninstallCommandsFilePath && existsSync(bundle.uninstallCommandsFilePath)).toBe(true)
    expect(existsSync(bundle.stagedFiles[0].stagedPath)).toBe(true)

    expect(readFileSync(bundle.stagedFiles[0].stagedPath, 'utf-8')).toContain(
      'ExecStart=/opt/SkillsFan/skillsfan --gateway-external'
    )
    expect(readFileSync(bundle.readmePath, 'utf-8')).toContain(bundle.stagedFiles[0].targetPath)
    expect(JSON.parse(readFileSync(bundle.manifestPath, 'utf-8'))).toEqual(expect.objectContaining({
      manager: 'systemd',
      fileCount: 1
    }))
  })

  it('throws on unsupported platforms', () => {
    expect(() => prepareGatewayDaemonInstallBundle({
      stagingRootDir,
      planOptions: {
        platform: 'freebsd'
      }
    })).toThrow('Gateway daemon installation is not supported on this platform yet.')
  })
})
