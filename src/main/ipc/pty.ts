/**
 * PTY IPC Handlers
 *
 * Connects the renderer process to the PTY manager for
 * embedded Claude Code CLI terminals in the Canvas.
 */

import { BrowserWindow } from 'electron'
import { ipcHandle } from './utils'
import {
  createPty,
  writePty,
  resizePty,
  destroyPty,
  getPtyIds,
  getPtyInfo,
  setPtyMainWindow,
  type CreatePtyOptions
} from '../services/pty-manager.service'

/**
 * Register all PTY-related IPC handlers
 */
export function registerPtyHandlers(mainWindow: BrowserWindow | null) {
  if (!mainWindow) {
    console.warn('[PTY IPC] No main window provided, skipping registration')
    return
  }

  // Set main window reference for sending events back to renderer
  setPtyMainWindow(mainWindow)

  // Create a PTY and start Claude Code CLI
  ipcHandle('pty:create', async (_e, options: CreatePtyOptions) => {
    return await createPty(options)
  })

  // Write data to PTY (user keyboard input)
  ipcHandle('pty:write', (_e, id: string, data: string) => {
    writePty(id, data)
  })

  // Resize PTY
  ipcHandle('pty:resize', (_e, id: string, cols: number, rows: number) => {
    resizePty(id, cols, rows)
  })

  // Destroy PTY
  ipcHandle('pty:destroy', (_e, id: string) => {
    destroyPty(id)
  })

  // List active PTY IDs
  ipcHandle('pty:list', () => {
    return getPtyIds()
  })

  // Get PTY info
  ipcHandle('pty:info', (_e, id: string) => {
    return getPtyInfo(id)
  })
}
