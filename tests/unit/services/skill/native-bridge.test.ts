import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  getClaudeSkillsDir,
  getLegacySkillsfanDirs,
  migrateLegacySkillsToClaudeDir
} from '../../../../src/main/services/skill/native-bridge'

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

describe('native skill migration', () => {
  it('moves legacy skills into ~/.claude/skills and removes the old copy', () => {
    const legacyDir = path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()

    writeSkill(legacyDir, 'web-access')

    const result = migrateLegacySkillsToClaudeDir()
    const nativeSkillDir = path.join(claudeSkillsDir, 'web-access')

    expect(result.migrated).toEqual(['web-access'])
    expect(fs.existsSync(nativeSkillDir)).toBe(true)
    expect(fs.lstatSync(nativeSkillDir).isSymbolicLink()).toBe(false)
    expect(fs.existsSync(path.join(nativeSkillDir, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(legacyDir, 'web-access'))).toBe(false)
  })

  it('materializes legacy-owned symlinks into real native skill directories', () => {
    const legacyDir = path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()
    const legacySkillDir = writeSkill(legacyDir, 'web-access')
    const nativeSkillDir = path.join(claudeSkillsDir, 'web-access')

    fs.mkdirSync(claudeSkillsDir, { recursive: true })
    fs.symlinkSync(legacySkillDir, nativeSkillDir, 'dir')

    const result = migrateLegacySkillsToClaudeDir()

    expect(result.materialized).toEqual(['web-access'])
    expect(fs.existsSync(nativeSkillDir)).toBe(true)
    expect(fs.lstatSync(nativeSkillDir).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(path.join(nativeSkillDir, 'SKILL.md'), 'utf-8')).toContain('web-access')
    expect(fs.existsSync(legacySkillDir)).toBe(false)
  })

  it('keeps native Claude skills authoritative when legacy copies differ', () => {
    const legacyDir = path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()
    const nativeSkillDir = writeSkill(claudeSkillsDir, 'web-access', 'native-web-access')
    const legacySkillDir = writeSkill(legacyDir, 'web-access', 'legacy-web-access')

    const result = migrateLegacySkillsToClaudeDir()

    expect(result.migrated).toEqual([])
    expect(result.skipped).toEqual([
      {
        skillName: 'web-access',
        path: legacySkillDir,
        reason: 'Legacy copy differs from the native Claude skill and was kept untouched'
      }
    ])
    expect(fs.existsSync(nativeSkillDir)).toBe(true)
    expect(fs.existsSync(legacySkillDir)).toBe(true)
  })

  it('returns both legacy SkillsFan directories for cleanup logic', () => {
    const dirs = getLegacySkillsfanDirs()
    expect(dirs).toEqual([
      path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan', 'skills'),
      path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan-dev', 'skills')
    ])
  })
})
