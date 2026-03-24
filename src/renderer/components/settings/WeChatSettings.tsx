/**
 * WeChat Settings Section
 *
 * Configuration UI for WeChat personal account integration via iLink Bot API.
 * Features QR code login flow instead of credential input.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { Copy, RefreshCw, Trash2, LogOut, Loader2, QrCode } from 'lucide-react'
import type { WeChatStatus, WeChatSessionMapping } from '@shared/types/wechat'

export function WeChatSettings({ config }: { config: Record<string, unknown> }) {
  const { t } = useTranslation()
  const { setConfig } = useAppStore()
  const wechatConfig = config.wechat as { enabled: boolean; pairingCode: string; allowedUserIds: string[]; defaultSpaceId?: string } | undefined

  const [status, setStatus] = useState<WeChatStatus | null>(null)
  const [sessions, setSessions] = useState<WeChatSessionMapping[]>([])
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshConfig = useCallback(async () => {
    const res = await api.getConfig()
    if (res.success) {
      setConfig(res.data)
    }
  }, [setConfig])

  const loadStatus = useCallback(async () => {
    const res = await api.wechatStatus()
    if (res.success) {
      setStatus(res.data as WeChatStatus)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    const res = await api.wechatGetSessions()
    if (res.success) {
      setSessions(res.data as WeChatSessionMapping[])
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadSessions()
  }, [loadStatus, loadSessions])

  // Cleanup QR code polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  const handleStartLogin = async () => {
    setIsLoggingIn(true)
    setLoginError(null)
    setQrCodeImage(null)

    try {
      const res = await api.wechatGetQRCode()
      if (!res.success) {
        setLoginError(res.error || t('Failed to get QR code'))
        setIsLoggingIn(false)
        return
      }

      const data = res.data as { qrcode: string; qrcodeImage?: string }
      setQrCode(data.qrcode)
      setQrCodeImage(data.qrcodeImage || null)

      // Start polling for scan status
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await api.wechatCheckQRCodeStatus(data.qrcode)
          if (statusRes.success) {
            const statusData = statusRes.data as { status: number; botToken?: string }
            if (statusData.botToken) {
              // Login successful
              clearInterval(pollTimerRef.current!)
              pollTimerRef.current = null
              setIsLoggingIn(false)
              setQrCodeImage(null)
              setQrCode(null)
              await loadStatus()
              await refreshConfig()
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000)

      // Stop polling after 2 minutes (QR code expires)
      setTimeout(() => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
          setIsLoggingIn(false)
          setQrCodeImage(null)
          setQrCode(null)
          setLoginError(t('QR code expired. Please try again.'))
        }
      }, 120000)
    } catch (err) {
      setLoginError(String(err))
      setIsLoggingIn(false)
    }
  }

  const handleCancelLogin = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setIsLoggingIn(false)
    setQrCodeImage(null)
    setQrCode(null)
    setLoginError(null)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await api.wechatLogout()
      await loadStatus()
      await refreshConfig()
    } catch (err) {
      console.error('Failed to logout WeChat:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleRegeneratePairingCode = async () => {
    const res = await api.wechatRegeneratePairingCode()
    if (res.success) {
      await refreshConfig()
    }
  }

  const handleRevokeUser = async (userId: string) => {
    await api.wechatRevokeUser(userId)
    await loadSessions()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const isConnected = status?.connected === true

  return (
    <section className="space-y-4">
      {/* Quick Setup Steps - only show when not connected */}
      {!isConnected && (
        <div className="text-sm text-muted-foreground space-y-1 mb-2">
          <p className="font-medium text-foreground mb-2">{t('Quick Setup')}</p>
          <p>1. {t('Click "Scan QR Code to Login" below')}</p>
          <p>2. {t('Open WeChat and scan the QR code')}</p>
          <p>3. {t('Send the 6-digit pairing code to pair')}</p>
          <p>4. {t('After pairing, send messages directly')}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm">
              {isConnected
                ? `${t('Connected')}${status?.nickname ? ` - ${status.nickname}` : ''}`
                : t('Not Connected')}
            </span>
            {isConnected && (
              <span className="text-xs text-muted-foreground ml-1">
                ({status?.activeSessions || 0} {t('sessions')})
              </span>
            )}
          </div>
          {isConnected && (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="px-3 py-1.5 text-sm bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {t('Logout')}
            </button>
          )}
        </div>

        {/* QR Code Login */}
        {!isConnected && (
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCodeImage ? (
              <>
                <div className="bg-white p-3 rounded-lg">
                  <img
                    src={qrCodeImage}
                    alt="WeChat QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <p className="text-sm text-muted-foreground">{t('Scan with WeChat to login')}</p>
                <button
                  onClick={handleCancelLogin}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('Cancel')}
                </button>
              </>
            ) : qrCode && !qrCodeImage ? (
              <>
                <div className="bg-input p-6 rounded-lg flex flex-col items-center gap-2">
                  <QrCode className="w-12 h-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    {t('QR code generated. Please scan with WeChat.')}
                  </p>
                </div>
                <button
                  onClick={handleCancelLogin}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('Cancel')}
                </button>
              </>
            ) : (
              <button
                onClick={handleStartLogin}
                disabled={isLoggingIn}
                className="px-4 py-2 text-sm bg-primary/20 text-primary rounded-lg hover:bg-primary/30 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <QrCode className="w-4 h-4" />
                )}
                {t('Scan QR Code to Login')}
              </button>
            )}

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 w-full">
                <p className="text-sm text-red-500">{loginError}</p>
              </div>
            )}
          </div>
        )}

        {status?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-500">{status.error}</p>
          </div>
        )}

        {/* Pairing & Authorization */}
        <div className="pt-3 border-t border-border space-y-4">
          <p className="text-sm font-medium">{t('Pairing & Authorization')}</p>

          {/* Pairing Code */}
          {wechatConfig?.pairingCode && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('Pairing Code')}
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 bg-input rounded-lg text-lg font-mono tracking-widest">
                    {wechatConfig.pairingCode}
                  </code>
                  <button
                    onClick={() => copyToClipboard(wechatConfig.pairingCode)}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                    title={t('Copy')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRegeneratePairingCode}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                    title={t('Regenerate')}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('Users must send this code as their first message to pair.')}
              </p>
            </div>
          )}

          {/* Authorized Sessions */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">{t('Authorized Users')}</p>
            {sessions.length > 0 ? (
              <>
                <p className="text-xs text-yellow-500/80 mb-2">
                  {t('Removing a user requires re-pairing with the pairing code')}
                </p>
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.fromUserId}
                      className="flex items-center justify-between p-2 bg-input rounded-lg"
                    >
                      <div className="text-sm">
                        <span className="font-medium">
                          {session.displayName || session.fromUserId.split('@')[0]}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {new Date(session.pairedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevokeUser(session.fromUserId)}
                        className="p-1 text-muted-foreground hover:text-red-500"
                        title={t('Revoke')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t('No authorized users yet')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
