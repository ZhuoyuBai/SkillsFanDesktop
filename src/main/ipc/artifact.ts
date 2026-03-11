/**
 * Artifact IPC Handlers - Handle artifact-related requests from renderer
 */

import { shell, BrowserWindow } from 'electron'
import { listArtifacts, listArtifactsTree, readArtifactContent, watchFile, unwatchFile, setFileWatcherWindow } from '../services/artifact.service'
import { normalizeLocalFilePath } from '../services/local-tools/path-utils'
import { ipcHandle } from './utils'

export function registerArtifactHandlers(mainWindow: BrowserWindow | null): void {
  if (mainWindow) {
    setFileWatcherWindow(mainWindow)
  }

  ipcHandle('artifact:list', (_e, spaceId: string) => listArtifacts(spaceId))

  ipcHandle('artifact:list-tree', (_e, spaceId: string) => listArtifactsTree(spaceId))

  ipcHandle('artifact:open', async (_e, filePath: string) => {
    const error = await shell.openPath(normalizeLocalFilePath(filePath))
    if (error) throw new Error(error)
  })

  ipcHandle('artifact:show-in-folder', (_e, filePath: string) => {
    shell.showItemInFolder(normalizeLocalFilePath(filePath))
  })

  ipcHandle('artifact:read-content', (_e, filePath: string) => readArtifactContent(filePath))

  ipcHandle('artifact:watch-file', (_e, filePath: string) => watchFile(filePath))

  ipcHandle('artifact:unwatch-file', (_e, filePath: string) => unwatchFile(filePath))
}
