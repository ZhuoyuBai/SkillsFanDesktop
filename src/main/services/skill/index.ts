/**
 * Skill 模块公共 API
 */

export type { SkillInfo, SkillSource } from './types'

export {
  initializeRegistry,
  getAllSkills,
  getSkill,
  hasSkills,
  getSkillsDir,
  reloadSkills,
  updateSpaceWorkDir,
  ensureSkillsInitialized
} from './skill-registry'

export { startSkillWatcher, stopSkillWatcher } from './skill-watcher'

export { createSkillMcpServer } from './skill-mcp-server'

export {
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive,
  saveSkillContent
} from './skill-manager'

export { getSkillContent } from './skill-loader'

export { resolveSkillCreatorPrompt, buildSkillCreatorPrompt } from './skill-creator-prompt'
