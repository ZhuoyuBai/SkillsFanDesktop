/**
 * SkillsFan OAuth Configuration Constants
 */

import { app } from 'electron'

// Build-time injected constants (from electron.vite.config.ts)
declare const __SKILLSFAN_REGION__: string
declare const __SKILLSFAN_API_URL__: string

// ============================================================================
// Region Detection
// ============================================================================

/**
 * Get region based on build-time constant, environment variable, or locale
 * Priority: build-time > env var > locale detection
 */
function getRegion(): 'cn' | 'overseas' {
  if (__SKILLSFAN_REGION__) {
    return __SKILLSFAN_REGION__ as 'cn' | 'overseas'
  }
  if (process.env.SKILLSFAN_REGION) {
    return process.env.SKILLSFAN_REGION as 'cn' | 'overseas'
  }
  try {
    const locale = app.getLocale()
    return (locale === 'zh-CN' || locale === 'zh-TW') ? 'cn' : 'overseas'
  } catch {
    return 'cn'
  }
}

// ============================================================================
// Server URLs
// ============================================================================

/**
 * SkillsFan API base URL
 * Priority: build-time API URL > env SKILLSFAN_API_URL > region detection
 */
export const SKILLSFAN_BASE_URL =
  __SKILLSFAN_API_URL__ ||
  process.env.SKILLSFAN_API_URL ||
  (getRegion() === 'cn' ? 'https://www.skills.fan' : 'https://skillsfan.com')

/**
 * OAuth authorization endpoint
 * User is redirected here to login/register
 */
export const SKILLSFAN_AUTHORIZE_URL = `${SKILLSFAN_BASE_URL}/auth/oauth/authorize`

/**
 * Token exchange endpoint
 * Used to exchange authorization code for tokens
 */
export const SKILLSFAN_TOKEN_URL = `${SKILLSFAN_BASE_URL}/api/oauth/token`

/**
 * User info endpoint
 * Returns current user profile
 */
export const SKILLSFAN_USER_URL = `${SKILLSFAN_BASE_URL}/api/user/me`

// ============================================================================
// OAuth Client Configuration
// ============================================================================

/**
 * OAuth client ID
 * Pre-registered in SkillsFan server
 */
export const SKILLSFAN_CLIENT_ID = 'skillsfan-electron'

/**
 * OAuth redirect URI (Deep Link)
 * Must be registered in server's allowed redirect URIs
 */
export const SKILLSFAN_REDIRECT_URI = 'skillsfan://auth/callback'

/**
 * Requested OAuth scopes
 * - user:read: Read user profile information
 */
export const SKILLSFAN_SCOPES = 'user:read'

// ============================================================================
// Timing Configuration
// ============================================================================

/**
 * Maximum time allowed for OAuth flow completion
 * After this, pending auth state is cleared
 */
export const AUTH_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Token refresh threshold
 * Refresh token when less than this time remains before expiry
 */
export const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
