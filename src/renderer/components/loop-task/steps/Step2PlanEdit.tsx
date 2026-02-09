/**
 * Step2PlanEdit - Second step of the wizard
 *
 * Allows user to:
 * - View and edit story list
 * - Add, edit, delete, reorder stories
 * - Override model per story
 * - Configure max iterations
 *
 * When "Next" is clicked, generates prd.json and goes to step 3
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Circle,
  Sparkles,
  CheckCircle2,
  RotateCcw
} from 'lucide-react'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { useToastStore } from '../../../stores/toast.store'
import { useAppStore } from '../../../stores/app.store'
import { api } from '../../../api'
import { StoryEditModal } from '../../ralph/StoryEditModal'
import { cn } from '../../../lib/utils'
import {
  PROVIDER_NAMES,
  getProviderLogoById,
  getModelLogo
} from '../../layout/ModelSelector'
import { getCurrentLanguage } from '../../../i18n'
import type { AISourceType, OAuthSourceConfig } from '../../../types'
import type { UserStory, WizardStep } from '../../../../shared/types/loop-task'

// Localized text type from auth providers
type LocalizedText = string | Record<string, string>

interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  enabled: boolean
}

function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') return value
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

// Provider info types for StoryCard
interface OAuthProviderInfo {
  type: string
  displayName: string
  config?: OAuthSourceConfig
  isLoggedIn: boolean
}

interface CustomProviderInfo {
  id: string
  name: string
  logo: string | null
  model: string
}

interface Step2PlanEditProps {
  onCancel: () => void
}

export function Step2PlanEdit({ onCancel }: Step2PlanEditProps) {
  const { t } = useTranslation()
  const { editingTask, updateEditing, setWizardStep, setGeneratedPrdPath } = useLoopTaskStore()
  const { addToast } = useToastStore()
  const config = useAppStore((s) => s.config)

  const [localStories, setLocalStories] = useState<UserStory[]>(editingTask?.stories || [])
  const [editingStory, setEditingStory] = useState<UserStory | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])

  // Load auth providers for model selector
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
  }, [])

  // Compute available providers from config (matching ModelSelector.tsx logic)
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

  const loggedInOAuthProviders: OAuthProviderInfo[] = authProviders
    .filter(p => p.type !== 'custom' && p.enabled)
    .map(p => {
      const providerConfig = (aiSources as Record<string, any>)[p.type] as OAuthSourceConfig | undefined
      return {
        type: p.type,
        displayName: getLocalizedText(p.displayName),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Sync local stories with editing task
  useEffect(() => {
    if (editingTask?.stories) {
      setLocalStories(editingTask.stories)
    }
  }, [editingTask?.stories])

  // Toggle story expand/collapse
  const toggleExpand = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev)
      if (next.has(storyId)) {
        next.delete(storyId)
      } else {
        next.add(storyId)
      }
      return next
    })
  }

  // Add new story
  const handleAddStory = () => {
    setIsCreating(true)
    setEditingStory({
      id: '',
      title: '',
      description: '',
      acceptanceCriteria: [],
      priority: localStories.length + 1,
      status: 'pending',
      notes: ''
    })
  }

  // Save story (new or edit)
  const handleSaveStory = (story: UserStory) => {
    if (isCreating) {
      // Generate US-xxx format ID
      const maxId = localStories.reduce((max, s) => {
        const match = s.id.match(/US-(\d+)/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)
      const newId = `US-${String(maxId + 1).padStart(3, '0')}`

      const newStory = { ...story, id: newId }
      setLocalStories([...localStories, newStory])
      addToast(t('Story added'), 'success')
    } else {
      // Update existing
      setLocalStories(localStories.map((s) => (s.id === story.id ? story : s)))
      addToast(t('Story updated'), 'success')
    }
    setEditingStory(null)
    setIsCreating(false)
  }

  // Remove story
  const handleRemoveStory = (storyId: string) => {
    const newStories = localStories.filter((s) => s.id !== storyId)
    // Update priorities
    newStories.forEach((s, i) => {
      s.priority = i + 1
    })
    setLocalStories(newStories)
  }

  // Move story up/down
  const handleMoveStory = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= localStories.length) return

    const newStories = [...localStories]
    const [removed] = newStories.splice(index, 1)
    newStories.splice(newIndex, 0, removed)
    // Update priorities
    newStories.forEach((s, i) => {
      s.priority = i + 1
    })
    setLocalStories(newStories)
  }

  // Go to previous step
  const handlePrev = () => {
    // Save current stories before going back
    updateEditing({ stories: localStories })
    setWizardStep(1 as WizardStep)
  }

  // Go to next step - generate prd.json
  const handleNext = async () => {
    if (localStories.length === 0) {
      setError(t('Please add at least one story'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Update editing task with current stories
      updateEditing({ stories: localStories })

      // Generate prd.json
      const result = await api.loopTaskExportPrd({
        projectDir: editingTask?.projectDir || '',
        description: editingTask?.description || '',
        stories: localStories,
        branchName: editingTask?.branchName
      })

      if (result.success && result.data) {
        setGeneratedPrdPath(result.data.path)
        setWizardStep(3 as WizardStep)
      } else {
        setError(result.error || t('Failed to generate prd.json'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Story List Header */}
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">
              {t('User Stories')} ({localStories.length})
            </label>
            <button
              onClick={handleAddStory}
              className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
            >
              <Plus size={14} />
              {t('Add')}
            </button>
          </div>

          {/* Story List */}
          {localStories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4 text-muted-foreground">
                <Plus size={32} strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">{t('No stories yet')}</h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">
                {t('Add your first user story to define what the task should accomplish.')}
              </p>
              <button
                onClick={handleAddStory}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                {t('Add User Story')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {localStories.map((story, index) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  index={index}
                  total={localStories.length}
                  isExpanded={expandedStories.has(story.id)}
                  onToggle={() => toggleExpand(story.id)}
                  onEdit={() => {
                    setIsCreating(false)
                    setEditingStory(story)
                  }}
                  onRemove={() => handleRemoveStory(story.id)}
                  onMoveUp={() => handleMoveStory(index, 'up')}
                  onMoveDown={() => handleMoveStory(index, 'down')}
                  onUpdate={(updated) =>
                    setLocalStories(localStories.map((s) => (s.id === updated.id ? updated : s)))
                  }
                  loggedInOAuthProviders={loggedInOAuthProviders}
                  configuredCustomProviders={configuredCustomProviders}
                  aiSources={aiSources}
                />
              ))}

              <button
                onClick={handleAddStory}
                className="w-full py-3 h-auto border border-dashed border-border hover:border-primary/50 hover:bg-accent/30 rounded-lg text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus size={16} />
                {t('Add Story')}
              </button>
            </div>
          )}

          {/* Max Iterations Config */}
          <div className="p-4 border border-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {t('Max Iterations')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={editingTask?.maxIterations || 10}
                  onChange={(e) =>
                    updateEditing({ maxIterations: parseInt(e.target.value) || 10 })
                  }
                  min={1}
                  max={50}
                  className="w-20 px-3 py-1.5 bg-input border border-border rounded-md text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="text-sm text-muted-foreground">{t('iterations')}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Maximum number of iterations per story before marking as failed')}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            {t('Cancel')}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              {t('Previous')}
            </button>
            <button
              onClick={handleNext}
              disabled={isLoading || localStories.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {t('Next')}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Story Edit Modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory}
          isNew={isCreating}
          onSave={handleSaveStory}
          onClose={() => {
            setEditingStory(null)
            setIsCreating(false)
          }}
        />
      )}
    </div>
  )
}

