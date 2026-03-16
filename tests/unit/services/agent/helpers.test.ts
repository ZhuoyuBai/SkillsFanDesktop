import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestDir } from '../../setup'

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: vi.fn(() => ({})),
  getTempSpacePath: vi.fn(() => '/tmp/skillsfan-temp')
}))

vi.mock('../../../../src/main/services/space.service', () => ({
  getSpace: vi.fn(() => null)
}))

vi.mock('../../../../src/main/services/ai-sources', () => ({
  getAISourceManager: vi.fn(() => ({
    ensureInitialized: vi.fn(async () => {}),
    getBackendConfig: vi.fn(() => null)
  }))
}))

vi.mock('../../../../src/main/services/channel', () => ({
  getChannelManager: vi.fn(() => ({
    getChannel: vi.fn(() => null)
  })),
  createOutboundEvent: vi.fn(() => ({}))
}))

describe('agent helpers', () => {
  const originalPlatform = process.platform
  const originalExecPath = process.execPath

  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true, writable: true })
  })

  it('recreates a broken headless-electron symlink when the app path changes', async () => {
    const testDir = getTestDir()
    const electronPath = path.join(testDir, 'Electron.app', 'Contents', 'MacOS', 'Electron')
    fs.mkdirSync(path.dirname(electronPath), { recursive: true })
    fs.writeFileSync(electronPath, '')

    Object.defineProperty(process, 'execPath', {
      value: electronPath,
      configurable: true,
      writable: true
    })

    const userDataDir = path.join(testDir, '.halo')
    const headlessDir = path.join(userDataDir, 'headless-electron')
    const headlessSymlinkPath = path.join(headlessDir, 'electron-node')
    fs.mkdirSync(headlessDir, { recursive: true })
    fs.symlinkSync(path.join(testDir, 'old-copy', 'Electron.app', 'Contents', 'MacOS', 'Electron'), headlessSymlinkPath)

    const { getHeadlessElectronPath } = await import('../../../../src/main/services/agent/helpers')

    const resolvedPath = getHeadlessElectronPath()

    expect(resolvedPath).toBe(headlessSymlinkPath)
    expect(fs.lstatSync(headlessSymlinkPath).isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(headlessSymlinkPath)).toBe(electronPath)
  })
})
