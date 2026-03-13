/**
 * Remote Access IPC Handlers
 * Allows renderer to control remote access features
 */

import { BrowserWindow } from 'electron'
import {
  enableRemoteAccess,
  disableRemoteAccess,
  enableTunnel,
  disableTunnel,
  getRemoteAccessStatus,
  generateQRCode,
  onRemoteAccessStatusChange,
  setCustomPassword,
  regeneratePassword
} from '../../gateway/server/remote'
import { ipcHandle } from './utils'

let mainWindow: BrowserWindow | null = null

export function registerRemoteHandlers(window: BrowserWindow | null): void {
  mainWindow = window

  ipcHandle('remote:enable', (_e, port?: number) => enableRemoteAccess(mainWindow, port))

  ipcHandle('remote:disable', () => disableRemoteAccess())

  ipcHandle('remote:tunnel:enable', async () => {
    const url = await enableTunnel()
    return { url }
  })

  ipcHandle('remote:tunnel:disable', () => disableTunnel())

  ipcHandle('remote:status', () => getRemoteAccessStatus())

  ipcHandle('remote:qrcode', async (_e, includeToken?: boolean) => {
    const qrCode = await generateQRCode(includeToken)
    return { qrCode }
  })

  // Set up status change listener
  onRemoteAccessStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote:status-change', status)
    }
  })

  ipcHandle('remote:set-password', (_e, password: string) => {
    const result = setCustomPassword(password)
    if (!result.success) throw new Error(result.error)
    return getRemoteAccessStatus()
  })

  ipcHandle('remote:regenerate-password', () => {
    regeneratePassword()
    return getRemoteAccessStatus()
  })

  console.log('[IPC] Remote access handlers registered')
}
