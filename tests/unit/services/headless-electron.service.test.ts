import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestDir } from '../setup'

vi.mock('../../../src/main/services/config.service', () => ({
  getHaloDir: vi.fn(() => path.join(getTestDir(), '.halo'))
}))

describe('headless-electron.service', () => {
  const originalPlatform = process.platform
  const originalExecPath = process.execPath

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    Object.defineProperty(process, 'execPath', {
      value: originalExecPath,
      configurable: true,
      writable: true
    })
  })

  it('creates or repairs the macOS headless symlink for PTY launches', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

    const testDir = getTestDir()
    const electronPath = path.join(testDir, 'SkillsFan.app', 'Contents', 'MacOS', 'SkillsFan')
    fs.mkdirSync(path.dirname(electronPath), { recursive: true })
    fs.writeFileSync(electronPath, '')

    Object.defineProperty(process, 'execPath', {
      value: electronPath,
      configurable: true,
      writable: true
    })

    const headlessDir = path.join(testDir, '.halo', 'headless-electron')
    const headlessPath = path.join(headlessDir, 'electron-node')
    fs.mkdirSync(headlessDir, { recursive: true })
    fs.symlinkSync(path.join(testDir, 'old', 'SkillsFan.app', 'Contents', 'MacOS', 'SkillsFan'), headlessPath)

    const { getPtyRuntimePath } = await import('../../../src/main/services/headless-electron.service')

    const resolvedPath = getPtyRuntimePath()

    expect(resolvedPath).toBe(headlessPath)
    expect(fs.lstatSync(headlessPath).isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(headlessPath)).toBe(electronPath)
  })

  it('uses the process runtime directly outside macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    Object.defineProperty(process, 'execPath', {
      value: '/usr/local/bin/skillsfan-runtime',
      configurable: true,
      writable: true
    })

    const { getPtyRuntimePath } = await import('../../../src/main/services/headless-electron.service')

    expect(getPtyRuntimePath()).toBe('/usr/local/bin/skillsfan-runtime')
  })
})
