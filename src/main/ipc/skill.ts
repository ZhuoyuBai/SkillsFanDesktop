/**
 * Skill IPC Handlers
 */

import { ipcMain } from 'electron'
import {
  getAllSkills,
  reloadSkills,
  getSkillsDir,
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive
} from '../services/skill'

export function registerSkillHandlers(): void {
  // Get all skills (auto-initializes if needed)
  ipcMain.handle('skill:list', async () => {
    try {
      const skills = await getAllSkills()
      return { success: true, data: skills }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Reload skills (rescan directory)
  ipcMain.handle('skill:reload', async () => {
    try {
      const skills = await reloadSkills()
      return { success: true, data: skills }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Get skills directory path
  ipcMain.handle('skill:get-dir', async () => {
    try {
      const dir = getSkillsDir()
      return { success: true, data: dir }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Select skill archive file
  ipcMain.handle('skill:select-archive', async () => {
    try {
      return await selectSkillArchive()
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Install skill from archive
  ipcMain.handle(
    'skill:install',
    async (_event, archivePath: string, conflictResolution?: 'replace' | 'rename' | 'cancel') => {
      try {
        return await installSkill(archivePath, conflictResolution)
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Delete skill
  ipcMain.handle('skill:delete', async (_event, skillName: string) => {
    try {
      const result = deleteSkill(skillName)
      return result
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Open skill folder
  ipcMain.handle('skill:open-folder', async (_event, skillName: string) => {
    try {
      return await openSkillFolder(skillName)
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })
}
