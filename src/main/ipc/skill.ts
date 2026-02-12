/**
 * Skill IPC Handlers
 */

import { ipcMain } from 'electron'
import path from 'path'
import { readFileSync } from 'fs'
import {
  getAllSkills,
  reloadSkills,
  getSkillsDir,
  getSkill,
  getSkillContent,
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive
} from '../services/skill'
import { listSlashCommands } from '../services/slash-command.service'

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

  // Get skill content (SKILL.md body without frontmatter)
  ipcMain.handle('skill:get-content', async (_event, skillName: string) => {
    try {
      const skill = getSkill(skillName)
      if (!skill) return { success: false, error: 'Skill not found' }
      const content = getSkillContent(skill.location)
      return { success: true, data: content }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Read a specific file's content within a skill directory
  ipcMain.handle('skill:get-file-content', async (_event, skillName: string, relativePath: string) => {
    try {
      const skill = getSkill(skillName)
      if (!skill) return { success: false, error: 'Skill not found' }

      let fullPath: string
      if (skill.source.kind === 'project-commands' || skill.source.kind === 'global-commands') {
        fullPath = skill.location
      } else {
        fullPath = path.resolve(skill.baseDir, relativePath)
        // Security: prevent path traversal
        if (!fullPath.startsWith(path.resolve(skill.baseDir))) {
          return { success: false, error: 'Invalid file path' }
        }
      }

      const content = readFileSync(fullPath, 'utf-8')
      return { success: true, data: content }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // List slash commands (built-in + skills from all sources)
  ipcMain.handle('skill:list-slash-commands', async (_event, spaceId?: string) => {
    try {
      const commands = await listSlashCommands(spaceId)
      return { success: true, data: commands }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })
}
