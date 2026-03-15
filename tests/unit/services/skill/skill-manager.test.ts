import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'

import { getTestDir } from '../../setup'
import { getClaudeSkillsDir, getSkillsDir } from '../../../../src/main/services/skill'
import { deleteSkill, installSkill } from '../../../../src/main/services/skill/skill-manager'

function createSkillArchive(skillName: string, archiveName = `${skillName}.zip`): string {
  const testDir = getTestDir()
  const sourceRoot = path.join(testDir, 'archive-src', skillName)
  fs.mkdirSync(sourceRoot, { recursive: true })
  fs.writeFileSync(
    path.join(sourceRoot, 'SKILL.md'),
    `---
name: ${skillName}
description: Test skill ${skillName}
---

# ${skillName}

Use this skill in tests.
`,
    'utf-8'
  )

  const archivePath = path.join(testDir, archiveName)
  const zip = new AdmZip()
  zip.addLocalFolder(sourceRoot, skillName)
  zip.writeZip(archivePath)
  return archivePath
}

describe('skill-manager sync', () => {
  it('installs skills into SkillsFan and syncs them to ~/.claude/skills', async () => {
    const archivePath = createSkillArchive('demo-skill')

    const result = await installSkill(archivePath)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      skillName: 'demo-skill',
      path: path.join(getSkillsDir(), 'demo-skill')
    })
    expect(fs.existsSync(path.join(getSkillsDir(), 'demo-skill', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(getClaudeSkillsDir(), 'demo-skill', 'SKILL.md'))).toBe(true)
    expect(
      JSON.parse(
        fs.readFileSync(path.join(getClaudeSkillsDir(), 'demo-skill', '.skillsfan-sync.json'), 'utf-8')
      )
    ).toEqual({
      managedBy: 'skillsfan',
      skillName: 'demo-skill'
    })
  })

  it('returns a conflict when ~/.claude/skills already has an unmanaged skill with the same name', async () => {
    const archivePath = createSkillArchive('conflict-skill')
    const existingClaudePath = path.join(getClaudeSkillsDir(), 'conflict-skill')
    fs.mkdirSync(existingClaudePath, { recursive: true })
    fs.writeFileSync(
      path.join(existingClaudePath, 'SKILL.md'),
      `---
name: conflict-skill
description: Existing unmanaged Claude skill
---

# conflict-skill
`,
      'utf-8'
    )

    const result = await installSkill(archivePath)

    expect(result.success).toBe(false)
    expect(result.conflict).toEqual({
      skillName: 'conflict-skill',
      existingPath: existingClaudePath
    })
  })

  it('deletes the synced Claude copy together with the SkillsFan-managed skill', async () => {
    const archivePath = createSkillArchive('delete-me')
    const installResult = await installSkill(archivePath)

    expect(installResult.success).toBe(true)
    expect(deleteSkill('delete-me')).toEqual({ success: true })
    expect(fs.existsSync(path.join(getSkillsDir(), 'delete-me'))).toBe(false)
    expect(fs.existsSync(path.join(getClaudeSkillsDir(), 'delete-me'))).toBe(false)
  })
})
