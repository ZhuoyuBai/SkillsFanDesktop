/**
 * SkillsFan OAuth Types
 *
 * Shared types for SkillsFan account authentication
 * between main process and renderer process.
 */

/**
 * SkillsFan user information
 */
export interface SkillsFanUser {
  /** Unique user ID */
  id: string
  /** Display name */
  name: string
  /** Email address */
  email: string
  /** Avatar URL */
  avatar?: string
  /** Subscription plan */
  plan: 'free' | 'pro' | 'enterprise'
  /** Plan expiration timestamp (milliseconds) */
  planExpiresAt?: number
  /** Account creation timestamp (milliseconds) */
  createdAt: number
}

/**
 * SkillsFan authentication state
 */
export interface SkillsFanAuthState {
  /** Whether user is logged in */
  isLoggedIn: boolean
  /** User information (if logged in) */
  user?: SkillsFanUser
  /** Access token (if logged in) */
  accessToken?: string
  /** Refresh token (if logged in) */
  refreshToken?: string
  /** Token expiration timestamp (milliseconds) */
  tokenExpiresAt?: number
}

/**
 * Pending OAuth authentication request
 * Stored temporarily during the OAuth flow
 */
export interface PendingAuth {
  /** Random state for CSRF protection */
  state: string
  /** PKCE code_verifier (kept secret until token exchange) */
  codeVerifier: string
  /** Redirect URI used in the authorization request */
  redirectUri: string
  /** Expiration timestamp (milliseconds) */
  expiresAt: number
}

/**
 * OAuth token response from server
 */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  /** Token validity in seconds */
  expires_in: number
  scope: string
}

/**
 * Login operation result
 */
export interface LoginResult {
  success: boolean
  user?: SkillsFanUser
  error?: string
}

/**
 * Start login operation result
 */
export interface StartLoginResult {
  success: boolean
  error?: string
}
