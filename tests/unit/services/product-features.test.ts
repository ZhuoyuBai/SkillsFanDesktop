import fs from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestDir } from '../setup'

function writeProductConfig(payload: Record<string, unknown>) {
  const productPath = path.join(getTestDir(), 'product.json')
  fs.writeFileSync(productPath, JSON.stringify(payload, null, 2))
  return productPath
}

describe('Product feature flags', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('defaults hosted AI feature to enabled when product.json is missing', async () => {
    const { getProductFeatures } = await import('../../../src/main/services/ai-sources/auth-loader')
    expect(getProductFeatures().skillsfanHostedAiEnabled).toBe(true)
  })

  it('filters hosted auth providers when product config disables hosted AI', async () => {
    writeProductConfig({
      name: 'SkillsFan',
      version: '1.0.0',
      features: {
        skillsfanHostedAiEnabled: false
      },
      authProviders: [
        { type: 'openai-codex', displayName: 'OpenAI', description: 'ChatGPT', icon: 'sparkles', iconBgColor: '#10a37f', recommended: false, builtin: true, enabled: true },
        { type: 'custom', displayName: 'Custom API', description: 'API', icon: 'key', iconBgColor: '#da7756', recommended: true, builtin: true, enabled: true },
        { type: 'skillsfan-credits', displayName: 'Credits', description: 'Hosted', icon: 'coins', iconBgColor: '#000', recommended: false, builtin: true, enabled: true },
        { type: 'glm', displayName: 'GLM', description: 'Hosted', icon: 'globe', iconBgColor: '#000', recommended: false, builtin: true, enabled: true }
      ]
    })

    const { getProductFeatures, getEnabledAuthProviderConfigs } = await import('../../../src/main/services/ai-sources/auth-loader')
    expect(getProductFeatures().skillsfanHostedAiEnabled).toBe(false)
    expect(getEnabledAuthProviderConfigs().map((provider) => provider.type)).toEqual([
      'openai-codex',
      'custom'
    ])
  })

  it('migrates hidden hosted current source to the first visible fallback without deleting old configs', async () => {
    writeProductConfig({
      name: 'SkillsFan',
      version: '1.0.0',
      features: {
        skillsfanHostedAiEnabled: false
      },
      authProviders: []
    })

    const { initializeApp, getConfig, getConfigPath } = await import('../../../src/main/services/config.service')
    await initializeApp()

    fs.writeFileSync(getConfigPath(), JSON.stringify({
      api: { provider: 'anthropic', apiKey: '', apiUrl: 'https://api.anthropic.com', model: 'glm-5' },
      aiSources: {
        current: 'skillsfan-credits',
        'skillsfan-credits': {
          loggedIn: true,
          model: 'glm-5',
          availableModels: ['glm-5']
        },
        openai: {
          provider: 'openai',
          apiKey: 'sk-test',
          apiUrl: 'https://api.openai.com',
          model: 'gpt-4o-mini'
        }
      },
      imageModel: {
        source: 'glm',
        model: 'glm-4v'
      },
      permissions: {
        fileAccess: 'allow',
        commandExecution: 'ask',
        networkAccess: 'allow',
        trustMode: false
      },
      appearance: { theme: 'light' },
      system: { autoLaunch: false, minimizeToTray: false },
      remoteAccess: { enabled: false, port: 3456 },
      onboarding: { completed: false },
      mcpServers: {},
      isFirstLaunch: false
    }, null, 2))

    const config = getConfig()
    expect(config.aiSources?.current).toBe('openai')
    expect((config.aiSources as Record<string, any>)['skillsfan-credits']).toBeDefined()
  })
})
