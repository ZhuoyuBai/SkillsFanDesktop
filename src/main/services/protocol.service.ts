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
import { resolve } from 'path'
import { execSync } from 'child_process'
import { handleCallback } from './skillsfan/auth.service'

/**
 * In dev mode on macOS, the stock Electron.app has no CFBundleURLTypes
 * for 'skillsfan', so setAsDefaultProtocolClient is a no-op.
 * We patch the local Info.plist and re-register with Launch Services
 * to make the current Electron binary the handler.
 */
function ensureDevProtocolOnMac(): void {
  if (app.isPackaged || process.platform !== 'darwin') return

  try {
    const plistPath = resolve(process.execPath, '..', '..', 'Info.plist')
    const electronAppPath = resolve(process.execPath, '..', '..', '..')

    // Add CFBundleURLTypes with skillsfan scheme via PlistBuddy (idempotent)
    const cmds = [
      `Add :CFBundleURLTypes array`,
      `Add :CFBundleURLTypes:0 dict`,
      `Add :CFBundleURLTypes:0:CFBundleURLName string skillsfan`,
      `Add :CFBundleURLTypes:0:CFBundleURLSchemes array`,
      `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string skillsfan`
    ]
    for (const cmd of cmds) {
      // PlistBuddy returns non-zero if key already exists — ignore
      try { execSync(`/usr/libexec/PlistBuddy -c "${cmd}" "${plistPath}"`, { stdio: 'pipe' }) } catch { /* already exists */ }
    }

    // Force Launch Services to re-scan THIS Electron.app so macOS uses it
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${electronAppPath}"`,
      { stdio: 'pipe' }
    )

    console.log('[Protocol] Patched dev Electron.app Info.plist for skillsfan:// URL scheme')
  } catch (error) {
    console.warn('[Protocol] Failed to patch dev Info.plist:', error)
  }
}

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

  // In dev mode on macOS, patch Info.plist so setAsDefaultProtocolClient works
  ensureDevProtocolOnMac()

  // Register skillsfan:// as default protocol handler for OAuth callbacks
  const success = app.setAsDefaultProtocolClient('skillsfan')
  if (success) {
    console.log('[Protocol] Registered skillsfan:// as default protocol handler')
  } else {
    console.warn('[Protocol] Failed to register skillsfan:// protocol')
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
