/**
 * AI Source Availability
 *
 * Stub module — SkillsFan-hosted proxy AI has been removed.
 * These functions remain as pass-throughs so existing callers compile
 * without changes.
 */

import type { AISourceType, AISourcesConfig } from '../../../shared/types'

export function isSkillsFanHostedAiEnabled(): boolean {
  return false
}

export function isAiSourceHiddenByProductFeatures(
  _source: string | undefined | null
): boolean {
  return false
}

export function getFallbackVisibleAiSource(_aiSources: AISourcesConfig): AISourceType {
  return 'custom'
}

export function resolveAccessibleAiSource(
  _aiSources: AISourcesConfig,
  preferredSource: AISourceType | undefined
): AISourceType | undefined {
  return preferredSource
}
