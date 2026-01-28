/**
 * Skill 模块公共 API
 */

export type { SkillInfo } from './types'

export {
  initializeRegistry,
  getAllSkills,
  getSkill,
  hasSkills,
  getSkillsDir,
  reloadSkills,
  ensureSkillsInitialized
} from './skill-registry'

export { startSkillWatcher } from './skill-watcher'

export { createSkillMcpServer } from './skill-mcp-server'

export {
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive
} from './skill-manager'
