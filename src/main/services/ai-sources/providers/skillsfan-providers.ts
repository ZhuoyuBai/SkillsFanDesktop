/**
 * SkillsFan Proxy Providers Registry
 *
 * Central configuration for all models proxied through the SkillsFan backend.
 * To add a new model provider, just add an entry to SKILLSFAN_PROXY_CONFIGS.
 */

import { createSkillsFanProxyProvider, type SkillsFanProxyConfig } from './skillsfan-proxy-provider'

/**
 * All SkillsFan-proxied model provider configurations.
 *
 * To add a new provider, add an entry here. No other file changes needed
 * (except adding a logo in ModelSelector.tsx if desired).
 */
export const SKILLSFAN_PROXY_CONFIGS: SkillsFanProxyConfig[] = [
  {
    type: 'glm',
    displayName: 'GLM-5',
    defaultModel: 'GLM-5-Turbo',
    modelFilter: (m) => m.owned_by === 'zhipu' || m.id.toLowerCase().includes('glm'),
    customApiFallback: 'zhipu',
  },
  {
    type: 'minimax-oauth',
    displayName: 'MiniMax',
    defaultModel: 'MiniMax-2.7',
    modelFilter: (m) => m.owned_by === 'minimax' || m.id.toLowerCase().includes('minimax'),
    customApiFallback: 'minimax',
  },
  {
    type: 'skillsfan-credits',
    displayName: 'SkillsFan Credits',
    defaultModel: '',
    // No filter — show all models
  },
]

/** Create all SkillsFan proxy provider instances */
export function createAllSkillsFanProviders() {
  return SKILLSFAN_PROXY_CONFIGS.map(config => createSkillsFanProxyProvider(config))
}

/** Generate OAuth → custom API fallback mapping from config */
export function getOAuthToCustomFallbackMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const config of SKILLSFAN_PROXY_CONFIGS) {
    if (config.customApiFallback) {
      map[config.type] = config.customApiFallback
    }
  }
  return map
}
