/**
 * Space IPC Handlers
 */

import { dialog } from 'electron'
import {
  getHaloSpace,
  listSpaces,
  createSpace,
  deleteSpace,
  getSpace,
  openSpaceFolder,
  updateSpace,
  updateSpacePreferences,
  getSpacePreferences,
  listWorkspaceFiles,
  isExistingDirectory
} from '../services/space.service'
import { getSpacesDir, setActiveSpaceId } from '../services/config.service'
import { ipcHandle } from './utils'

// Import types for preferences
interface SpaceLayoutPreferences {
  artifactRailExpanded?: boolean
  chatWidth?: number
}

interface SpacePreferences {
  layout?: SpaceLayoutPreferences
}

export function registerSpaceHandlers(): void {
  ipcHandle('space:set-active', (_e, spaceId: string) => {
    setActiveSpaceId(spaceId)
  })

  ipcHandle('space:get-halo', () => getHaloSpace())

  ipcHandle('space:list', () => listSpaces())

  ipcHandle('space:create',
    (_e, input: { name: string; icon: string; iconColor?: string; customPath?: string }) =>
      createSpace(input)
  )

  ipcHandle('space:delete', (_e, spaceId: string) => deleteSpace(spaceId))

  ipcHandle('space:get', (_e, spaceId: string) => getSpace(spaceId))

  ipcHandle('space:open-folder', (_e, spaceId: string) => openSpaceFolder(spaceId))

  ipcHandle('space:update',
    (_e, spaceId: string, updates: { name?: string; icon?: string; iconColor?: string }) =>
      updateSpace(spaceId, updates)
  )

  ipcHandle('space:get-default-path', () => getSpacesDir())

  // Select folder dialog (for custom space location)
  ipcHandle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Space Location',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Folder'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcHandle('space:path-exists', (_e, targetPath: string) => isExistingDirectory(targetPath))

  ipcHandle('space:update-preferences',
    (_e, spaceId: string, preferences: Partial<SpacePreferences>) =>
      updateSpacePreferences(spaceId, preferences)
  )

  ipcHandle('space:get-preferences', (_e, spaceId: string) => getSpacePreferences(spaceId))

  ipcHandle('space:list-files', (_e, spaceId: string, query?: string) =>
    listWorkspaceFiles(spaceId, { query })
  )
}
