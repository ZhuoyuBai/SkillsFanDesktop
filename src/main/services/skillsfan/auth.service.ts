/**
 * SkillsFan OAuth Authentication Service
 *
 * Implements OAuth 2.0 Authorization Code Flow with PKCE
 * for authenticating with SkillsFan website.
 *
 * Flow:
 * 1. User clicks login -> startLogin() opens browser
 * 2. User logs in on website -> redirects to skillsfan://auth/callback
 * 3. handleCallback() exchanges code for tokens
 * 4. Tokens stored securely, user info fetched
 */

import { shell, app } from 'electron'
import crypto from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import {
  SKILLSFAN_AUTHORIZE_URL,
  SKILLSFAN_TOKEN_URL,
  SKILLSFAN_USER_URL,
  SKILLSFAN_CLIENT_ID,
  SKILLSFAN_REDIRECT_URI,
  SKILLSFAN_SCOPES,
  AUTH_TIMEOUT_MS,
  TOKEN_REFRESH_THRESHOLD_MS
} from './constants'
import { generateCodeVerifier, generateCodeChallenge } from './pkce'
import type {
  SkillsFanUser,
  SkillsFanAuthState,
  PendingAuth,
  TokenResponse,
  TokenRefreshResult,
  LoginResult,
  StartLoginResult
} from '../../../shared/types/skillsfan'
import { getMainWindow } from '../../index'

// ============================================================================
// State Management
// ============================================================================

/** Pending OAuth request (cleared after callback) */
let pendingAuth: PendingAuth | null = null

/** Current authentication state */
let authState: SkillsFanAuthState = {
  isLoggedIn: false
}

// ============================================================================
// Login Success Callbacks (for main-process consumers like SkillsFanCreditsProvider)
// ============================================================================

type LoginSuccessCallback = (user: SkillsFanUser) => void
const loginSuccessCallbacks: LoginSuccessCallback[] = []

/**
 * Register a callback to be notified when login succeeds.
 * Used by SkillsFanCreditsProvider to bridge deep-link OAuth with AISourceManager flow.
 * @returns Cleanup function to remove the callback
 */
export function onLoginSuccess(callback: LoginSuccessCallback): () => void {
  loginSuccessCallbacks.push(callback)
  return () => {
    const idx = loginSuccessCallbacks.indexOf(callback)
    if (idx >= 0) loginSuccessCallbacks.splice(idx, 1)
  }
}

// ============================================================================
// Storage Paths
// ============================================================================

function getAuthStatePath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'skillsfan-auth.json')
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start OAuth login flow
 * Opens browser to SkillsFan authorization page
 */
export async function startLogin(): Promise<StartLoginResult> {
  try {
    // Generate random state for CSRF protection
    const state = crypto.randomUUID()

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Store pending auth state
    pendingAuth = {
      state,
      codeVerifier,
      redirectUri: SKILLSFAN_REDIRECT_URI,
      expiresAt: Date.now() + AUTH_TIMEOUT_MS
    }

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SKILLSFAN_CLIENT_ID,
      redirect_uri: SKILLSFAN_REDIRECT_URI,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: SKILLSFAN_SCOPES
    })

    const authUrl = `${SKILLSFAN_AUTHORIZE_URL}?${params.toString()}`

    console.log('[SkillsFan] Opening browser for login, authUrl:', authUrl)

    // Open system browser
    await shell.openExternal(authUrl)

    return { success: true }
  } catch (error) {
    console.error('[SkillsFan] Start login error:', error)
    pendingAuth = null
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start login'
    }
  }
}

/**
 * Handle OAuth callback
 * Called by protocol handler when skillsfan://auth/callback is received
 *
 * @param url The full callback URL with code and state
 */