// ============================================
// Story Card Component
// ============================================

interface StoryCardProps {
  story: UserStory
  index: number
  total: number
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (story: UserStory) => void
  loggedInOAuthProviders: OAuthProviderInfo[]
  configuredCustomProviders: CustomProviderInfo[]
  aiSources: Record<string, any>
}

function StoryCard({
  story,
  index,
  total,
  isExpanded,
  onToggle,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdate,
  loggedInOAuthProviders,
  configuredCustomProviders,
  aiSources
}: StoryCardProps) {
  const { t } = useTranslation()
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showModelDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelDropdown])

  const hasCustomModel = !!(story.model || story.modelSource)

  // Get logo for the story's model
  const getStoryModelLogo = (): string | null => {
    if (!hasCustomModel) return null
    // Check OAuth providers
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === story.modelSource) {
        return getModelLogo(story.model || '', story.model || '', provider.type)
      }
    }
    // Check custom providers
    const customProvider = configuredCustomProviders.find(p => p.id === story.modelSource)
    if (customProvider) return customProvider.logo
    return null
  }

  // Get display name for the story's model
  const getStoryModelName = (): string => {
    if (!hasCustomModel) return ''
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === story.modelSource && provider.config?.modelNames?.[story.model || '']) {
        return provider.config.modelNames[story.model || '']
      }
    }
    const customProvider = configuredCustomProviders.find(p => p.id === story.modelSource)
    if (customProvider) return customProvider.model || customProvider.name
    return story.model || ''
  }

  const storyModelLogo = getStoryModelLogo()

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        <Circle className="text-muted-foreground" size={14} />
        <span className="w-5 h-5 flex items-center justify-center bg-muted rounded text-xs font-medium text-muted-foreground">
          {story.priority}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
        <span className="flex-1 font-medium text-foreground text-sm truncate">{story.title}</span>

        {/* Actions */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {/* Model selector button */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className={cn(
                'p-1 rounded hover:bg-accent transition-colors',
                hasCustomModel ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              title={hasCustomModel ? getStoryModelName() : t('Model Selection')}
            >
              {storyModelLogo ? (
                <img src={storyModelLogo} alt="" className="w-[14px] h-[14px] rounded object-cover" />
              ) : (
                <Sparkles size={14} />
              )}
            </button>

            {/* Model dropdown */}
            {showModelDropdown && (
              <div className="absolute z-20 right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {/* Use Default option */}
                <button
                  onClick={() => {
                    onUpdate({ ...story, model: undefined, modelSource: undefined })
                    setShowModelDropdown(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5',
                    !hasCustomModel && 'bg-primary/10'
                  )}
                >
                  <RotateCcw size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground">{t('Use Default')}</span>
                  {!hasCustomModel && <CheckCircle2 size={14} className="text-primary flex-shrink-0 ml-auto" />}
                </button>

                <div className="my-0.5 border-t border-border" />

                {/* Official / OAuth Models */}
                {loggedInOAuthProviders.map((provider) => (
                  (provider.config?.availableModels || []).map((modelId) => {
                    const displayName = provider.config?.modelNames?.[modelId] || modelId
                    const isSelected = story.modelSource === provider.type && story.model === modelId
                    const modelLogo = getModelLogo(modelId, displayName, provider.type)
                    return (
                      <button
                        key={`${provider.type}-${modelId}`}
                        onClick={() => {
                          onUpdate({ ...story, model: modelId, modelSource: provider.type })
                          setShowModelDropdown(false)
                        }}
                        className={cn(
                          'w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5',
                          isSelected && 'bg-primary/10'
                        )}
                      >
                        {modelLogo ? (
                          <img src={modelLogo} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-muted-foreground">AI</span>
                          </div>
                        )}
                        <span className="text-sm text-foreground truncate flex-1">{displayName}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-primary flex-shrink-0" />}
                      </button>
                    )
                  })
                ))}

                {/* Divider between official and custom */}
                {loggedInOAuthProviders.length > 0 && configuredCustomProviders.length > 0 && (
                  <div className="my-0.5 border-t border-border" />
                )}

                {/* Custom API Models */}
                {configuredCustomProviders.map((provider) => {
                  const isSelected = story.modelSource === provider.id
                  return (
                    <button
                      key={provider.id}
                      onClick={() => {
                        onUpdate({ ...story, model: provider.model, modelSource: provider.id })
                        setShowModelDropdown(false)
                      }}
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      {provider.logo ? (
                        <img src={provider.logo} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground">AI</span>
                        </div>
                      )}
                      <span className="text-sm text-foreground truncate flex-1">{provider.model || provider.name}</span>
                      {isSelected && <CheckCircle2 size={14} className="text-primary flex-shrink-0" />}
                    </button>
                  )
                })}

                {/* Empty state */}
                {loggedInOAuthProviders.length === 0 && configuredCustomProviders.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    {t('Configure API')}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('Move up')}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('Move down')}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title={t('Edit')}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title={t('Remove')}
          >
            <Trash2 size={14} />
          </button>
        </div>

        <ChevronDown
          size={14}
          className={cn(
            'text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Details */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border">
          <div className="pt-3 space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('Description')}
              </div>
              <p className="text-sm text-foreground">{story.description || '-'}</p>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('Acceptance Criteria')}
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {story.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>

            {story.notes && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{t('Notes')}</div>
                <p className="text-sm text-muted-foreground">{story.notes}</p>
              </div>
            )}

            {/* Quality Gates */}
            <div onClick={(e) => e.stopPropagation()}>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('Quality Gates')}
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={story.requireTypecheck ?? false}
                    onChange={(e) =>
                      onUpdate({ ...story, requireTypecheck: e.target.checked })
                    }
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{t('Typecheck')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={story.requireTests ?? false}
                    onChange={(e) =>
                      onUpdate({ ...story, requireTests: e.target.checked })
                    }
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{t('Tests')}</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                💡 {t('Enable when writing code to ensure quality')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
