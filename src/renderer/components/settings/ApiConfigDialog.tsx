/**
 * ApiConfigDialog - Modal dialog for adding/editing API key configurations
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, ExternalLink, Check, Settings as SettingsIcon, ArrowLeft } from 'lucide-react'
import { CheckCircle2, XCircle } from '../icons/ToolIcons'
import { useTranslation } from '../../i18n'
import { Select } from '../ui/Select'
import type { ApiKeyConfig, ApiProvider } from '../../types'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../types'

// Provider presets - shared with SettingsPage
export interface ProviderPreset {
  id: string
  name: string
  nameKey: string
  apiUrl?: string
  defaultModel?: string
  logo?: string
  apiType: 'anthropic' | 'openai' | 'custom'
  isCustom?: boolean
  docsUrl?: string
  apiDocsUrl?: string
  altNote?: {
    prefixKey: string
    linkLabelKey: string
    linkUrl: string
    suffixKey: string
    altApiUrl: string
  }
}

interface ApiConfigDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (providerId: string, config: ApiKeyConfig, editIndex: number | null) => Promise<{ valid: boolean; message?: string }>
  providerPresets: ProviderPreset[]
  // Edit mode props
  editingConfig?: ApiKeyConfig | null
  editingProviderId?: string | null
  editingIndex?: number | null
}

export function ApiConfigDialog({
  isOpen,
  onClose,
  onSave,
  providerPresets,
  editingConfig,
  editingProviderId,
  editingIndex
}: ApiConfigDialogProps) {
  const { t } = useTranslation()
  const isEditing = editingConfig != null
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<ApiProvider>('anthropic')
  const [configLabel, setConfigLabel] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message?: string } | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (!isOpen) return

    setValidationResult(null)
    setIsSaving(false)
    setShowApiKey(false)

    if (isEditing && editingConfig && editingProviderId) {
      // Edit mode: pre-fill form
      setSelectedProviderId(editingProviderId)
      setApiKey(editingConfig.apiKey)
      setApiUrl(editingConfig.apiUrl)
      setModel(editingConfig.model)
      setProvider(editingConfig.provider)
      setConfigLabel(editingConfig.label || '')
      setUseCustomModel(!AVAILABLE_MODELS.some(m => m.id === editingConfig.model))
    } else {
      // Add mode: clear form
      setSelectedProviderId(null)
      setApiKey('')
      setApiUrl('')
      setModel('')
      setProvider('anthropic')
      setConfigLabel('')
      setUseCustomModel(false)
    }
  }, [isOpen, isEditing, editingConfig, editingProviderId])

  // Focus API key input when form becomes visible
  useEffect(() => {
    if (isOpen && (isEditing || selectedProviderId)) {
      setTimeout(() => {
        apiKeyInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen, isEditing, selectedProviderId])

  // Esc key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleSelectProvider = (presetId: string) => {
    const preset = providerPresets.find(p => p.id === presetId)
    if (!preset) return
    setSelectedProviderId(presetId)
    setApiUrl(preset.apiUrl || '')
    setModel('')
    setProvider(preset.apiType === 'openai' ? 'openai' : 'anthropic')
    setConfigLabel('')
    setUseCustomModel(false)
    setValidationResult(null)
  }

  const handleSave = async () => {
    if (!selectedProviderId || !apiKey) return

    setIsSaving(true)
    setValidationResult(null)

    try {
      const newEntry: ApiKeyConfig = {
        provider,
        apiKey,
        apiUrl,
        model,
        label: configLabel || model || undefined
      }

      const result = await onSave(selectedProviderId, newEntry, isEditing ? (editingIndex ?? null) : null)
      setValidationResult(result)

      if (result.valid) {
        // Close after a short delay to show success message
        setTimeout(() => onClose(), 300)
      }
    } catch {
      setValidationResult({ valid: false, message: t('Save failed') })
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const currentPreset = providerPresets.find(p => p.id === selectedProviderId)
  const showForm = isEditing || selectedProviderId != null

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog content */}
      <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-3xl max-h-[85vh] overflow-y-auto animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Back button: shown in add mode when provider is selected */}
            {!isEditing && selectedProviderId && (
              <button
                onClick={() => {
                  setSelectedProviderId(null)
                  setValidationResult(null)
                }}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {currentPreset?.logo && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                <img src={currentPreset.logo} alt={currentPreset.name} className="w-full h-full object-cover rounded-lg" />
              </div>
            )}
            <h2 className="text-lg font-semibold text-foreground/95 tracking-tight">
              {isEditing ? t('Edit Configuration') : t('Add Configuration')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Grid (add mode only, before provider is selected) */}
        {!isEditing && !selectedProviderId && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('Select AI Provider')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {providerPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectProvider(preset.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    {preset.logo ? (
                      <img src={preset.logo} alt={preset.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-full bg-muted/50 flex items-center justify-center rounded-lg">
                        <SettingsIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {preset.isCustom ? t(preset.nameKey) : preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Config Form */}
        {showForm && (
          <div className="space-y-4">
            {/* Model Name */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">{t('Model Name')}</label>
              <input
                type="text"
                value={configLabel}
                onChange={(e) => setConfigLabel(e.target.value)}
                placeholder={currentPreset?.defaultModel ? `${t('e.g.')} ${currentPreset.defaultModel}` : t('e.g. My Model')}
                className="w-full px-3 py-2.5 text-sm bg-input/50 rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all"
              />
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">API Key</label>
                {currentPreset?.docsUrl && (
                  <a
                    href={currentPreset.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('Get API Key')}
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  ref={apiKeyInputRef}
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={currentPreset?.apiType === 'openai' ? 'sk-xxxxxxxxxxxxx' : 'sk-ant-xxxxxxxxxxxxx'}
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-input/50 rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {currentPreset?.altNote && (
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  {t(currentPreset.altNote.prefixKey)}{' '}
                  <a href={currentPreset.altNote.linkUrl} target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:underline">
                    {t(currentPreset.altNote.linkLabelKey)}
                  </a>
                  {t(currentPreset.altNote.suffixKey)}{' '}
                  <code className="px-1 py-0.5 bg-secondary/50 rounded text-[11px] select-all">{currentPreset.altNote.altApiUrl}</code>
                </p>
              )}
            </div>

            {/* API URL */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">{t('API URL')}</label>
                {currentPreset?.apiDocsUrl && (
                  <a
                    href={currentPreset.apiDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('API Documentation')}
                  </a>
                )}
              </div>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={currentPreset?.apiUrl || 'https://...'}
                className="w-full px-3 py-2.5 text-sm bg-input/50 rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all"
              />
            </div>

            {/* Model ID */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">{t('Model ID')}</label>
              {selectedProviderId === 'claude' ? (
                <>
                  {useCustomModel ? (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="claude-sonnet-4-5-20250929"
                      className="w-full px-3 py-2.5 text-sm bg-input/50 rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all"
                    />
                  ) : (
                    <Select
                      value={model}
                      onChange={setModel}
                      options={AVAILABLE_MODELS.map((m) => ({ value: m.id, label: m.name }))}
                    />
                  )}
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      {useCustomModel
                        ? t('Enter official Claude model name')
                        : t(AVAILABLE_MODELS.find((m) => m.id === model)?.description || '')}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap shrink-0">
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                        useCustomModel ? 'bg-primary border-primary' : 'border-border bg-input'
                      }`}>
                        {useCustomModel && <Check className="w-3 h-3 text-primary-foreground" />}
                      </span>
                      <input
                        type="checkbox"
                        checked={useCustomModel}
                        onChange={(e) => {
                          setUseCustomModel(e.target.checked)
                          if (!e.target.checked && !AVAILABLE_MODELS.some(m => m.id === model)) {
                            setModel(DEFAULT_MODEL)
                          }
                        }}
                        className="sr-only"
                      />
                      {t('Custom')}
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={currentPreset?.defaultModel || 'model-name'}
                    className="w-full px-3 py-2.5 text-sm bg-input/50 rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('Must match the official model ID from your API provider')}
                  </p>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-secondary transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !apiKey}
                className="px-5 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? t('Saving...') : t('Save')}
              </button>
              {validationResult && (
                <span className={`text-xs flex items-center gap-1 ${validationResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                  {validationResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {validationResult.message}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
