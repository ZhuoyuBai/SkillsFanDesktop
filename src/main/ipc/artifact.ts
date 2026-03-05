/**
 * Artifact IPC Handlers - Handle artifact-related requests from renderer
 */

import { shell } from 'electron'
import { listArtifacts, listArtifactsTree, readArtifactContent } from '../services/artifact.service'
import { ipcHandle } from './utils'

export function registerArtifactHandlers(): void {
  ipcHandle('artifact:list', (_e, spaceId: string) => listArtifacts(spaceId))

  ipcHandle('artifact:list-tree', (_e, spaceId: string) => listArtifactsTree(spaceId))

  ipcHandle('artifact:open', async (_e, filePath: string) => {
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
  })

  ipcHandle('artifact:show-in-folder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcHandle('artifact:read-content', (_e, filePath: string) => readArtifactContent(filePath))
}
