/**
 * Step2PlanEdit - Second step of the wizard
 *
 * Allows user to:
 * - View and edit story list
 * - Add, edit, delete, reorder stories
 * - Override model per story
 * - Configure execution settings (step retry, loop execution)
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
  Trash2,
  Sparkles,
  Loader2,
  Settings2
} from 'lucide-react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { useToastStore } from '../../../stores/toast.store'
import { api } from '../../../api'
import { cn } from '../../../lib/utils'
import { getModelLogo } from '../../layout/ModelSelector'
import { useModelProviders } from '../../../hooks/useModelProviders'
import { SchedulePicker } from '../schedule'
import type { OAuthProviderInfo, CustomProviderInfo } from '../../../hooks/useModelProviders'
import type { UserStory, WizardStep, TaskSchedule, StepRetryConfig, LoopConfig } from '../../../../shared/types/loop-task'
import { calculateMaxIterations } from '../../../../shared/types/loop-task'


interface Step2PlanEditProps {
  spaceId: string
  onCancel: () => void
}

export function Step2PlanEdit({ spaceId, onCancel }: Step2PlanEditProps) {
  const { t } = useTranslation()
  const { editingTask, updateEditing, setWizardStep, setGeneratedPrdPath, createTask, clearLog, isGeneratingStories, setIsGeneratingStories } = useLoopTaskStore()
  const { addToast } = useToastStore()

  const {
    loggedInOAuthProviders,
    configuredCustomProviders,
    getModelDisplayName: getDefaultModelName,
    getModelLogo: getDefaultModelLogo
  } = useModelProviders()

  const [localStories, setLocalStories] = useState<UserStory[]>(() => {
    const existing = editingTask?.stories || []
    if (existing.length > 0) return existing
    return [{
      id: 'US-001',
      title: '',
      description: '',
      acceptanceCriteria: [],
      priority: 1,
      status: 'pending' as const,
      notes: '',
      model: editingTask?.model,
      modelSource: editingTask?.modelSource
    }]
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showExecutionSettings, setShowExecutionSettings] = useState(false)
  const executionSettingsRef = useRef<HTMLDivElement>(null)
  const autoGenerateTriggeredRef = useRef(false)

  // Close popover on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (executionSettingsRef.current && !executionSettingsRef.current.contains(e.target as Node)) {
        setShowExecutionSettings(false)
      }
    }
    if (showExecutionSettings) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showExecutionSettings])

  // Schedule toggle helper
  const handleScheduleToggle = () => {
    const schedule = editingTask?.schedule
    const isEnabled = schedule?.enabled ?? false
    const newSchedule: TaskSchedule = schedule?.type && schedule.type !== 'manual'
      ? { ...schedule, enabled: !isEnabled }
      : { type: 'cron', cronExpression: '0 9 * * *', enabled: !isEnabled }
    updateEditing({ schedule: newSchedule })
  }

  // Sync local stories with editing task
  useEffect(() => {
    if (editingTask?.stories && editingTask.stories.length > 0) {
      setLocalStories(editingTask.stories)
    }
  }, [editingTask?.stories])

  // Auto-trigger generation when entering step 2 from AI mode,
  // even if the generation flag was lost during step transition.
  useEffect(() => {
    if (autoGenerateTriggeredRef.current) return
    if (isGeneratingStories) {
      autoGenerateTriggeredRef.current = true
      return
    }

    const shouldAutoGenerate =
      editingTask?.source === 'generate' &&
      ((editingTask?.stories?.length || 0) === 0)

    if (shouldAutoGenerate) {
      autoGenerateTriggeredRef.current = true
      setIsGeneratingStories(true)
    }
  }, [editingTask?.source, editingTask?.stories, isGeneratingStories, setIsGeneratingStories])

  // Generate stories when coming from AI mode
  useEffect(() => {
    if (!isGeneratingStories) return
    let cancelled = false
    const projectDir = (editingTask?.projectDir || '').trim()
    const description = (editingTask?.description || '').trim()

    if (!projectDir || !description) {
      console.warn('[Step2PlanEdit] Missing context for story generation', {
        hasProjectDir: !!projectDir,
        hasDescription: !!description
      })
      setError(t('Failed to generate sub-tasks'))
      addToast(t('Failed to generate sub-tasks'), 'error')
      setIsGeneratingStories(false)
      return
    }

    console.log('[Step2PlanEdit] Generating stories...', {
      projectDir,
      descriptionLength: description.length
    })

    api.ralphGenerateStories({
      projectDir,
      description
    }).then((result) => {
      if (cancelled) return
      const rawData = result.data as unknown
      const generatedStories: UserStory[] = Array.isArray(rawData)
        ? (rawData as UserStory[])
        : (rawData && typeof rawData === 'object' && Array.isArray((rawData as { stories?: unknown }).stories))
          ? (rawData as { stories: UserStory[] }).stories
          : []

      console.log('[Step2PlanEdit] Generate stories result', {
        success: result.success,
        count: generatedStories.length,
        hasError: !!result.error
      })

      if (result.success && generatedStories.length > 0) {
        updateEditing({ stories: generatedStories })
        setLocalStories(generatedStories)
      } else {
        const errMsg = result.error || t('Failed to generate sub-tasks')
        setError(errMsg)
        addToast(errMsg, 'error')
      }
    }).catch((err) => {
      if (!cancelled) {
        const errMsg = (err as Error).message || t('Failed to generate sub-tasks')
        setError(errMsg)
        addToast(errMsg, 'error')
      }
    }).finally(() => {
      if (!cancelled) setIsGeneratingStories(false)
    })

    return () => { cancelled = true }
  }, [
    isGeneratingStories,
    editingTask?.projectDir,
    editingTask?.description,
    setIsGeneratingStories,
    t,
    addToast,
    updateEditing
  ])

  // Add new empty story card
  const handleAddStory = () => {
    const maxId = localStories.reduce((max, s) => {
      const match = s.id.match(/US-(\d+)/)
      return match ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)
    const newId = `US-${String(maxId + 1).padStart(3, '0')}`
    // Inherit model from last story, or fall back to task default
    const lastStory = localStories[localStories.length - 1]
    const inheritModel = lastStory?.model || editingTask?.model
    const inheritModelSource = lastStory?.modelSource || editingTask?.modelSource
    const newStory: UserStory = {
      id: newId,
      title: '',
      description: '',
      acceptanceCriteria: [],
      priority: localStories.length + 1,
      status: 'pending',
      notes: '',
      model: inheritModel,
      modelSource: inheritModelSource
    }
    setLocalStories([...localStories, newStory])
  }

  // Update story inline (auto-save)
  const handleUpdateStory = (index: number, updated: UserStory) => {
    setLocalStories(localStories.map((s, i) => (i === index ? updated : s)))
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
      setError(t('Please add at least one sub-task'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Update editing task with current stories
      updateEditing({ stories: localStories })

      // Generate prd.json
      const prdResult = await api.loopTaskExportPrd({
        projectDir: editingTask?.projectDir || '',
        description: editingTask?.description || '',
        stories: localStories,
        branchName: editingTask?.branchName
      })

      if (prdResult.success && prdResult.data) {
        setGeneratedPrdPath(prdResult.data.path)
      } else {
        setError(prdResult.error || t('Failed to generate prd.json'))
        return
      }

      // Create the task
      const stepRetryConfig: StepRetryConfig = editingTask?.stepRetryConfig ?? { onFailure: 'retry', maxRetries: 3 }
      const loopConfig: LoopConfig = editingTask?.loopConfig ?? { enabled: false, maxLoops: 1 }
      const maxIterations = calculateMaxIterations(localStories.length, stepRetryConfig, loopConfig)

      const task = await createTask(spaceId, {
        name: editingTask?.name || (editingTask?.description || '').slice(0, 30).trim() || t('New Loop Task'),
        projectDir: editingTask?.projectDir || '',
        description: editingTask?.description || '',
        source: editingTask?.source || 'manual',
        stories: localStories,
        maxIterations,
        branchName: editingTask?.branchName,
        model: editingTask?.model,
        modelSource: editingTask?.modelSource,
        schedule: editingTask?.schedule,
        stepRetryConfig,
        loopConfig
      })

      // Clear log and go to step 3 (execute)
      clearLog()
      setWizardStep(3 as WizardStep)
      addToast(t('Task created, execution started'), 'success')

      // Start execution
      const startResult = await api.ralphStart(spaceId, task.id)
      if (!startResult.success) {
        setError(startResult.error || t('Failed to start task'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  // Keyboard shortcut: Cmd/Ctrl+Enter to proceed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isLoading && localStories.length > 0) {
        e.preventDefault()
        handleNext()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Story List Header */}
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">
              {t('Sub-tasks')} ({localStories.length})
            </label>
            <div className="flex items-center gap-2">
              {/* Execution Settings button + popover */}
              <div className="relative" ref={executionSettingsRef}>
                <button
                  onClick={() => setShowExecutionSettings(!showExecutionSettings)}
                  className="px-3 py-1.5 border border-foreground/20 rounded text-sm text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
                >
                  <Settings2 size={14} />
                  {t('Execution Settings')}
                </button>
                {showExecutionSettings && (
                  <div className="absolute z-20 right-0 mt-1.5 w-80 bg-card border border-border rounded-lg shadow-lg p-4 space-y-4">
                    {/* On Failure: Retry or Skip */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">{t('On Failure')}</label>
                        <div className="flex rounded-md border border-border overflow-hidden">
                          <button
                            onClick={() => updateEditing({
                              stepRetryConfig: { onFailure: 'retry', maxRetries: editingTask?.stepRetryConfig?.maxRetries ?? 3 }
                            })}
                            className={cn(
                              'px-3 py-1 text-xs font-medium transition-colors',
                              (editingTask?.stepRetryConfig?.onFailure ?? 'retry') === 'retry'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {t('Retry')}
                          </button>
                          <button
                            onClick={() => updateEditing({
                              stepRetryConfig: { onFailure: 'skip', maxRetries: editingTask?.stepRetryConfig?.maxRetries ?? 3 }
                            })}
                            className={cn(
                              'px-3 py-1 text-xs font-medium transition-colors border-l border-border',
                              (editingTask?.stepRetryConfig?.onFailure ?? 'retry') === 'skip'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {t('Skip')}
                          </button>
                        </div>
                      </div>
                      {(editingTask?.stepRetryConfig?.onFailure ?? 'retry') === 'retry' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t('Max retries per step')}</span>
                          <select
                            value={editingTask?.stepRetryConfig?.maxRetries ?? 3}
                            onChange={(e) => updateEditing({
                              stepRetryConfig: { onFailure: 'retry', maxRetries: parseInt(e.target.value) }
                            })}
                            className="w-14 px-1.5 py-1 bg-input border border-border rounded text-foreground text-sm text-center focus:outline-none focus:ring-0 focus:border-primary/50"
                          >
                            {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <span className="text-xs text-muted-foreground">{t('times')}</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border" />

                    {/* Loop Execution */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">{t('Loop Execution')}</label>
                        <button
                          onClick={() => updateEditing({
                            loopConfig: {
                              ...(editingTask?.loopConfig || { enabled: false, maxLoops: 3 }),
                              enabled: !(editingTask?.loopConfig?.enabled ?? false)
                            }
                          })}
                          className={cn(
                            'relative w-10 h-5 rounded-full transition-colors',
                            editingTask?.loopConfig?.enabled ? 'bg-primary' : 'bg-muted'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            editingTask?.loopConfig?.enabled ? 'translate-x-[20px]' : 'translate-x-0.5'
                          )} />
                        </button>
                      </div>
                      {editingTask?.loopConfig?.enabled && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t('Number of loops')}</span>
                          <select
                            value={editingTask?.loopConfig?.maxLoops ?? 3}
                            onChange={(e) => updateEditing({
                              loopConfig: { enabled: true, maxLoops: parseInt(e.target.value) }
                            })}
                            className="w-14 px-1.5 py-1 bg-input border border-border rounded text-foreground text-sm text-center focus:outline-none focus:ring-0 focus:border-primary/50"
                          >
                            {[2, 3, 5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <span className="text-xs text-muted-foreground">{t('times')}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{t('Repeat all steps from the beginning after completion')}</p>
                    </div>

                    <div className="border-t border-border" />

                    {/* Schedule */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">{t('Schedule')}</label>
                        <button
                          onClick={handleScheduleToggle}
                          className={cn(
                            'relative w-10 h-5 rounded-full transition-colors',
                            editingTask?.schedule?.enabled ? 'bg-primary' : 'bg-muted'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            editingTask?.schedule?.enabled ? 'translate-x-[20px]' : 'translate-x-0.5'
                          )} />
                        </button>
                      </div>
                      {editingTask?.schedule?.enabled && editingTask.schedule && (
                        <SchedulePicker schedule={editingTask.schedule} onChange={(schedule) => updateEditing({ schedule })} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Story List - inline editable */}
          {isGeneratingStories ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('Generating sub-tasks...')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {localStories.map((story, index) => (
                <InlineStoryCard
                  key={story.id}
                  story={story}
                  index={index}
                  total={localStories.length}
                  onChange={(updated) => handleUpdateStory(index, updated)}
                  onRemove={() => handleRemoveStory(story.id)}
                  onMoveUp={() => handleMoveStory(index, 'up')}
                  onMoveDown={() => handleMoveStory(index, 'down')}
                  loggedInOAuthProviders={loggedInOAuthProviders}
                  configuredCustomProviders={configuredCustomProviders}
                  defaultModelLogo={getDefaultModelLogo()}
                  defaultModelName={getDefaultModelName()}
                />
              ))}

              {/* Add step button */}
              <button
                onClick={handleAddStory}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 border border-border rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <Plus size={16} />
                <span className="text-sm">{t('Add Sub-task')}</span>
              </button>
            </div>
          )}

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
              disabled={isLoading || isGeneratingStories || localStories.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('Creating...')}
                </>
              ) : (
                <>
                  {t('Start Execution')}
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}

// ============================================
// Inline Story Card - Always editable, auto-save
// ============================================

interface InlineStoryCardProps {
  story: UserStory
  index: number
  total: number
  onChange: (story: UserStory) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  loggedInOAuthProviders: OAuthProviderInfo[]
  configuredCustomProviders: CustomProviderInfo[]
  defaultModelLogo: string | null
  defaultModelName: string
}

function InlineStoryCard({
  story,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  loggedInOAuthProviders,
  configuredCustomProviders,
  defaultModelLogo,
  defaultModelName
}: InlineStoryCardProps) {
  const { t } = useTranslation()
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newCriterion, setNewCriterion] = useState('')
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

  const getStoryModelLogo = (): string | null => {
    if (!hasCustomModel) return defaultModelLogo
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === story.modelSource) {
        return getModelLogo(story.model || '', story.model || '', provider.type)
      }
    }
    const customProvider = configuredCustomProviders.find(p => p.id === story.modelSource)
    if (customProvider) return customProvider.logo
    return defaultModelLogo
  }

  const getStoryModelName = (): string => {
    if (!hasCustomModel) return defaultModelName
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === story.modelSource && provider.config?.modelNames?.[story.model || '']) {
        return provider.config.modelNames[story.model || '']
      }
    }
    const customProvider = configuredCustomProviders.find(p => p.id === story.modelSource)
    if (customProvider) return customProvider.model || customProvider.name
    return story.model || defaultModelName
  }

  const handleAddCriterion = () => {
    if (!newCriterion.trim()) return
    onChange({ ...story, acceptanceCriteria: [...story.acceptanceCriteria, newCriterion.trim()] })
    setNewCriterion('')
  }

  const storyModelLogo = getStoryModelLogo()

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Header bar: number + actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <span className="px-2 py-0.5 bg-primary/10 rounded text-xs font-medium text-primary whitespace-nowrap">
          {t('Step {{number}}', { number: index + 1 })}
        </span>
        <span className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Model selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className={cn(
                'rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground',
                storyModelLogo ? 'p-0.5' : 'p-1.5'
              )}
              title={getStoryModelName()}
            >
              {storyModelLogo ? (
                <img src={storyModelLogo} alt="" className="w-6 h-6 rounded object-cover" />
              ) : (
                <Sparkles size={16} />
              )}
            </button>

            {showModelDropdown && (
              <div className="absolute z-20 right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {(() => {
                  const seenModelIds = new Set<string>()
                  return loggedInOAuthProviders.map((provider) => (
                    (provider.config?.availableModels || []).map((modelId) => {
                      if (seenModelIds.has(modelId)) return null
                      seenModelIds.add(modelId)
                      const displayName = provider.config?.modelNames?.[modelId] || modelId
                      const modelLogo = getModelLogo(modelId, displayName, provider.type)
                      return (
                        <button
                          key={`${provider.type}-${modelId}`}
                          onClick={() => { onChange({ ...story, model: modelId, modelSource: provider.type }); setShowModelDropdown(false) }}
                          className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5"
                        >
                          {modelLogo ? (
                            <img src={modelLogo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              <span className="text-xs text-muted-foreground">AI</span>
                            </div>
                          )}
                          <span className="text-sm text-foreground truncate flex-1">{displayName}</span>
                        </button>
                      )
                    })
                  ))
                })()}
                {loggedInOAuthProviders.length > 0 && configuredCustomProviders.length > 0 && (
                  <div className="my-1 border-t border-border" />
                )}
                {configuredCustomProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => { onChange({ ...story, model: provider.model, modelSource: provider.id }); setShowModelDropdown(false) }}
                    className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5"
                  >
                    {provider.logo ? (
                      <img src={provider.logo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-muted-foreground">AI</span>
                      </div>
                    )}
                    <span className="text-sm font-medium text-foreground truncate flex-1">{provider.model || provider.name}</span>
                  </button>
                ))}
                {loggedInOAuthProviders.length === 0 && configuredCustomProviders.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">{t('Configure API')}</div>
                )}
              </div>
            )}
          </div>

          <button onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground" title={t('Move priority up')}>
            <ChevronUp size={16} />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground" title={t('Move priority down')}>
            <ChevronDown size={16} />
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('Remove')}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Editable fields - always visible */}
      <div className="p-3 space-y-3">
        {/* Title */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">{t('Title')} <span className="text-muted-foreground/60">({t('Optional')})</span></div>
          <input
            type="text"
            value={story.title}
            onChange={(e) => onChange({ ...story, title: e.target.value })}
            placeholder={t('Name this step')}
            className="w-full px-3 py-2 bg-input border border-border rounded text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-primary/50"
          />
        </div>

        {/* Description */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">{t('Description')} <span className="text-foreground/60">({t('Required')})</span></div>
          <textarea
            value={story.description}
            onChange={(e) => onChange({ ...story, description: e.target.value })}
            placeholder={t('Describe what you want AI to do...')}
            rows={2}
            className="w-full px-3 py-2 bg-input border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-primary/50 resize-none"
          />
        </div>

        {/* Acceptance Criteria */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">{t('Acceptance Criteria')} <span className="text-muted-foreground/60">({t('Optional')})</span></div>
          <div className="bg-input border border-border rounded overflow-hidden divide-y divide-border">
            {story.acceptanceCriteria.map((criterion, ci) => (
              <div key={ci}>
                <div className="px-3 pt-1.5 pb-0.5">
                  <span className="text-muted-foreground text-xs">
                    {ci === 0 ? t('Cond {{n}}', { n: ci + 1 }) : t('And Cond {{n}}', { n: ci + 1 })}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 pb-1.5">
                  <input
                    type="text"
                    value={criterion}
                    onChange={(e) => {
                      const newCriteria = [...story.acceptanceCriteria]
                      newCriteria[ci] = e.target.value
                      onChange({ ...story, acceptanceCriteria: newCriteria })
                    }}
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                  />
                  <button
                    onClick={() => onChange({ ...story, acceptanceCriteria: story.acceptanceCriteria.filter((_, i) => i !== ci) })}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            <div>
              <div className="px-3 pt-1.5 pb-0.5">
                <span className="text-muted-foreground text-xs">
                  {story.acceptanceCriteria.length === 0
                    ? t('Cond {{n}}', { n: 1 })
                    : t('And Cond {{n}}', { n: story.acceptanceCriteria.length + 1 })}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <input
                  type="text"
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddCriterion() }
                  }}
                  placeholder={t('How to know it is done? Press Enter to add...')}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleAddCriterion}
                  disabled={!newCriterion.trim()}
                  className="text-xs text-primary hover:text-primary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {t('Add Condition')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quality Gates */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">
            {t('Quality Gates')} <span className="text-muted-foreground/60">({t('Optional')})</span>
          </div>
          <div className="flex items-center gap-4 px-3 py-2.5 bg-input border border-border rounded">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={story.requireTypecheck || false}
                onChange={(e) => onChange({ ...story, requireTypecheck: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs text-foreground">{t('Require Typecheck')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={story.requireTests || false}
                onChange={(e) => onChange({ ...story, requireTests: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs text-foreground">{t('Require Tests')}</span>
            </label>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('Delete')}
        message={t('Are you sure you want to delete this task?')}
        variant="danger"
        onConfirm={() => { setShowDeleteConfirm(false); onRemove() }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
