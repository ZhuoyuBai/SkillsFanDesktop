/**
 * IPC Handler Utilities
 *
 * Provides a wrapper to eliminate repetitive try-catch boilerplate
 * in IPC handlers. All handlers follow the same pattern:
 *   { success: true, data?: T } on success
 *   { success: false, error: string } on failure
 */

import { ipcMain } from 'electron'

type IpcResponse<T = unknown> = {
  success: true
  data?: T
} | {
  success: false
  error: string
}

/**
 * Register an IPC handler with automatic error wrapping.
 *
 * Usage:
 *   ipcHandle('space:list', () => listSpaces())
 *   ipcHandle('space:get', (_e, id: string) => getSpace(id))
 *   ipcHandle('agent:send', async (_e, req) => { await send(req) })
 */
export function ipcHandle<T>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...args)
      // If handler returns undefined/void, just return success
      return result === undefined
        ? { success: true }
        : { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message } as IpcResponse
    }
  })
}
