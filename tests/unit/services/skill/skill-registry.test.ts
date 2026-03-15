import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { getClaudeSkillsDir, getSkillsDir, reloadSkills } from '../../../../src/main/services/skill'

function writeSkill(dir: string, skillName: string, description: string): void {
  const skillDir = path.join(dir, skillName)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---
name: ${skillName}
description: ${description}
---

# ${skillName}
`,
    'utf-8'
  )
}

describe('skill-registry deduplication', () => {
  it('prefers the SkillsFan-managed skill when the same skill is also synced into ~/.claude/skills', async () => {
    writeSkill(getSkillsDir(), 'demo-skill', 'SkillsFan version')
    writeSkill(getClaudeSkillsDir(), 'demo-skill', 'Claude synced version')

    const skills = await reloadSkills()

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      name: 'demo-skill',
      description: 'SkillsFan version',
      source: { kind: 'skillsfan' }
    })
  })
})
