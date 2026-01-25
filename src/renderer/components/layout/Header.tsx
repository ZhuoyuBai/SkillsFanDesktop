/**
 * Header Component - Cross-platform title bar
 *
 * Handles platform-specific padding for window controls:
 * - macOS Electron: standard title bar, normal padding (pl-4)
 * - Windows/Linux Electron: titleBarOverlay buttons on the right (pr-36)
 * - Browser/Mobile: no extra padding needed (pl-4)
 *
 * Height: 40px (compact, modern style)
 */

import { ReactNode } from 'react'
import { isElectron } from '../../api/transport'

interface HeaderProps {
  /** Left side content (after platform padding) */
  left?: ReactNode
  /** Right side content (before platform padding) */
  right?: ReactNode
  /** Additional className for header */
  className?: string
}

// Get platform info with fallback for SSR/browser
const getPlatform = () => {
  if (typeof window !== 'undefined' && window.platform) {
    return window.platform
  }
  // Fallback for non-Electron environments (e.g., remote web access)
  return {
    platform: 'darwin' as const,
    isMac: true,
    isWindows: false,
    isLinux: false
  }
}

export function Header({ left, right, className = '' }: HeaderProps) {
  const platform = getPlatform()
  const isInElectron = isElectron()

  // Platform-specific padding classes
  // macOS: standard title bar, no overlay
  // Windows/Linux: titleBarOverlay buttons overlay on the right
  // Browser/Mobile: no overlay, use normal padding
  const platformPadding = isInElectron
    ? platform.isMac
      ? 'pl-4 pr-4'    // Electron macOS: normal padding (title bar is separate)
      : 'pl-4 pr-36'   // Electron Windows/Linux: 140px right for titleBarOverlay buttons
    : 'pl-4 pr-4'      // Browser/Mobile: normal padding

  return (
    <header
      className={`
        flex items-center justify-between h-10
        ${isInElectron && !platform.isMac ? 'drag-region' : ''}
        ${platformPadding}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      <div className="flex items-center gap-3 no-drag min-w-0">
        {left}
      </div>

      <div className="flex items-center gap-2 no-drag flex-shrink-0">
        {right}
      </div>
    </header>
  )
}

// Export platform detection hook for use in other components
export function usePlatform() {
  return getPlatform()
}
