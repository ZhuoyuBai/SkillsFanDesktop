/**
 * SkillsFan Credits Service
 *
 * Manages credit balance queries with caching.
 * Credits are used to pay for AI model usage through the website proxy.
 */

import { getAccessToken } from './auth.service'
import { SKILLSFAN_BASE_URL } from './constants'

// ============================================================================
// Cache
// ============================================================================

interface CachedCredits {
  remainingCredits: number
  fetchedAt: number
}

let cachedCredits: CachedCredits | null = null
const CACHE_DURATION_MS = 30 * 1000 // 30 seconds

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch credits from the website API (bypasses cache)
 */
export async function fetchCredits(): Promise<number | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const response = await fetch(`${SKILLSFAN_BASE_URL}/api/user/get-user-credits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('[SkillsFan Credits] Fetch failed:', response.status)
      return null
    }

    const data = await response.json()
    if (data.code === 0 && data.data?.remainingCredits !== undefined) {
      cachedCredits = {
        remainingCredits: data.data.remainingCredits,
        fetchedAt: Date.now()
      }
      return data.data.remainingCredits
    }

    return null
  } catch (error) {
    console.error('[SkillsFan Credits] Fetch error:', error)
    return null
  }
}

/**
 * Get credits (returns cached if fresh, otherwise fetches)
 */
export async function getCredits(): Promise<number | null> {
  if (cachedCredits && Date.now() - cachedCredits.fetchedAt < CACHE_DURATION_MS) {
    return cachedCredits.remainingCredits
  }
  return await fetchCredits()
}

/**
 * Clear credits cache (call on logout)
 */
export function clearCreditsCache(): void {
  cachedCredits = null
}
