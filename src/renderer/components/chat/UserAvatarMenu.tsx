/**
 * UserAvatarMenu - User avatar with dropdown menu for settings and account
 */

import { useState, useEffect, useRef } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { User, Settings, LogOut, Loader2 } from 'lucide-react'
import type { SkillsFanAuthState } from '../../../shared/types/skillsfan'

interface UserAvatarMenuProps {
  /** Whether the sidebar is collapsed */
  collapsed?: boolean
}

export function UserAvatarMenu({ collapsed = false }: UserAvatarMenuProps) {
  const { t } = useTranslation()
  const { setView, openSettingsWithSection } = useAppStore()

  const [authState, setAuthState] = useState<SkillsFanAuthState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Load auth state on mount
  useEffect(() => {
    loadAuthState()

    // Listen for login/logout events
    const unsubscribeSuccess = api.onSkillsFanLoginSuccess(() => {
      loadAuthState()
    })

    const unsubscribeLogout = api.onSkillsFanLogout(() => {
      setAuthState({ isLoggedIn: false })
    })

    return () => {
      unsubscribeSuccess()
      unsubscribeLogout()
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const loadAuthState = async () => {
    try {
      setIsLoading(true)
      setAvatarError(false)
      const result = await api.skillsfanGetAuthState()
      if (result.success && result.data) {
        setAuthState(result.data as SkillsFanAuthState)
      } else {
        setAuthState({ isLoggedIn: false })
      }
    } catch (err) {
      console.error('[UserAvatarMenu] Failed to load auth state:', err)
      setAuthState({ isLoggedIn: false })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      const result = await api.skillsfanLogout()
      if (result.success) {
        setAuthState({ isLoggedIn: false })
      }
    } catch (err) {
      console.error('[UserAvatarMenu] Logout error:', err)
    } finally {
      setIsLoggingOut(false)
      setIsMenuOpen(false)
    }
  }

  const handleAccountClick = () => {
    setIsMenuOpen(false)
    openSettingsWithSection('account')
  }

  const handleSettingsClick = () => {
    setIsMenuOpen(false)
    setView('settings')
  }

  const isLoggedIn = authState?.isLoggedIn && authState.user
  const userName = isLoggedIn ? authState.user!.name : t('Login')
  const userEmail = isLoggedIn ? authState.user!.email : ''
  const userAvatar = isLoggedIn ? authState.user!.avatar : null

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-border/50">
        <div className="flex items-center justify-center py-1.5">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-4 py-3 border-t border-border/50">
      {/* Dropdown Menu - positioned above the button */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-2 right-2 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {/* Account section - clickable to go to account settings */}
          <button
            onClick={handleAccountClick}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition-colors text-left"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {userAvatar && !avatarError ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              {userEmail && (
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              )}
            </div>
          </button>

          <div className="border-t border-border/50" />

          {/* Settings */}
          <button
            onClick={handleSettingsClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{t('Settings')}</span>
          </button>

          {/* Logout - only show when logged in */}
          {isLoggedIn && (
            <>
              <div className="border-t border-border/50" />
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left text-red-500 disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span className="text-sm">{t('Logout')}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Avatar Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`w-full flex items-center gap-2 px-2 py-1.5
          text-sm text-foreground/70 hover:text-foreground
          hover:bg-muted/50
          rounded transition-all duration-150
          ${collapsed ? 'justify-center' : 'justify-start'}`}
      >
        {/* Avatar */}
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {userAvatar && !avatarError ? (
            <img
              src={userAvatar}
              alt={userName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <User className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Name - hidden when collapsed */}
        {!collapsed && (
          <span className="truncate">{userName}</span>
        )}
      </button>
    </div>
  )
}
