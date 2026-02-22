/**
 * SkillsFan Authentication IPC Handlers
 *
 * Exposes SkillsFan authentication functionality to the renderer process.
 */

import { ipcMain } from 'electron'
import {
  startLogin,
  logout,
  getUserInfo,
  getAuthState,
  isLoggedIn,
  refreshToken,
  ensureValidToken,
  getAccessToken
} from '../services/skillsfan/auth.service'

/**
 * Register SkillsFan authentication IPC handlers
 */
export function registerSkillsFanAuthHandlers(): void {
  // Start OAuth login flow
  ipcMain.handle('skillsfan:start-login', async () => {
    return await startLogin()
  })

  // Logout
  ipcMain.handle('skillsfan:logout', async () => {
    await logout()
    return { success: true }
  })

  // Get current user info
  ipcMain.handle('skillsfan:get-user', () => {
    return { success: true, data: getUserInfo() }
  })

  // Get full auth state (for UI)
  ipcMain.handle('skillsfan:get-auth-state', () => {
    return { success: true, data: getAuthState() }
  })

  // Check if logged in
  ipcMain.handle('skillsfan:is-logged-in', () => {
    return { success: true, data: isLoggedIn() }
  })

  // Refresh access token
  ipcMain.handle('skillsfan:refresh-token', async () => {
    const result = await refreshToken()
    return { success: result.success, data: result.success }
  })

  // Ensure token is valid (refresh if needed)
  ipcMain.handle('skillsfan:ensure-valid-token', async () => {
    const result = await ensureValidToken()
    return { success: result, data: result }
  })

  // Get access token for API calls
  ipcMain.handle('skillsfan:get-access-token', async () => {
    const token = await getAccessToken()
    return { success: !!token, data: token }
  })

  // Get credits balance (cached)
  ipcMain.handle('skillsfan:get-credits', async () => {
    const { getCredits } = await import('../services/skillsfan/credits.service')
    const credits = await getCredits()
    return { success: credits !== null, data: credits }
  })

  // Force refresh credits balance
  ipcMain.handle('skillsfan:refresh-credits', async () => {
    const { fetchCredits } = await import('../services/skillsfan/credits.service')
    const credits = await fetchCredits()
    return { success: credits !== null, data: credits }
  })

  console.log('[IPC] SkillsFan auth handlers registered')
}
