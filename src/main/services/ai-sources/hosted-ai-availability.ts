import type { AISourceType, AISourcesConfig, CustomSourceConfig, OAuthSourceConfig } from '../../../shared/types'
import type { ProductFeatures } from '../../../shared/types'
import { isSkillsFanHostedProviderType } from '../../../shared/constants/providers'
import { getProductFeatures, normalizeProductFeatures } from './auth-loader'

function isNamedCustomSourceConfig(value: unknown): value is CustomSourceConfig {
  return !!value && typeof value === 'object' && 'apiKey' in value && !('loggedIn' in value)
}

function isOAuthSourceConfig(value: unknown): value is OAuthSourceConfig {
  return !!value && typeof value === 'object' && 'loggedIn' in value
}

export function isSkillsFanHostedAiEnabled(features?: ProductFeatures): boolean {
  return normalizeProductFeatures(features ?? getProductFeatures()).skillsfanHostedAiEnabled
}

export function isAiSourceHiddenByProductFeatures(
  source: string | undefined | null,
  features?: ProductFeatures
): boolean {
  return !isSkillsFanHostedAiEnabled(features) && isSkillsFanHostedProviderType(source)
}

export function getFirstConfiguredCustomSource(aiSources: AISourcesConfig): AISourceType | null {
  for (const key of Object.keys(aiSources)) {
    if (key === 'current' || key === 'custom' || key === 'oauth') continue
    const sourceConfig = aiSources[key]
    if (isNamedCustomSourceConfig(sourceConfig) && sourceConfig.apiKey) {
      return key
    }
  }

  return null
}

export function getFallbackVisibleAiSource(aiSources: AISourcesConfig): AISourceType {
  const openAIConfig = aiSources['openai-codex']
  if (isOAuthSourceConfig(openAIConfig) && openAIConfig.loggedIn) {
    return 'openai-codex'
  }

  const namedCustomSource = getFirstConfiguredCustomSource(aiSources)
  if (namedCustomSource) {
    return namedCustomSource
  }

  return 'custom'
}

export function resolveAccessibleAiSource(
  aiSources: AISourcesConfig,
  preferredSource: AISourceType | undefined
): AISourceType | undefined {
  if (!preferredSource) return preferredSource
  if (!isAiSourceHiddenByProductFeatures(preferredSource)) {
    return preferredSource
  }
  return getFallbackVisibleAiSource(aiSources)
}
