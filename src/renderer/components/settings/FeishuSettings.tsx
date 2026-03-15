/**
 * Feishu Settings Section
 *
 * Configuration UI for Feishu bot integration.
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { Select } from '../ui/Select'
import { Eye, EyeOff, Copy, RefreshCw, Trash2, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import type { FeishuStatus, FeishuSessionMapping } from '@shared/types/feishu'

interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  pairingCode: string
  allowedChatIds: string[]
  defaultSpaceId?: string
  groupPolicy: 'mention' | 'all' | 'disabled'
}

export function FeishuSettings({ config }: { config: Record<string, unknown> }) {
  const { t } = useTranslation()
  const { setConfig } = useAppStore()
  const feishuConfig = config.feishu as FeishuConfig | undefined

  const [appId, setAppId] = useState(feishuConfig?.appId || '')
  const [appSecret, setAppSecret] = useState(feishuConfig?.appSecret || '')
  const [showSecret, setShowSecret] = useState(false)
  const [status, setStatus] = useState<FeishuStatus | null>(null)
  const [sessions, setSessions] = useState<FeishuSessionMapping[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; botName?: string; error?: string } | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  const refreshConfig = useCallback(async () => {
    const res = await api.getConfig()
    if (res.success) {
      setConfig(res.data)
    }
  }, [setConfig])

  const loadStatus = useCallback(async () => {
    const res = await api.feishuStatus()
    if (res.success) {
      setStatus(res.data as FeishuStatus)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    const res = await api.feishuGetSessions()
    if (res.success) {
      setSessions(res.data as FeishuSessionMapping[])
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadSessions()
  }, [loadStatus, loadSessions])

  const handleTestConnection = async () => {
    if (!appId || !appSecret) return
    setIsTesting(true)
    setTestResult(null)
    try {
      // Auto-save credentials before testing
      await api.feishuSetCredentials(appId, appSecret)
      const res = await api.feishuTestConnection(appId, appSecret)
      if (res.success) {
        setTestResult(res.data as { success: boolean; botName?: string; error?: string })
      } else {
        setTestResult({ success: false, error: res.error })
      }
    } catch (err) {
      setTestResult({ success: false, error: String(err) })
    } finally {
      setIsTesting(false)
    }
  }

  const handleToggle = async () => {
    setIsToggling(true)
    try {
      if (status?.enabled && status?.connected) {
        await api.feishuDisable()
      } else {
        // Save credentials first if changed
        if (appId && appSecret) {
          await api.feishuSetCredentials(appId, appSecret)
        }
        await api.feishuEnable()
      }
      await loadStatus()
      await refreshConfig()
    } catch (err) {
      console.error('Failed to toggle Feishu:', err)
    } finally {
      setIsToggling(false)
    }
  }

  const handleRegeneratePairingCode = async () => {
    const res = await api.feishuRegeneratePairingCode()
    if (res.success) {
      await loadStatus()
      await refreshConfig()
    }
  }

  const handleRevokeChat = async (chatId: string) => {
    await api.feishuRevokeChat(chatId)
    await loadSessions()
  }

  const handleGroupPolicyChange = async (policy: string) => {
    await api.feishuSetGroupPolicy(policy)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <section className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-medium mb-4">{t('Feishu')}</h2>

      {/* Setup Guide */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-500 text-xl">💡</span>
          <div className="text-sm">
            <p className="text-blue-500 font-medium mb-1">{t('Setup Guide')}</p>
            <p className="text-blue-500/80 mb-2">
              {t('Create a self-built app in the Feishu Developer Console, enable the Bot capability, and add the required permissions.')}
            </p>
            <a
              href="https://open.feishu.cn/app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400"
            >
              {t('Open Feishu Developer Console')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Credentials */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('App ID')}</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => { setAppId(e.target.value); setTestResult(null) }}
              placeholder="cli_xxxxx"
              className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('App Secret')}</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => { setAppSecret(e.target.value); setTestResult(null) }}
                placeholder="xxxxx"
                className="w-full px-3 py-2 pr-10 text-sm bg-input rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Connection Status & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status?.connected ? 'bg-green-500' : status?.enabled ? 'bg-yellow-500' : 'bg-gray-400'
            }`} />
            <span className="text-sm">
              {status?.connected
                ? `${t('Connected')}${status.botName ? ` - ${status.botName}` : ''}`
                : status?.error
                  ? t('Connection Error')
                  : t('Not Connected')}
            </span>
            {testResult && (
              <div className="flex items-center gap-1 text-sm ml-2">
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-green-500">{testResult.botName || t('Success')}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-500">{testResult.error || t('Failed')}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !appId || !appSecret}
              className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('Test Connection')}
            </button>
            <button
              onClick={handleToggle}
              disabled={isToggling || (!appId || !appSecret)}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                status?.connected
                  ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
              } disabled:opacity-50`}
            >
              {isToggling
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : status?.connected ? t('Disable') : t('Enable')}
            </button>
          </div>
        </div>

        {status?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-500">{status.error}</p>
          </div>
        )}

        {/* Group Policy */}
        <div className="pt-3 border-t border-border">
          <p className="text-sm font-medium mb-2">{t('Group Message Policy')}</p>
          <Select
            value={feishuConfig?.groupPolicy || 'mention'}
            onChange={handleGroupPolicyChange}
            options={[
              { value: 'mention', label: t('Respond when @mentioned') },
              { value: 'all', label: t('Respond to all messages') },
              { value: 'disabled', label: t('Ignore group messages') }
            ]}
          />
        </div>

        {/* Pairing & Authorization */}
        <div className="pt-3 border-t border-border space-y-4">
          <p className="text-sm font-medium">{t('Pairing & Authorization')}</p>

          {/* Pairing Code */}
          {feishuConfig?.pairingCode && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t('Share this code with users who need to connect via Feishu')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 bg-input rounded-lg text-lg font-mono tracking-widest">
                    {feishuConfig.pairingCode}
                  </code>
                  <button
                    onClick={() => copyToClipboard(feishuConfig.pairingCode)}
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
            </div>
          )}

          {/* Authorized Sessions */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">{t('Authorized Chats')}</p>
            {sessions.length > 0 ? (
              <>
                <p className="text-xs text-yellow-500/80 mb-2">
                  {t('Removing a chat requires re-pairing with the pairing code')}
                </p>
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.chatId}
                      className="flex items-center justify-between p-2 bg-input rounded-lg"
                    >
                      <div className="text-sm">
                        <span className="font-medium">{session.chatName}</span>
                        <span className="text-muted-foreground ml-2">
                          {session.chatType === 'p2p' ? t('Direct Message') : t('Group')}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {new Date(session.pairedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevokeChat(session.chatId)}
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
              <p className="text-xs text-muted-foreground">{t('No authorized chats yet')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
