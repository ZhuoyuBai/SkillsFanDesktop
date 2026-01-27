/**
 * SetupFlow - Multi-source login flow
 * Handles the first-time setup with OAuth providers or Custom API
 * Dynamically supports any provider configured in product.json
 */

import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { LoginSelector } from './LoginSelector'
import { ApiSetup } from './ApiSetup'
import { useTranslation } from '../../i18n'
import { Loader2 } from 'lucide-react'
import { HaloLogo } from '../brand/HaloLogo'

type SetupStep = 'select' | 'oauth-waiting' | 'custom'

/** Device code info for display in UI */
interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
}

export function SetupFlow() {
  const { t } = useTranslation()
  const { setView, setConfig } = useAppStore()
  const [step, setStep] = useState<SetupStep>('select')
  const [currentProvider, setCurrentProvider] = useState<string | null>(null)
  const [oauthState, setOauthState] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<DeviceCodeInfo | null>(null)
  // Track selected provider for ApiSetup
  const [selectedProviderId, setSelectedProviderId] = useState<string>('claude')

  // Handle provider selection from grid
  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderId(providerId)
    setStep('custom')  // Navigate to ApiSetup
  }

  // Handle OAuth provider login (generic) - kept for future use
  const handleOAuthLogin = async (providerType: string) => {
    setError(null)
    setCurrentProvider(providerType)
    setStep('oauth-waiting')
    setLoginStatus(t('Opening login page...'))
    setDeviceCodeInfo(null)

    try {
      // Start the login flow - this opens the browser
      const result = await api.authStartLogin(providerType)
      if (!result.success) {
        throw new Error(result.error || 'Failed to start login')
      }

      const { state, userCode, verificationUri } = result.data as {
        loginUrl: string
        state: string
        userCode?: string
        verificationUri?: string
      }
      setOauthState(state)

      // If device code flow, show user code and verification URL
      if (userCode && verificationUri) {
        setDeviceCodeInfo({ userCode, verificationUri })
        setLoginStatus(t('Enter the code in your browser'))
      } else {
        setLoginStatus(t('Waiting for login...'))
      }

      // Complete the login - this polls for the token
      const completeResult = await api.authCompleteLogin(providerType, state)
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Login failed')
      }

      // Success! Reload config and go to home
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as any)
      }

      setView('home')
    } catch (err) {
      console.error(`[SetupFlow] ${providerType} login error:`, err)
      setError(err instanceof Error ? err.message : 'Login failed')
      setStep('select')
      setCurrentProvider(null)
    }
  }

  // Handle back from ApiSetup
  const handleBackFromCustom = () => {
    setStep('select')
  }

  // Listen for login progress updates (generic)
  useEffect(() => {
    if (step !== 'oauth-waiting' || !currentProvider) return

    // Listen to generic auth progress
    const unsubscribe = api.onAuthLoginProgress((data: { provider: string; status: string }) => {
      if (data.provider === currentProvider) {
        setLoginStatus(data.status)
      }
    })

    return unsubscribe
  }, [step, currentProvider])

  // Render based on step
  if (step === 'select') {
    return (
      <LoginSelector
        onSelectProvider={handleSelectProvider}
      />
    )
  }

  if (step === 'oauth-waiting') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8">
        {/* Header with Logo */}
        <div className="flex flex-col items-center mb-10">
          <HaloLogo size={80} />
          <h1 className="mt-4 text-3xl font-light tracking-wide">技能范</h1>
        </div>

        {/* Loading state */}
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{loginStatus}</p>

          {/* Device code display for OAuth Device Code flow */}
          {deviceCodeInfo && (
            <div className="mt-4 p-6 bg-muted/50 border border-border rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">
                {t('Visit this URL to login:')}
              </p>
              <a
                href={deviceCodeInfo.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-mono text-sm"
              >
                {deviceCodeInfo.verificationUri}
              </a>
              <p className="text-sm text-muted-foreground mt-4 mb-2">
                {t('Enter this code:')}
              </p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-2xl font-bold font-mono tracking-widest bg-background px-4 py-2 rounded border border-border select-all">
                  {deviceCodeInfo.userCode}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(deviceCodeInfo.userCode)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title={t('Copy code')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {!deviceCodeInfo && (
            <p className="text-sm text-muted-foreground/70">
              {t('Please complete login in your browser')}
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Cancel button */}
        <button
          onClick={() => {
            setStep('select')
            setCurrentProvider(null)
          }}
          className="mt-8 px-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('Cancel')}
        </button>
      </div>
    )
  }

  if (step === 'custom') {
    return <ApiSetup key={selectedProviderId} showBack onBack={handleBackFromCustom} initialProviderId={selectedProviderId} />
  }

  return null
}
