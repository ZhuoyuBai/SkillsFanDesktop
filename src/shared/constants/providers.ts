/**
 * SkillsFan Provider Metadata
 *
 * Shared constants used by both renderer UI and test fixtures when mapping
 * hosted SkillsFan providers to display labels and backend owned_by values.
 */

export interface SkillsFanProviderMeta {
  displayName: string
  defaultModel: string
  /** Backend owned_by values that map to this provider. */
  ownedBy?: string[]
}

export const SKILLSFAN_HOSTED_PROVIDER_TYPES = [
  'skillsfan-credits',
  'glm',
  'minimax-oauth'
] as const

export type SkillsFanHostedProviderType = typeof SKILLSFAN_HOSTED_PROVIDER_TYPES[number]

export function isSkillsFanHostedProviderType(type: string | undefined | null): type is SkillsFanHostedProviderType {
  return !!type && SKILLSFAN_HOSTED_PROVIDER_TYPES.includes(type as SkillsFanHostedProviderType)
}

export const SKILLSFAN_PROVIDER_META: Record<string, SkillsFanProviderMeta> = {
  'glm': { displayName: 'GLM-5', defaultModel: 'GLM-5-Turbo', ownedBy: ['zhipu'] },
  'minimax-oauth': { displayName: 'MiniMax', defaultModel: 'MiniMax-2.7', ownedBy: ['minimax'] },
  'skillsfan-credits': { displayName: 'SkillsFan Credits', defaultModel: '' },
}
