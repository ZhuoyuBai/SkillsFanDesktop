import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile
}))

import {
  configureGatewayDaemonStatus,
  executeGatewayDaemonPreparedBundle,
  getGatewayDaemonStatus,
  prepareGatewayDaemonInstallBundle,
  resetGatewayDaemonStatusForTests
} from '../../../../src/gateway/daemon'

describe('gateway daemon executor', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skillsfan-daemon-executor-'))
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
    mocks.execFile.mockReset()
    mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, 'ok', '')
    })
  })

  it('copies staged files to target paths and registers daemon on successful install', async () => {
    const bundle = prepareGatewayDaemonInstallBundle({
      stagingRootDir,
      planOptions: {
        platform: 'linux',
        userHome: tempRoot,
        executablePath: '/opt/SkillsFan/skillsfan'
      }
    })

    const result = await executeGatewayDaemonPreparedBundle({
      action: 'install',
      bundleDir: bundle.bundleDir
    })

    expect(result.success).toBe(true)
    expect(result.copiedFileCount).toBe(1)
    expect(result.commands).toHaveLength(2)
    expect(result.rollbackHints).toEqual(expect.arrayContaining([
      expect.stringContaining('uninstall-commands.txt'),
      expect.stringContaining(result.copiedTargets[0])
    ]))
    expect(result.cleanupHints).toEqual(expect.arrayContaining([
      expect.stringContaining(result.bundleDir)
    ]))
    expect(mocks.execFile).toHaveBeenCalledTimes(2)
    expect(existsSync(result.copiedTargets[0])).toBe(true)
    expect(readFileSync(result.copiedTargets[0], 'utf-8')).toContain('ExecStart=/opt/SkillsFan/skillsfan --gateway-external')
    expect(getGatewayDaemonStatus()).toEqual(expect.objectContaining({
      desiredMode: 'daemon',
      registered: true
    }))
  })

  it('returns structured command failure details and keeps daemon unregistered', async () => {
    mocks.execFile.mockImplementationOnce((_command, _args, _options, callback) => {
      const error = Object.assign(new Error('command failed'), { code: 1 })
      callback(error, '', 'permission denied')
    })

    const bundle = prepareGatewayDaemonInstallBundle({
      stagingRootDir,
      planOptions: {
        platform: 'linux',
        userHome: tempRoot,
        executablePath: '/opt/SkillsFan/skillsfan'
      }
    })

    const result = await executeGatewayDaemonPreparedBundle({
      action: 'install',
      bundleDir: bundle.bundleDir
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('permission denied')
    expect(result.commands).toHaveLength(1)
    expect(result.rollbackHints).toEqual(expect.arrayContaining([
      expect.stringContaining('uninstall-commands.txt'),
      expect.stringContaining(result.copiedTargets[0])
    ]))
    expect(result.cleanupHints).toEqual(expect.arrayContaining([
      expect.stringContaining('partially installed'),
      expect.stringContaining(result.bundleDir)
    ]))
    expect(result.commands[0]).toEqual(expect.objectContaining({
      success: false,
      stderr: expect.stringContaining('permission denied')
    }))
    expect(getGatewayDaemonStatus()).toEqual(expect.objectContaining({
      registered: false,
      lastError: expect.stringContaining('permission denied')
    }))
  })
})
