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
import { ipcHandle } from './utils'

export function registerSkillHandlers(): void {
  ipcHandle('skill:list', () => getAllSkills())

  ipcHandle('skill:reload', () => reloadSkills())

  ipcHandle('skill:get-dir', () => getSkillsDir())

  // These handlers return their own { success, data?, error?, conflict? } structure,
  // so use ipcMain.handle directly to avoid double-wrapping by ipcHandle
  ipcMain.handle('skill:select-archive', () => selectSkillArchive())

  ipcMain.handle('skill:install',
    (_e, archivePath: string, conflictResolution?: 'replace' | 'rename' | 'cancel') =>
      installSkill(archivePath, conflictResolution)
  )

  ipcMain.handle('skill:delete', (_e, skillName: string) => deleteSkill(skillName))

  ipcMain.handle('skill:open-folder', (_e, skillName: string) => openSkillFolder(skillName))

  ipcHandle('skill:get-content', (_e, skillName: string) => {
    const skill = getSkill(skillName)
    if (!skill) throw new Error('Skill not found')
    return getSkillContent(skill.location)
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

  ipcHandle('skill:list-slash-commands', (_e, spaceId?: string) => listSlashCommands(spaceId))
}
