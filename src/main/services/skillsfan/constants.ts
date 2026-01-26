/**
 * SkillsFan OAuth Configuration Constants
 */

// ============================================================================
// Server URLs
// ============================================================================

/**
 * SkillsFan API base URL
 * Can be overridden via environment variable for development
 */
export const SKILLSFAN_BASE_URL =
  process.env.SKILLSFAN_API_URL || 'https://www.skills.fan'

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
