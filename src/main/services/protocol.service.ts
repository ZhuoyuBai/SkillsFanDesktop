/**
 * Protocol Service - Custom protocol registration
 *
 * Provides:
 * - halo-file:// - Proxy to file:// for secure local resource access
 *
 * Usage:
 * - Files: <img src="skillsfan-file:///path/to/image.png">
 *
 * Security: Only file:// URLs are allowed for halo-file, no remote URLs pass through.
 */

import { protocol, net } from 'electron'

/**
 * Register custom protocols for secure local resource access
 * Must be called after app.whenReady()
 */
export function registerProtocols(): void {
  // halo-file:// - Proxy to file:// for local resources
  // Chromium blocks file:// from localhost/app origins, this bypasses that
  protocol.handle('halo-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('skillsfan-file://', ''))
    return net.fetch(`file://${filePath}`)
  })

  console.log('[Protocol] Registered halo-file:// protocol')
}
