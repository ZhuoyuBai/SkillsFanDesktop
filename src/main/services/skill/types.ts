/**
 * Skill 模块类型定义
 */

/**
 * 技能信息（从 SKILL.md 解析）
 */
export interface SkillInfo {
  /** 技能唯一标识（英文） */
  name: string
  /** 技能显示名称（中文，从 H1 标题提取） */
  displayName: string
  /** 技能描述（用于 Claude 语义匹配） */
  description: string
  /** SKILL.md 文件绝对路径 */
  location: string
  /** 技能根目录 */
  baseDir: string
}
