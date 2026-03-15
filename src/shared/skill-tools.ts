export const CLAUDE_NATIVE_SKILL_TOOL_NAME = 'Skill'

export function isSkillToolName(toolName: unknown): toolName is string {
  return toolName === CLAUDE_NATIVE_SKILL_TOOL_NAME
}

export function getInvokedSkillName(input: unknown): string {
  if (!input || typeof input !== 'object') {
    return 'skill'
  }

  const record = input as Record<string, unknown>
  const skillName = record.name ?? record.skill
  return typeof skillName === 'string' && skillName.trim() ? skillName : 'skill'
}
