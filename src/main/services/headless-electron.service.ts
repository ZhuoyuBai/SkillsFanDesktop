import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'fs'
import { join } from 'path'
import { getHaloDir } from './config.service'

const HEADLESS_ELECTRON_DIR = 'headless-electron'
const HEADLESS_ELECTRON_BINARY = 'electron-node'

function ensureHeadlessElectronSymlink(targetPath: string, symlinkPath: string): void {
  try {
    const stat = lstatSync(symlinkPath)

    if (stat.isSymbolicLink() && readlinkSync(symlinkPath) === targetPath) {
      return
    }

    rmSync(symlinkPath, { recursive: true, force: true })
  } catch {
    // Missing path is expected on first launch.
  }

  symlinkSync(targetPath, symlinkPath)
}

export function getHeadlessElectronPath(): string {
  if (process.platform !== 'darwin') {
    return process.execPath
  }

  const headlessDir = join(getHaloDir(), HEADLESS_ELECTRON_DIR)
  mkdirSync(headlessDir, { recursive: true })

  const symlinkPath = join(headlessDir, HEADLESS_ELECTRON_BINARY)
  ensureHeadlessElectronSymlink(process.execPath, symlinkPath)
  return symlinkPath
}

export function getPtyRuntimePath(): string {
  return process.platform === 'darwin' ? getHeadlessElectronPath() : process.execPath
}
