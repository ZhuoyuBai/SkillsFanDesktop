/**
 * SkillsFan Credits Service
 *
 * Manages credit balance queries with caching.
 * Credits are used to pay for AI model usage through the website proxy.
 *
 * Credits are persisted to disk (via auth state) so the last known balance
 * can be displayed instantly on app restart without waiting for an API call.
 */

import { getAccessToken, updateCreditsInAuthState } from './auth.service'
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
 * Seed the in-memory cache from persisted disk state (called on startup).
 * Sets fetchedAt to 0 so the cache is considered stale and will be
 * refreshed on the next getCredits() call.
 */
export function seedCreditsCache(credits: number, fetchedAt?: number): void {
  cachedCredits = {
    remainingCredits: credits,
    fetchedAt: fetchedAt || 0
  }
}

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
      const now = Date.now()
      cachedCredits = {
        remainingCredits: data.data.remainingCredits,
        fetchedAt: now
      }
      // Persist to disk for instant display on next startup
      updateCreditsInAuthState(data.data.remainingCredits, now)
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
  updateCreditsInAuthState(undefined, undefined)
}
