/**
 * SkillsFan Account Section - Settings page account management
 */

import { useState, useEffect } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { Loader2, LogOut, User } from 'lucide-react'
import { HaloLogo } from '../brand/HaloLogo'
import type { SkillsFanUser, SkillsFanAuthState } from '../../../shared/types/skillsfan'

export function SkillsFanAccountSection() {
  const { t } = useTranslation()
  const [authState, setAuthState] = useState<SkillsFanAuthState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)

  // Load auth state on mount
  useEffect(() => {
    loadAuthState()

    // Listen for login/logout events
    const unsubscribeSuccess = api.onSkillsFanLoginSuccess((data) => {
      console.log('[SkillsFanAccount] Login success:', data)
      setIsLoggingIn(false)
      loadAuthState()
    })

    const unsubscribeError = api.onSkillsFanLoginError((data) => {
      console.error('[SkillsFanAccount] Login error:', data)
      setIsLoggingIn(false)
      setError(data.error)
    })

    const unsubscribeLogout = api.onSkillsFanLogout(() => {
      console.log('[SkillsFanAccount] Logged out')
      setAuthState({ isLoggedIn: false })
    })

    return () => {
      unsubscribeSuccess()
      unsubscribeError()
      unsubscribeLogout()
    }
  }, [])

  const loadAuthState = async () => {
    try {
      setIsLoading(true)
      setAvatarError(false) // Reset avatar error on reload
      const result = await api.skillsfanGetAuthState()
      if (result.success && result.data) {
        const state = result.data as SkillsFanAuthState
        // Debug: 打印用户信息，查看头像URL
        console.log('[SkillsFanAccount] Auth state loaded:', {
          isLoggedIn: state.isLoggedIn,
          userName: state.user?.name,
          userEmail: state.user?.email,
          userAvatar: state.user?.avatar,
          userPlan: state.user?.plan
        })
        setAuthState(state)
      } else {
        setAuthState({ isLoggedIn: false })
      }
    } catch (err) {
      console.error('[SkillsFanAccount] Failed to load auth state:', err)
      setAuthState({ isLoggedIn: false })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async () => {
    try {
      setError(null)
      setIsLoggingIn(true)
      const result = await api.skillsfanStartLogin()
      if (!result.success) {
        setError(result.error || t('Failed to start login'))
        setIsLoggingIn(false)
      }
      // If successful, browser opens and we wait for callback
      // The login state will be updated via event listeners
    } catch (err) {
      console.error('[SkillsFanAccount] Login error:', err)
      setError(t('Failed to start login'))
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      const result = await api.skillsfanLogout()
      if (result.success) {
        setAuthState({ isLoggedIn: false })
      } else {
        setError(result.error || t('Failed to logout'))
      }
    } catch (err) {
      console.error('[SkillsFanAccount] Logout error:', err)
      setError(t('Failed to logout'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  // Format plan display
  const getPlanDisplay = (plan: SkillsFanUser['plan']) => {
    switch (plan) {
      case 'pro':
        return { label: 'Pro', className: 'bg-primary/20 text-primary' }
      case 'enterprise':
        return { label: 'Enterprise', className: 'bg-purple-500/20 text-purple-500' }
      default:
        return { label: 'Free', className: 'bg-muted text-muted-foreground' }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Logged In State */}
      {authState?.isLoggedIn && authState.user ? (
        <div className="space-y-4">
          {/* User Info */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden">
              {authState.user.avatar && !avatarError ? (
                <img
                  src={authState.user.avatar}
                  alt={authState.user.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <User className="w-7 h-7 text-muted-foreground" />
              )}
            </div>

            {/* Name and Email */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium truncate">{authState.user.name}</h4>
                {/* Plan Badge */}
                {(() => {
                  const planInfo = getPlanDisplay(authState.user.plan)
                  return (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${planInfo.className}`}>
                      {planInfo.label}
                    </span>
                  )
                })()}
              </div>
              <p className="text-sm text-muted-foreground truncate">{authState.user.email}</p>
            </div>
          </div>

          {/* Features Description */}
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              {t('Logged in to SkillsFan account')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {t('Logout')}
            </button>
          </div>
        </div>
      ) : (
        /* Logged Out State */
        <div className="space-y-4">
          {/* Logo */}
          <div className="flex justify-center py-2">
            <HaloLogo size="md" animated={false} />
          </div>

          {/* Description */}
          <div className="bg-secondary/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground text-center">
              {t('Login to SkillsFan for a better experience')}
            </p>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('Logging in...')}
              </>
            ) : (
              t('Login / Register')
            )}
          </button>

          {/* Help Link */}
          <p className="text-xs text-center text-muted-foreground">
            {t('You will be redirected to SkillsFan website to login.')}
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  )
}
