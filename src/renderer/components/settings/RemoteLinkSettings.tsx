/**
 * Remote Link Settings
 *
 * Browser-based remote access configuration extracted from SettingsPage.
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useToastStore } from '../../stores/toast.store'
import { Lock, AlertTriangle } from 'lucide-react'
import type { SkillsFanAuthState } from '@shared/types/skillsfan'

interface RemoteAccessStatus {
  enabled: boolean
  server: {
    running: boolean
    port: number
    token: string | null
    localUrl: string | null
    lanUrl: string | null
  }
  tunnel: {
    status: 'stopped' | 'starting' | 'running' | 'error'
    url: string | null
    error: string | null
  }
  clients: number
}

export function RemoteLinkSettings() {
  const { t } = useTranslation()
  const { addToast } = useToastStore()

  const [authState, setAuthState] = useState<SkillsFanAuthState | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<RemoteAccessStatus | null>(null)
  const [isEnablingRemote, setIsEnablingRemote] = useState(false)
  const [isEnablingTunnel, setIsEnablingTunnel] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  // Load auth state
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const result = await api.skillsfanGetAuthState()
        if (result.success) setAuthState(result.data)
      } catch { /* ignore */ }
    }
    loadAuthState()
    const unsubLogin = api.onSkillsFanLoginSuccess(() => loadAuthState())
    const unsubLogout = api.onSkillsFanLogout(() => setAuthState({ isLoggedIn: false }))
    return () => { unsubLogin(); unsubLogout() }
  }, [])

  // Load remote status
  const loadRemoteStatus = useCallback(async () => {
    try {
      const response = await api.getRemoteStatus()
      if (response.success && response.data) {
        setRemoteStatus(response.data as RemoteAccessStatus)
      }
    } catch (error) {
      console.error('[RemoteLinkSettings] loadRemoteStatus error:', error)
    }
  }, [])

  useEffect(() => {
    loadRemoteStatus()
    const unsubscribe = api.onRemoteStatusChange((data) => {
      setRemoteStatus(data as RemoteAccessStatus)
    })
    return () => { unsubscribe() }
  }, [loadRemoteStatus])

  // Load QR code when remote is enabled
  useEffect(() => {
    if (remoteStatus?.enabled) {
      loadQRCode()
    } else {
      setQrCode(null)
    }
  }, [remoteStatus?.enabled, remoteStatus?.tunnel?.url])

  const loadQRCode = async () => {
    const response = await api.getRemoteQRCode(false)
    if (response.success && response.data) {
      setQrCode((response.data as any).qrCode)
    }
  }

  const handleToggleRemote = async () => {
    if (!authState?.isLoggedIn) {
      addToast(t('Please log in to use this feature'), 'info')
      return
    }

    if (remoteStatus?.enabled) {
      const response = await api.disableRemoteAccess()
      if (response.success) {
        setRemoteStatus(null)
        setQrCode(null)
      }
    } else {
      setIsEnablingRemote(true)
      try {
        const response = await api.enableRemoteAccess()
        if (response.success && response.data) {
          setRemoteStatus(response.data as RemoteAccessStatus)
        }
      } catch (error) {
        console.error('[RemoteLinkSettings] Enable error:', error)
      } finally {
        setIsEnablingRemote(false)
      }
    }
  }

  const handleToggleTunnel = async () => {
    if (remoteStatus?.tunnel.status === 'running') {
      await api.disableTunnel()
    } else {
      setIsEnablingTunnel(true)
      try {
        await api.enableTunnel()
      } finally {
        setIsEnablingTunnel(false)
      }
    }
    loadRemoteStatus()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-4">
      {/* Security Warning - compact */}
      <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{t('Anyone with the password can fully control your computer. Do not share with untrusted people.')}</span>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{t('Enable Remote Access')}</p>
            {!authState?.isLoggedIn && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                <Lock className="w-3 h-3" />
                {t('Login Required')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('Allow access to Halo from other devices')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={remoteStatus?.enabled || false}
            onChange={handleToggleRemote}
            disabled={isEnablingRemote}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${remoteStatus?.enabled ? 'translate-x-5' : 'translate-x-0.5'
                } mt-0.5`}
            />
          </div>
        </label>
      </div>

      {/* Remote Access Details */}
      {remoteStatus?.enabled && (
        <>
          {/* Local Access */}
          <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('Local Address')}</span>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-background px-2 py-1 rounded">
                  {remoteStatus.server.localUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(remoteStatus.server.localUrl || '')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('Copy')}
                </button>
              </div>
            </div>

            {remoteStatus.server.lanUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('LAN Address')}</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-background px-2 py-1 rounded">
                    {remoteStatus.server.lanUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(remoteStatus.server.lanUrl || '')}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('Copy')}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('Access Password')}</span>
                {!isEditingPassword ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background px-2 py-1 rounded font-mono tracking-wider">
                      {showPassword ? remoteStatus.server.token : '••••••••'}
                    </code>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? t('Hide') : t('Show')}
                    </button>
                    <button
                      onClick={() => copyToClipboard(remoteStatus.server.token || '')}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('Copy')}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPassword(true)
                        setCustomPassword('')
                        setPasswordError(null)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('Edit')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customPassword}
                      onChange={(e) => {
                        setCustomPassword(e.target.value)
                        setPasswordError(null)
                      }}
                      placeholder={t('4-32 characters')}
                      maxLength={32}
                      className="w-32 px-2 py-1 text-sm bg-input rounded border border-border focus:outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (customPassword.length < 4) {
                          setPasswordError(t('Password too short'))
                          return
                        }
                        setIsSavingPassword(true)
                        setPasswordError(null)
                        try {
                          const res = await api.setRemotePassword(customPassword)
                          if (res.success) {
                            setIsEditingPassword(false)
                            setCustomPassword('')
                            loadRemoteStatus()
                          } else {
                            setPasswordError(res.error || t('Failed to set password'))
                          }
                        } catch (error) {
                          setPasswordError(t('Failed to set password'))
                        } finally {
                          setIsSavingPassword(false)
                        }
                      }}
                      disabled={isSavingPassword || customPassword.length < 4}
                      className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSavingPassword ? t('Saving...') : t('Save')}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPassword(false)
                        setCustomPassword('')
                        setPasswordError(null)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                )}
              </div>
              {passwordError && (
                <p className="text-xs text-red-500">{passwordError}</p>
              )}
            </div>

            {remoteStatus.clients > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('Connected Devices')}</span>
                <span className="text-green-500">{t('{{count}} devices', { count: remoteStatus.clients })}</span>
              </div>
            )}
          </div>

          {/* Tunnel Section */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium">{t('Internet Access')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('Get public address via Cloudflare (wait about 10 seconds for DNS resolution after startup)')}
                </p>
              </div>
              <button
                onClick={handleToggleTunnel}
                disabled={isEnablingTunnel}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${remoteStatus.tunnel.status === 'running'
                  ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
                  }`}
              >
                {isEnablingTunnel
                  ? t('Connecting...')
                  : remoteStatus.tunnel.status === 'running'
                    ? t('Stop Tunnel')
                    : remoteStatus.tunnel.status === 'starting'
                      ? t('Connecting...')
                      : t('Start Tunnel')}
              </button>
            </div>

            {remoteStatus.tunnel.status === 'running' && remoteStatus.tunnel.url && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-500">{t('Public Address')}</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background px-2 py-1 rounded text-green-500">
                      {remoteStatus.tunnel.url}
                    </code>
                    <button
                      onClick={() => copyToClipboard(remoteStatus.tunnel.url || '')}
                      className="text-xs text-green-500/80 hover:text-green-500"
                    >
                      {t('Copy')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {remoteStatus.tunnel.status === 'error' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-500">
                  {t('Tunnel connection failed')}: {remoteStatus.tunnel.error}
                </p>
              </div>
            )}
          </div>

          {/* QR Code */}
          {qrCode && (
            <div className="pt-4 border-t border-border">
              <p className="font-medium mb-3">{t('Scan to Access')}</p>
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-xl">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
                <div className="text-center text-sm">
                  <p className="text-muted-foreground">
                    {t('Scan the QR code with your phone and enter the password to access')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
