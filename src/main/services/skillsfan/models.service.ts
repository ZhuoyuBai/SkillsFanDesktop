/**
 * Public Models Service
 *
 * Fetches the available model list from SkillsFan backend (no auth required).
 * Used to show model options in the selector before user login.
 * Region-specific: cn → www.skills.fan, overseas → skillsfan.com
 */

import { SKILLSFAN_BASE_URL } from './constants'
import { isSkillsFanHostedAiEnabled } from '../ai-sources/hosted-ai-availability'

// ============================================================================
// Types
// ============================================================================

export interface PublicModel {
  id: string
  name: string
  owned_by: string
}

// ============================================================================
// Cache
// ============================================================================

let cachedModels: PublicModel[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch available models from SkillsFan backend (public, no token needed).
 * Results are cached for 5 minutes.
 */
export async function fetchPublicModels(): Promise<PublicModel[]> {
  if (!isSkillsFanHostedAiEnabled()) {
    cachedModels = []
    cacheTimestamp = Date.now()
    return []
  }

  const now = Date.now()
  if (cachedModels && now - cacheTimestamp < CACHE_TTL) {
    return cachedModels
  }

  try {
    const response = await fetch(`${SKILLSFAN_BASE_URL}/api/v1/models`, {
      headers: { 'Accept': 'application/json' }
    })

    if (!response.ok) {
      console.warn(`[PublicModels] Failed to fetch: ${response.status}`)
      return cachedModels || []
    }

    const data = await response.json()
    const models: PublicModel[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      owned_by: m.owned_by || ''
    }))

    cachedModels = models
    cacheTimestamp = now
    return models
  } catch (error) {
    console.warn('[PublicModels] Fetch error:', error)
    return cachedModels || []
  }
}
