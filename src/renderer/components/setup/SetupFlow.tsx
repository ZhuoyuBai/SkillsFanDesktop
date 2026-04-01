/**
 * SetupFlow - Multi-source login flow
 * Handles the first-time setup with OAuth providers or Custom API
 * Dynamically supports any provider configured in product.json
 */

import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app.store'
import { useSpaceStore } from '../../stores/space.store'
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
  const { setConfig, initialize, setView } = useAppStore()
  const [step, setStep] = useState<SetupStep>('select')

  const [currentProvider, setCurrentProvider] = useState<string | null>(null)
  const [oauthState, setOauthState] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<DeviceCodeInfo | null>(null)
  // Track selected provider for ApiSetup
  const [selectedProviderId, setSelectedProviderId] = useState<string>('zhipu')

  // OAuth provider types that use SkillsFan login flow
  const OAUTH_PROVIDER_TYPES = new Set(['glm', 'minimax-oauth', 'skillsfan-credits', 'github-copilot'])

  // Handle provider selection from grid
  const handleSelectProvider = async (providerId: string) => {
    if (providerId === 'openai-codex') {
      // OpenAI OAuth is handled inline in LoginSelector, go directly to home
      await handleSkip()
      return
    }
    if (OAUTH_PROVIDER_TYPES.has(providerId)) {
      // OAuth providers go through the login flow
      handleOAuthLogin(providerId)
    } else {
      // Custom API providers go to ApiSetup
      setSelectedProviderId(providerId)
      setStep('custom')
    }
  }

  // Handle OAuth provider login (generic)
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
        throw new Error(result.error || t('Failed to start login'))
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
        throw new Error(completeResult.error || t('Login failed'))
      }

      // Success! Reload config and enter space view
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as any)
      }
      // Re-run app initialization to load spaces and set the correct view
      await initialize()
    } catch (err) {
      console.error(`[SetupFlow] ${providerType} login error:`, err)
      setError(err instanceof Error ? err.message : t('Login failed'))
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

  // Handle skip - go directly to space without configuring model
  const handleSkip = async () => {
    console.log('[SetupFlow] Skipping setup, going to chat...')
    // Mark first launch as complete
    const currentConfig = useAppStore.getState().config
    if (currentConfig) {
      const updatedConfig = {
        ...currentConfig,
        isFirstLaunch: false,
        terminal: { ...currentConfig.terminal, skipClaudeLogin: true }
      }
      const result = await api.setConfig(updatedConfig)
      if (result.success && result.data) {
        setConfig(result.data as any)
      } else {
        setConfig(updatedConfig)
      }
    }
    // Load spaces and go directly to chat
    await useSpaceStore.getState().loadSpaces()
    const { haloSpace } = useSpaceStore.getState()
    if (haloSpace) {
      useSpaceStore.getState().setCurrentSpace(haloSpace)
    }
    setView('space')
  }

  // Render based on step
  if (step === 'select') {
    return (
      <LoginSelector
        onSelectProvider={handleSelectProvider}
        onBack={undefined}
        onSkip={handleSkip}
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
