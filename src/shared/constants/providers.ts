/**
 * SkillsFan Provider Metadata
 *
 * Shared constants used by both main process (provider registration)
 * and renderer (ModelSelector display).
 *
 * When adding a new SkillsFan-proxied provider, add an entry here.
 */

export interface SkillsFanProviderMeta {
  displayName: string
  defaultModel: string
  /** Backend owned_by values that map to this provider */
  ownedBy?: string[]
}

export const SKILLSFAN_PROVIDER_META: Record<string, SkillsFanProviderMeta> = {
  'glm': { displayName: 'GLM-5', defaultModel: 'glm-5', ownedBy: ['zhipu'] },
  'minimax-oauth': { displayName: 'MiniMax', defaultModel: 'MiniMax-M2.1', ownedBy: ['minimax'] },
  'skillsfan-credits': { displayName: 'SkillsFan Credits', defaultModel: '' },
}
