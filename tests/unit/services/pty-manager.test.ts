import fs from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getApiCredentialsForSource: vi.fn(),
  resolveSdkTransport: vi.fn()
}))

vi.mock('../../../src/main/services/pty-credentials', () => ({
  getApiCredentialsForSource: mocks.getApiCredentialsForSource,
  getWorkingDir: vi.fn(),
  resolveSdkTransport: mocks.resolveSdkTransport
}))

import { initializeApp, saveConfig } from '../../../src/main/services/config.service'
import { resolveClaudeCliEnv } from '../../../src/main/services/pty-manager.service'

describe('PTY Manager', () => {
  beforeEach(async () => {
    await initializeApp()
    mocks.getApiCredentialsForSource.mockReset()
    mocks.resolveSdkTransport.mockReset()
  })

  it('uses native Claude Code login without injecting persisted custom API credentials', async () => {
    saveConfig({
      terminal: { skipClaudeLogin: false },
      aiSources: {
        current: 'zhipu',
        zhipu: {
          provider: 'anthropic',
          apiKey: 'test-key',
          apiUrl: 'https://open.bigmodel.cn/api/anthropic',
          model: 'GLM-5-Turbo'
        }
      }
    } as any)

    const result = await resolveClaudeCliEnv({
      workDir: '/tmp/project'
    })

    expect(result).toEqual({
      env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
      },
      model: '',
      skipClaudeLogin: false
    })
    expect(mocks.getApiCredentialsForSource).not.toHaveBeenCalled()
    expect(mocks.resolveSdkTransport).not.toHaveBeenCalled()
  })

  it('injects configured API credentials in custom API terminal mode', async () => {
    mocks.getApiCredentialsForSource.mockResolvedValue({
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiKey: 'test-key',
      model: 'GLM-5-Turbo',
      provider: 'anthropic'
    })
    mocks.resolveSdkTransport.mockResolvedValue({
      anthropicBaseUrl: 'http://127.0.0.1:3457',
      anthropicApiKey: 'encoded-backend-config',
      sdkModel: 'claude-sonnet-4-20250514',
      routed: true
    })

    saveConfig({
      terminal: { skipClaudeLogin: true },
      aiSources: {
        current: 'zhipu',
        zhipu: {
          provider: 'anthropic',
          apiKey: 'test-key',
          apiUrl: 'https://open.bigmodel.cn/api/anthropic',
          model: 'GLM-5-Turbo'
        }
      }
    } as any)

    const result = await resolveClaudeCliEnv({
      workDir: '/tmp/project'
    })

    expect(mocks.getApiCredentialsForSource).toHaveBeenCalledTimes(1)
    expect(mocks.resolveSdkTransport).toHaveBeenCalledTimes(1)
    expect(result.model).toBe('GLM-5-Turbo')
    expect(result.skipClaudeLogin).toBe(true)
    expect(result.env).toMatchObject({
      ANTHROPIC_API_KEY: 'encoded-backend-config',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:3457',
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    })
  })

  it('re-links embedded Claude shared entries back to the native ~/.claude sources', async () => {
    mocks.getApiCredentialsForSource.mockResolvedValue({
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiKey: 'test-key',
      model: 'GLM-5-Turbo',
      provider: 'anthropic'
    })
    mocks.resolveSdkTransport.mockResolvedValue({
      anthropicBaseUrl: 'http://127.0.0.1:3457',
      anthropicApiKey: 'encoded-backend-config',
      sdkModel: 'claude-sonnet-4-20250514',
      routed: true
    })

    saveConfig({
      terminal: { skipClaudeLogin: true }
    } as any)

    const nativeClaudeDir = path.join(globalThis.__HALO_TEST_DIR__, '.claude')
    const embeddedConfigDir = path.join(globalThis.__HALO_TEST_DIR__, '.skillsfan-dev', 'claude-code', 'embedded')

    fs.mkdirSync(path.join(nativeClaudeDir, 'skills', 'my-skill'), { recursive: true })
    fs.writeFileSync(
      path.join(nativeClaudeDir, 'skills', 'my-skill', 'SKILL.md'),
      `---
name: my-skill
description: native skill
---
`,
      'utf-8'
    )
    fs.mkdirSync(path.join(nativeClaudeDir, 'rules'), { recursive: true })
    fs.writeFileSync(path.join(nativeClaudeDir, 'rules', 'team.md'), '# Team Rule\n', 'utf-8')
    fs.mkdirSync(path.join(nativeClaudeDir, 'commands'), { recursive: true })
    fs.writeFileSync(path.join(nativeClaudeDir, 'commands', 'ship.md'), '# Ship\n', 'utf-8')
    fs.writeFileSync(path.join(nativeClaudeDir, 'CLAUDE.md'), '# Native Memory\n', 'utf-8')
    fs.writeFileSync(path.join(nativeClaudeDir, 'settings.json'), '{"theme":"dark"}\n', 'utf-8')

    fs.mkdirSync(path.join(embeddedConfigDir, 'skills', 'stale-skill'), { recursive: true })
    fs.writeFileSync(
      path.join(embeddedConfigDir, 'skills', 'stale-skill', 'SKILL.md'),
      `---
name: stale-skill
description: stale embedded skill
---
`,
      'utf-8'
    )
    fs.writeFileSync(path.join(embeddedConfigDir, 'CLAUDE.md'), '# Stale Embedded Memory\n', 'utf-8')
    fs.writeFileSync(path.join(embeddedConfigDir, 'settings.json'), '{"theme":"light"}\n', 'utf-8')
    fs.mkdirSync(path.join(embeddedConfigDir, 'rules'), { recursive: true })
    fs.writeFileSync(path.join(embeddedConfigDir, 'rules', 'old.md'), '# Old Rule\n', 'utf-8')

    const result = await resolveClaudeCliEnv({
      workDir: '/tmp/project'
    })

    const configDir = result.env.CLAUDE_CONFIG_DIR
    expect(configDir).toBe(embeddedConfigDir)

    for (const entry of ['skills', 'commands', 'rules', 'CLAUDE.md', 'settings.json']) {
      const embeddedEntry = path.join(configDir, entry)
      const nativeEntry = path.join(nativeClaudeDir, entry)
      expect(fs.lstatSync(embeddedEntry).isSymbolicLink()).toBe(true)
      expect(fs.realpathSync(embeddedEntry)).toBe(fs.realpathSync(nativeEntry))
    }

    const backupDir = path.join(configDir, '.skillsfan-shadow-backups')
    expect(fs.existsSync(backupDir)).toBe(true)
    expect(fs.readdirSync(backupDir)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^skills-/),
        expect.stringMatching(/^CLAUDE\.md-/),
        expect.stringMatching(/^settings\.json-/),
        expect.stringMatching(/^rules-/)
      ])
    )
  })
})
