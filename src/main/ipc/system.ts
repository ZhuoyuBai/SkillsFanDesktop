/**
 * System IPC Handlers - Auto launch and tray settings
 */

import { BrowserWindow } from 'electron'
import {
  setAutoLaunch,
  getAutoLaunch,
  setMinimizeToTray,
  getMinimizeToTray
} from '../services/config.service'
import { createTray, destroyTray, hasTray, updateTrayMenu } from '../services/tray.service'
import { ipcHandle } from './utils'

let mainWindow: BrowserWindow | null = null

export function registerSystemHandlers(window: BrowserWindow | null): void {
  mainWindow = window

  ipcHandle('system:get-auto-launch', () => getAutoLaunch())

  ipcHandle('system:set-auto-launch', (_e, enabled: boolean) => {
    setAutoLaunch(enabled)
    return enabled
  })

  ipcHandle('system:get-minimize-to-tray', () => getMinimizeToTray())

  ipcHandle('system:set-minimize-to-tray', (_e, enabled: boolean) => {
    setMinimizeToTray(enabled)
    if (enabled) {
      if (!hasTray()) createTray(mainWindow)
    } else {
      destroyTray()
    }
    return enabled
  })

  ipcHandle('window:set-title-bar-overlay',
    (_e, options: { color: string; symbolColor: string }) => {
      if (process.platform !== 'darwin' && mainWindow) {
        mainWindow.setTitleBarOverlay({
          color: options.color,
          symbolColor: options.symbolColor,
          height: 40
        })
      }
    }
  )

  ipcHandle('window:set-button-visibility', (_e, visible: boolean) => {
    if (process.platform === 'darwin' && mainWindow) {
      mainWindow.setWindowButtonVisibility(visible)
    }
  })

  ipcHandle('window:maximize', () => { mainWindow?.maximize() })

  ipcHandle('window:unmaximize', () => { mainWindow?.unmaximize() })

  ipcHandle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcHandle('window:toggle-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
    return mainWindow?.isMaximized() ?? false
  })

  // Listen for maximize/unmaximize events and notify renderer
  if (mainWindow) {
    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window:maximize-change', true)
    })
    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window:maximize-change', false)
    })
  }
}
