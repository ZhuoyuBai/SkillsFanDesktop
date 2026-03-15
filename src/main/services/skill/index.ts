/**
 * Skill 模块公共 API
 */

export type { SkillInfo, SkillSource } from './types'

export {
  initializeRegistry,
  getAllSkills,
  getSkill,
  getSkillsDir,
  getClaudeSkillsDir,
  reloadSkills,
  updateSpaceWorkDir,
  ensureSkillsInitialized
} from './skill-registry'

export { startSkillWatcher, stopSkillWatcher } from './skill-watcher'

export {
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive
} from './skill-manager'

export { getSkillContent } from './skill-loader'
