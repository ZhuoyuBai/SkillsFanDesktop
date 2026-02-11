/**
 * Skill 模块类型定义
 */

/**
 * 技能来源
 */
export type SkillSource =
  | { kind: 'skillsfan' }                              // ~/.skillsfan/skills/
  | { kind: 'project-commands'; projectDir: string }   // {project}/.claude/commands/
  | { kind: 'global-commands' }                        // ~/.claude/commands/
  | { kind: 'claude-skills' }                          // ~/.claude/skills/
  | { kind: 'agents-skills' }                          // ~/.agents/skills/

/**
 * 技能信息（从 SKILL.md 或 .md 解析）
 */
export interface SkillInfo {
  /** 技能唯一标识（英文） */
  name: string
  /** 技能显示名称（中文，从 H1 标题提取） */
  displayName: string
  /** 技能描述（用于 Claude 语义匹配） */
  description: string
  /** SKILL.md 或 .md 文件绝对路径 */
  location: string
  /** 技能根目录（commands 格式为文件所在目录） */
  baseDir: string
  /** 技能来源 */
  source: SkillSource
  /** 是否为只读（原生 Claude Code 技能不可删除） */
  readonly: boolean
}
