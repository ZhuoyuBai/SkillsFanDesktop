/**
 * Skill IPC Handlers
 */

import { ipcMain } from 'electron'
import { getAllSkills, reloadSkills, getSkillsDir } from '../services/skill'

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
}
