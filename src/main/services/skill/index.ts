/**
 * Skill 模块公共 API
 */

export type { SkillInfo, SkillSource } from './types'

export {
  initializeRegistry,
  getAllSkills,
  getSkill,
  hasSkills,
  getSkillsSignature,
  getSkillsDir,
  getAllSkillsfanDirs,
  reloadSkills,
  updateSpaceWorkDir,
  ensureSkillsInitialized,
  invalidateSkillsCache
} from './skill-registry'

export { startSkillWatcher, stopSkillWatcher } from './skill-watcher'

export { createSkillMcpServer } from './skill-mcp-server'

export { getClaudeSkillsDir, syncNativeClaudeSkillBridges } from './native-bridge'

export {
  installSkill,
  deleteSkill,
  openSkillFolder,
  selectSkillArchive,
  saveSkillContent,
  updateSkillIcon
} from './skill-manager'

export { getSkillContent } from './skill-loader'

export { resolveSkillCreatorPrompt, buildSkillCreatorPrompt } from './skill-creator-prompt'
