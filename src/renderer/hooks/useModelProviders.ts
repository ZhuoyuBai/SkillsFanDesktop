/**
 * useModelProviders - Shared hook for model/provider selection logic
 *
 * Extracts duplicated provider loading, model resolution, and logo logic
 * from Step1CreateTask, Step2PlanEdit, and Step3Confirm.
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/app.store'
import { api } from '../api'
import { getCurrentLanguage } from '../i18n'
import {
  PROVIDER_NAMES,
  getProviderLogoById,
  getModelLogo
} from '../components/layout/ModelSelector'
import type { AISourceType, OAuthSourceConfig } from '../types'

// Localized text type from auth providers
type LocalizedText = string | Record<string, string>

interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  enabled: boolean
}

function isOAuthProviderConfig(value: unknown): value is OAuthSourceConfig {
  return !!value && typeof value === 'object' && 'loggedIn' in value
}

export interface OAuthProviderInfo {
  type: string
  displayName: string
  config?: OAuthSourceConfig
  isLoggedIn: boolean
}

export interface CustomProviderInfo {
  id: string
  name: string
  logo: string | null
  model: string
}

function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') return value
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

interface UseModelProvidersOptions {
  /** Model ID (e.g., from editingTask.model) */
  selectedModelId?: string
  /** Model source (e.g., from editingTask.modelSource) */
  selectedModelSource?: string
}

interface UseModelProvidersResult {
  /** OAuth providers that the user is logged into */
  loggedInOAuthProviders: OAuthProviderInfo[]
  /** Custom API key providers configured by the user */
  configuredCustomProviders: CustomProviderInfo[]
  /** Resolve display name for the currently selected model */
  getModelDisplayName: () => string
  /** Resolve logo URL for the currently selected model */
  getModelLogo: () => string | null
  /** Whether SkillsFan Credits is the current AI source */
  isSkillsFanCredits: boolean
  /** The aiSources config object */
  aiSources: Record<string, any>
}

export function useModelProviders(options: UseModelProvidersOptions = {}): UseModelProvidersResult {
  const { selectedModelId = '', selectedModelSource = '' } = options
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])

  const isSkillsFanCredits = config?.aiSources?.current === 'skillsfan-credits'

  // Load auth providers once on mount
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
  }, [])

  // Compute available providers from config
  const aiSources = config?.aiSources || { current: 'custom' as AISourceType }

  const configuredCustomProviders: CustomProviderInfo[] = Object.keys(aiSources)
    .filter(key => {
      if (key === 'current' || key === 'oauth' || key === 'custom') return false
      const source = (aiSources as Record<string, any>)[key]
      return source && typeof source === 'object' && 'apiKey' in source && source.apiKey && !('loggedIn' in source)
    })
    .map(key => {
      const source = (aiSources as Record<string, any>)[key]
      return {
        id: key,
        name: PROVIDER_NAMES[key] || key,
        logo: getProviderLogoById(key),
        model: source.model || ''
      }
    })

  const providerMetaByType = new Map(
    authProviders
      .filter(p => p.type !== 'custom')
      .map(provider => [provider.type, provider])
  )
  const oauthProviderTypes = Array.from(new Set([
    ...Array.from(providerMetaByType.keys()),
    ...Object.keys(aiSources).filter(key => {
      if (key === 'current' || key === 'oauth' || key === 'custom') return false
      return isOAuthProviderConfig((aiSources as Record<string, unknown>)[key])
    })
  ]))

  const loggedInOAuthProviders: OAuthProviderInfo[] = oauthProviderTypes
    .filter(type => {
      const meta = providerMetaByType.get(type)
      const providerConfig = (aiSources as Record<string, any>)[type] as OAuthSourceConfig | undefined
      return meta?.enabled !== false || providerConfig?.loggedIn === true
    })
    .map(type => {
      const meta = providerMetaByType.get(type)
      const providerConfig = (aiSources as Record<string, any>)[type] as OAuthSourceConfig | undefined
      return {
        type,
        displayName: meta ? getLocalizedText(meta.displayName) : (PROVIDER_NAMES[type] || type),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Resolve display name for the selected model
  const getModelDisplayNameFn = (): string => {
    if (!selectedModelId && !selectedModelSource) {
      const currentSource = aiSources.current || 'custom'
      const currentConfig = (aiSources as Record<string, any>)[currentSource]
      if (currentConfig?.modelNames?.[currentConfig?.model]) {
        return currentConfig.modelNames[currentConfig.model]
      }
      if (currentConfig?.model) return currentConfig.model
      return t('Model')
    }
    // Check OAuth providers
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === selectedModelSource && provider.config?.modelNames?.[selectedModelId]) {
        return provider.config.modelNames[selectedModelId]
      }
    }
    // Check custom providers
    const customProvider = configuredCustomProviders.find(p => p.id === selectedModelSource)
    if (customProvider) return customProvider.model || customProvider.name
    // Fallback to model ID
    return selectedModelId || t('Model')
  }

  // Resolve logo for the selected model
  const getModelLogoFn = (): string | null => {
    if (selectedModelSource) {
      for (const provider of loggedInOAuthProviders) {
        if (provider.type === selectedModelSource) {
          return getModelLogo(selectedModelId, getModelDisplayNameFn(), provider.type)
        }
      }
      const customProvider = configuredCustomProviders.find(p => p.id === selectedModelSource)
      if (customProvider) return customProvider.logo
    }
    // Fallback: check current config
    const currentSource = (aiSources.current || 'custom') as string
    const currentConfig = (aiSources as Record<string, any>)[currentSource]
    if (currentConfig?.model) {
      const modelName = currentConfig.modelNames?.[currentConfig.model] || currentConfig.model
      const modelLogo = getModelLogo(currentConfig.model, modelName, currentSource)
      if (modelLogo) return modelLogo
    }
    return getProviderLogoById(currentSource)
  }

  return {
    loggedInOAuthProviders,
    configuredCustomProviders,
    getModelDisplayName: getModelDisplayNameFn,
    getModelLogo: getModelLogoFn,
    isSkillsFanCredits,
    aiSources: aiSources as Record<string, any>
  }
}
