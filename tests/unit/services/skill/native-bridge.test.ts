import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  getClaudeSkillsDir,
  syncNativeClaudeSkillBridges
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

describe('native skill bridge', () => {
  it('creates ~/.claude/skills and bridges SkillsFan-managed skills for new users', () => {
    const testHome = globalThis.__HALO_TEST_DIR__
    const skillsfanDevDir = path.join(testHome, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()

    writeSkill(skillsfanDevDir, 'web-access')

    expect(fs.existsSync(claudeSkillsDir)).toBe(false)

    const result = syncNativeClaudeSkillBridges()

    const bridgedPath = path.join(claudeSkillsDir, 'web-access')
    expect(result.created).toEqual(['web-access'])
    expect(fs.existsSync(claudeSkillsDir)).toBe(true)
    expect(fs.lstatSync(bridgedPath).isSymbolicLink()).toBe(true)
    expect(fs.realpathSync(bridgedPath)).toBe(
      fs.realpathSync(path.join(skillsfanDevDir, 'web-access'))
    )
  })

  it('does not overwrite existing native Claude skills it does not own', () => {
    const testHome = globalThis.__HALO_TEST_DIR__
    const skillsfanDevDir = path.join(testHome, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()
    const nativeSkillDir = path.join(claudeSkillsDir, 'web-access')

    writeSkill(skillsfanDevDir, 'web-access')
    writeSkill(claudeSkillsDir, 'web-access')

    const result = syncNativeClaudeSkillBridges()

    expect(result.created).toEqual([])
    expect(result.updated).toEqual([])
    expect(result.skipped).toEqual([
      {
        skillName: 'web-access',
        path: nativeSkillDir,
        reason: 'Existing native Claude skill is not managed by SkillsFan'
      }
    ])
    expect(fs.lstatSync(nativeSkillDir).isSymbolicLink()).toBe(false)
    expect(fs.existsSync(path.join(nativeSkillDir, 'SKILL.md'))).toBe(true)
  })

  it('removes stale bridge entries that no longer map to a SkillsFan skill', () => {
    const testHome = globalThis.__HALO_TEST_DIR__
    const skillsfanDevDir = path.join(testHome, '.skillsfan-dev', 'skills')
    const claudeSkillsDir = getClaudeSkillsDir()
    const staleSkillDir = writeSkill(skillsfanDevDir, 'obsolete-skill')

    syncNativeClaudeSkillBridges()
    fs.rmSync(staleSkillDir, { recursive: true, force: true })

    const result = syncNativeClaudeSkillBridges()

    expect(result.removed).toEqual(['obsolete-skill'])
    expect(fs.existsSync(path.join(claudeSkillsDir, 'obsolete-skill'))).toBe(false)
  })
})
