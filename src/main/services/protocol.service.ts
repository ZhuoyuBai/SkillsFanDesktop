/**
 * Protocol Service - Custom protocol registration
 *
 * Provides:
 * 1. skillsfan-file:// - Proxy to file:// for secure local resource access
 * 2. skillsfan:// - Deep link protocol for OAuth callbacks
 *
 * Usage:
 * - Files: <img src="skillsfan-file:///path/to/image.png">
 * - OAuth: skillsfan://auth/callback?code=xxx&state=yyy
 *
 * Security: Only file:// URLs are allowed for halo-file, no remote URLs pass through.
 */

import { protocol, net, app } from 'electron'
import { handleCallback } from './skillsfan/auth.service'

/**
 * Register custom protocols for secure local resource access
 * Must be called after app.whenReady()
 */
export function registerProtocols(): void {
  // skillsfan-file:// - Proxy to file:// for local resources
  // Chromium blocks file:// from localhost/app origins, this bypasses that
  protocol.handle('halo-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('skillsfan-file://', ''))
    return net.fetch(`file://${filePath}`)
  })

  console.log('[Protocol] Registered skillsfan-file:// protocol')

  // Register skillsfan:// as default protocol handler for OAuth callbacks
  // This allows the system to open our app when user is redirected from browser
  if (!app.isDefaultProtocolClient('skillsfan')) {
    const success = app.setAsDefaultProtocolClient('skillsfan')
    if (success) {
      console.log('[Protocol] Registered skillsfan:// as default protocol handler')
    } else {
      console.warn('[Protocol] Failed to register skillsfan:// protocol')
    }
  } else {
    console.log('[Protocol] skillsfan:// protocol already registered')
  }
}

/**
 * Handle skillsfan:// URL
 * Called from main process when a deep link is opened
 *
 * @param url The full URL (e.g., skillsfan://auth/callback?code=xxx&state=yyy)
 */
export function handleSkillsFanUrl(url: string): void {
  console.log('[Protocol] Handling skillsfan URL:', url)

  try {
    const urlObj = new URL(url)

    // Handle OAuth callback
    // Format: skillsfan://auth/callback?code=xxx&state=yyy
    if (urlObj.host === 'auth' && urlObj.pathname === '/callback') {
      handleCallback(url).catch((err) => {
        console.error('[Protocol] OAuth callback error:', err)
      })
      return
    }

    // Unknown path
    console.warn('[Protocol] Unknown skillsfan:// path:', urlObj.pathname)
  } catch (error) {
    console.error('[Protocol] Invalid skillsfan URL:', url, error)
  }
}