export async function handleCallback(url: string): Promise<LoginResult> {
  try {
    console.log('[SkillsFan] Handling callback')

    // Parse URL
    const urlObj = new URL(url)
    const code = urlObj.searchParams.get('code')
    const state = urlObj.searchParams.get('state')
    const error = urlObj.searchParams.get('error')
    const errorDescription = urlObj.searchParams.get('error_description')

    // Check for error response
    if (error) {
      console.error('[SkillsFan] OAuth error:', error, errorDescription)
      pendingAuth = null
      notifyLoginError(errorDescription || error)
      return {
        success: false,
        error: errorDescription || error
      }
    }

    // Validate required parameters
    if (!code || !state) {
      pendingAuth = null
      const errorMsg = 'Missing code or state in callback'
      notifyLoginError(errorMsg)
      return {
        success: false,
        error: errorMsg
      }
    }

    // Validate state (CSRF protection)
    if (!pendingAuth || pendingAuth.state !== state) {
      console.error('[SkillsFan] State mismatch - possible CSRF attack')
      pendingAuth = null
      const errorMsg = 'Security verification failed. Please try again.'
      notifyLoginError(errorMsg)
      return {
        success: false,
        error: errorMsg
      }
    }

    // Check if request expired
    if (Date.now() > pendingAuth.expiresAt) {
      console.error('[SkillsFan] Auth request expired')
      pendingAuth = null
      const errorMsg = 'Login request expired. Please try again.'
      notifyLoginError(errorMsg)
      return {
        success: false,
        error: errorMsg
      }
    }

    const { codeVerifier, redirectUri } = pendingAuth
    pendingAuth = null

    // Exchange code for tokens
    const tokenResult = await exchangeCodeForToken(code, codeVerifier, redirectUri)
    if (!tokenResult.success) {
      notifyLoginError(tokenResult.error || 'Failed to get token')
      return {
        success: false,
        error: tokenResult.error
      }
    }

    // Fetch user info
    const userResult = await fetchUserInfo(tokenResult.accessToken!)
    if (!userResult.success) {
      notifyLoginError(userResult.error || 'Failed to get user info')
      return {
        success: false,
        error: userResult.error
      }
    }

    // Update auth state
    authState = {
      isLoggedIn: true,
      user: userResult.user,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      tokenExpiresAt: tokenResult.expiresAt
    }

    // Persist to storage
    await saveAuthState(authState)

    // Notify renderer process
    notifyLoginSuccess(authState)

    // Notify main-process consumers (e.g., SkillsFanCreditsProvider)
    if (userResult.user) {
      loginSuccessCallbacks.forEach(cb => {
        try { cb(userResult.user!) } catch (e) { console.error('[SkillsFan] Login callback error:', e) }
      })
    }

    console.log('[SkillsFan] Login successful for user:', userResult.user?.name)

    return {
      success: true,
      user: userResult.user
    }
  } catch (error) {
    console.error('[SkillsFan] Handle callback error:', error)
    pendingAuth = null
    const errorMsg = error instanceof Error ? error.message : 'Login failed'
    notifyLoginError(errorMsg)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Refresh access token using refresh token
 *
 * Returns a detailed result so callers can distinguish between
 * server rejection (should logout) and network errors (should retry later).
 */
export async function refreshToken(): Promise<TokenRefreshResult> {
  if (!authState.refreshToken) {
    return { success: false, reason: 'no_refresh_token' }
  }

  try {
    console.log('[SkillsFan] Refreshing access token')

    const response = await fetch(SKILLSFAN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: authState.refreshToken,
        client_id: SKILLSFAN_CLIENT_ID
      })
    })

    if (!response.ok) {
      console.error('[SkillsFan] Token refresh failed:', response.status)
      // Refresh token invalid/expired - caller decides whether to logout
      return { success: false, reason: 'rejected' }
    }

    const data: TokenResponse = await response.json()

    // Update state with new tokens
    authState.accessToken = data.access_token
    authState.refreshToken = data.refresh_token
    authState.tokenExpiresAt = Date.now() + data.expires_in * 1000

    // Persist
    await saveAuthState(authState)

    console.log('[SkillsFan] Token refreshed successfully')
    return { success: true }
  } catch (error) {
    console.error('[SkillsFan] Token refresh error:', error)
    return { success: false, reason: 'network_error' }
  }
}

/**
 * Ensure token is valid, refresh if needed
 */
export async function ensureValidToken(): Promise<boolean> {
  if (!authState.isLoggedIn || !authState.accessToken) {
    return false
  }

  // Check if refresh is needed
  const needsRefresh =
    !authState.tokenExpiresAt ||
    authState.tokenExpiresAt < Date.now() + TOKEN_REFRESH_THRESHOLD_MS

  if (needsRefresh) {
    const result = await refreshToken()
    if (!result.success && result.reason === 'rejected') {
      // Server rejected the refresh token, force logout
      await logout()
    }
    return result.success
  }

  return true
}

/**
 * Get current user info
 */
export function getUserInfo(): SkillsFanUser | null {
  return authState.user || null
}

/**
 * Get current auth state
 */
export function getAuthState(): SkillsFanAuthState {
  // Return copy without sensitive tokens for renderer
  return {
    isLoggedIn: authState.isLoggedIn,
    user: authState.user,
    tokenExpiresAt: authState.tokenExpiresAt,
    lastKnownCredits: authState.lastKnownCredits,
    creditsFetchedAt: authState.creditsFetchedAt
  }
}

/**
 * Get full auth state including tokens (internal use only)
 */
export function getFullAuthState(): SkillsFanAuthState {
  return { ...authState }
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return authState.isLoggedIn
}

/**
 * Get access token for API calls
 */
export async function getAccessToken(): Promise<string | null> {
  if (!authState.isLoggedIn) {
    return null
  }

  // Ensure token is valid
  const valid = await ensureValidToken()
  if (!valid) {
    return null
  }

  return authState.accessToken || null
}

/**
 * Logout - clear all auth state
 */
export async function logout(): Promise<void> {
  console.log('[SkillsFan] Logging out')

  authState = {
    isLoggedIn: false
  }

  pendingAuth = null

  // Clear persisted state
  await clearAuthState()

  // Notify renderer
  notifyLogout()
}

