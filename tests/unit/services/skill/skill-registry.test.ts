import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureSkillsInitialized,
  getAllSkills,
  getSkillsDir,
  invalidateSkillsCache
} from '../../../../src/main/services/skill'

function writeSkill(baseDir: string, dirName: string, skillName = dirName): string {
  const skillDir = path.join(baseDir, dirName)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---
name: ${skillName}
description: ${skillName} description
---

# ${skillName}
`,
    'utf-8'
  )
  return skillDir
}

describe('skill registry refresh', () => {
  const originalDataDir = process.env.SKILLSFAN_DATA_DIR

  beforeEach(() => {
    invalidateSkillsCache()
  })

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.SKILLSFAN_DATA_DIR
    } else {
      process.env.SKILLSFAN_DATA_DIR = originalDataDir
    }
    invalidateSkillsCache()
  })

  it('force refresh discovers skills from .skillsfan-dev, .skillsfan, and .claude even with SKILLSFAN_DATA_DIR set', async () => {
    const testHome = globalThis.__HALO_TEST_DIR__
    process.env.SKILLSFAN_DATA_DIR = path.join(testHome, '.skillsfan-dev')

    const primarySkillsDir = getSkillsDir()
    const prodSkillsDir = path.join(testHome, '.skillsfan', 'skills')
    const claudeSkillsDir = path.join(testHome, '.claude', 'skills')

    await ensureSkillsInitialized(undefined, { forceRefresh: true })
    expect((await getAllSkills()).map((skill) => skill.name)).toEqual([])

    writeSkill(primarySkillsDir, 'installed-skill')
    writeSkill(prodSkillsDir, 'finder-skill')
    writeSkill(claudeSkillsDir, 'claude-manual-skill')

    await ensureSkillsInitialized(undefined, { forceRefresh: true })

    const skillNames = (await getAllSkills()).map((skill) => skill.name)
    expect(skillNames).toEqual(expect.arrayContaining([
      'installed-skill',
      'finder-skill',
      'claude-manual-skill'
    ]))
  })
})
