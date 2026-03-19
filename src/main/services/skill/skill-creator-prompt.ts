/**
 * Built-in skill-creator prompt
 *
 * Used as messagePrefix when generating a skill via the wizard.
 * Takes structured form data and outputs a complete SKILL.md.
 */

/**
 * Build the skill-creator prompt from form data.
 * The prompt instructs Claude to generate a SKILL.md and output it
 * inside a ```markdown code block for easy frontend extraction.
 */
export function buildSkillCreatorPrompt(formData: {
  skillName?: string
  whatItDoes: string
  whenToTrigger?: string
}): string {
  const parts: string[] = []
  parts.push('<skill-creator-mode>')
  parts.push('Generate a complete SKILL.md file based on the user\'s input below.')
  parts.push('')
  parts.push('## User Input')
  parts.push(`- **What it does**: ${formData.whatItDoes}`)
  if (formData.whenToTrigger) {
    parts.push(`- **When to trigger**: ${formData.whenToTrigger}`)
  }
  if (formData.skillName) {
    parts.push(`- **Preferred name**: ${formData.skillName}`)
  }
  parts.push('')
  parts.push('## Output Requirements')
  parts.push('')
  parts.push('Output the COMPLETE SKILL.md content inside a single markdown code block like this:')
  parts.push('')
  parts.push('```markdown')
  parts.push('---')
  parts.push('name: skill-name-here')
  parts.push('description: Trigger description here')
  parts.push('---')
  parts.push('')
  parts.push('# Skill Title')
  parts.push('(instructions here)')
  parts.push('```')
  parts.push('')
  parts.push('## Rules')
  parts.push('')
  parts.push('- **name**: lowercase English with hyphens (e.g., "code-review", "api-design")')
  parts.push('- **description**: This is the PRIMARY triggering mechanism. Write it to be specific and action-oriented.')
  parts.push('  Include both what the skill does AND specific scenarios when to use it.')
  parts.push('  Make it slightly "pushy" to ensure the skill triggers reliably.')
  parts.push('  Example: "Review code for bugs, security issues, and best practices. Use when the user asks for code review, PR review, code quality feedback, or mentions reviewing changes."')
  parts.push('- **body**: Write practical, actionable instructions. Explain WHY things matter, not just WHAT to do.')
  parts.push('  Use imperative form. Include examples where helpful.')
  parts.push('  Keep under 500 lines. Structure clearly with headers.')
  parts.push('- Output ONLY the markdown code block. No additional explanation before or after.')
  parts.push('</skill-creator-mode>')
  return parts.join('\n')
}

/**
 * Legacy: resolve prompt with skillsDir placeholder.
 * Kept for backward compatibility with getSkillCreatorPrompt IPC.
 */
export function resolveSkillCreatorPrompt(_skillsDir: string): string {
  // Return a generic prompt for the IPC endpoint
  return buildSkillCreatorPrompt({
    whatItDoes: '{whatItDoes}',
    whenToTrigger: '{whenToTrigger}',
    skillName: '{skillName}'
  })
}