/**
 * Load persisted auth state on startup
 */
export async function loadAuthState(): Promise<void> {
  try {
    const authPath = getAuthStatePath()

    if (!existsSync(authPath)) {
      console.log('[SkillsFan] No persisted auth state found')
      return
    }

    const content = readFileSync(authPath, 'utf-8')
    const stored = JSON.parse(content) as SkillsFanAuthState

    // Validate stored state - load if we have at least an access token
    if (stored.isLoggedIn && stored.accessToken) {
      authState = stored
      console.log('[SkillsFan] Loaded persisted auth state for user:', stored.user?.name)

      // Seed in-memory credits cache from persisted state
      if (stored.lastKnownCredits !== undefined) {
        const { seedCreditsCache } = await import('./credits.service')
        seedCreditsCache(stored.lastKnownCredits, stored.creditsFetchedAt)
      }

      // Check if token needs refresh
      if (stored.tokenExpiresAt && stored.tokenExpiresAt < Date.now()) {
        if (stored.refreshToken) {
          console.log('[SkillsFan] Token expired, attempting refresh')
          const result = await refreshToken()
          if (!result.success) {
            if (result.reason === 'network_error') {
              // Keep user logged in - ensureValidToken() will retry before API calls
              console.log('[SkillsFan] Token refresh failed due to network error, keeping auth state for lazy retry')
            } else {
              // Server rejected token - must re-login
              console.log('[SkillsFan] Token refresh rejected, clearing auth state')
              await logout()
            }
          }
        } else {
          // No refresh token and access token expired - must re-login
          console.log('[SkillsFan] Token expired and no refresh token, clearing auth state')
          await logout()
        }
      }
    }
  } catch (error) {
    console.error('[SkillsFan] Failed to load auth state:', error)
  }
}

/**
 * Update cached credits in auth state and persist to disk.
 * Called by credits.service after successful fetch.
 */
export function updateCreditsInAuthState(
  credits: number | undefined,
  fetchedAt: number | undefined
): void {
  authState.lastKnownCredits = credits
  authState.creditsFetchedAt = fetchedAt
  if (authState.isLoggedIn) {
    saveAuthState(authState)
  }
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  error?: string
}> {
  try {
    console.log('[SkillsFan] Token exchange URL:', SKILLSFAN_TOKEN_URL)
    console.log('[SkillsFan] Token exchange params:', { grant_type: 'authorization_code', code: code.substring(0, 8) + '...', redirect_uri: redirectUri, client_id: SKILLSFAN_CLIENT_ID })

    const response = await fetch(SKILLSFAN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: SKILLSFAN_CLIENT_ID,
        code_verifier: codeVerifier
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[SkillsFan] Token exchange failed:', response.status, errorData)
      return {
        success: false,
        error: errorData.error_description || errorData.error || 'Failed to get token'
      }
    }

    const data: TokenResponse = await response.json()

    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000
    }
  } catch (error) {
    console.error('[SkillsFan] Token exchange error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * Fetch user info from SkillsFan API
 */
async function fetchUserInfo(accessToken: string): Promise<{
  success: boolean
  user?: SkillsFanUser
  error?: string
}> {
  try {
    const response = await fetch(SKILLSFAN_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      console.error('[SkillsFan] Fetch user failed:', response.status)
      return {
        success: false,
        error: 'Failed to get user info'
      }
    }

    const user: SkillsFanUser = await response.json()
    return { success: true, user }
  } catch (error) {
    console.error('[SkillsFan] Fetch user error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * Persist auth state to storage
 */
async function saveAuthState(state: SkillsFanAuthState): Promise<void> {
  try {
    const authPath = getAuthStatePath()
    writeFileSync(authPath, JSON.stringify(state, null, 2))
    console.log('[SkillsFan] Auth state persisted')
  } catch (error) {
    console.error('[SkillsFan] Failed to save auth state:', error)
  }
}

/**
 * Clear persisted auth state
 */
async function clearAuthState(): Promise<void> {
  try {
    const authPath = getAuthStatePath()
    if (existsSync(authPath)) {
      unlinkSync(authPath)
      console.log('[SkillsFan] Auth state cleared')
    }
  } catch (error) {
    console.error('[SkillsFan] Failed to clear auth state:', error)
  }
}

/**
 * Notify renderer process of successful login
 */
function notifyLoginSuccess(state: SkillsFanAuthState): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('skillsfan:login-success', {
      user: state.user
    })
    // Focus window
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()

    // Show in dock on macOS
    if (process.platform === 'darwin') {
      app.dock?.show()
    }
  }
}

/**
 * Notify renderer process of login error
 */
function notifyLoginError(error: string): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('skillsfan:login-error', { error })
    // Focus window
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

/**
 * Notify renderer process of logout
 */
function notifyLogout(): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('skillsfan:logout')
  }
}
