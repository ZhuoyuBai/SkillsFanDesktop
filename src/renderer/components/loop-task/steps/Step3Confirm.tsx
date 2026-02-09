/**
 * Step3Confirm - Third step of the wizard
 *
 * Enhanced review & configure step:
 * - Editable task name and branch name
 * - Task configuration summary (project dir, method, iterations)
 * - prd.json generation status
 * - Compact story list preview
 *
 * When "Return to Edit" is clicked, deletes prd.json and goes back to step 2
 * When "Start Execution" is clicked, creates task and goes to step 4
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  FileJson,
  Loader2,
  X,
  FolderOpen,
  GitBranch,
  ListChecks,
  Repeat,
  Cpu,
  Gem,
  AlertTriangle
} from 'lucide-react'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { useChatStore } from '../../../stores/chat.store'
import { useAppStore } from '../../../stores/app.store'
import { api } from '../../../api'
import { useToastStore } from '../../../stores/toast.store'
import type { AISourceType, OAuthSourceConfig } from '../../../types'
import {
  PROVIDER_NAMES,
  getProviderLogoById,
  getModelLogo
} from '../../layout/ModelSelector'
import { getCurrentLanguage } from '../../../i18n'
import { cn } from '../../../lib/utils'
import type { WizardStep } from '../../../../shared/types/loop-task'

// Localized text type
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

interface Step3ConfirmProps {
  spaceId: string
  onCancel: () => void
}

export function Step3Confirm({ spaceId, onCancel }: Step3ConfirmProps) {
  const { t } = useTranslation()
  const {
    editingTask,
    createMethod,
    generatedPrdPath,
    setWizardStep,
    setGeneratedPrdPath,
    updateEditing,
    createTask,
    clearLog
  } = useLoopTaskStore()
  const { setSelectionType } = useChatStore()
  const { addToast } = useToastStore()

  const config = useAppStore((s) => s.config)
  const isSkillsFanCredits = config?.aiSources?.current === 'skillsfan-credits'

  const [isStarting, setIsStarting] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [jsonContent, setJsonContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])

  // Load auth providers for model display
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
  }, [])

  // Fetch credits (force refresh on Step 3 load)
  const fetchCredits = useCallback(async () => {
    if (!isSkillsFanCredits) return
    try {
      const res = await api.skillsfanRefreshCredits()
      if (res.success && res.data !== undefined) {
        setCredits(res.data as number)
      }
    } catch {
      // Silently fail
    }
  }, [isSkillsFanCredits])

  useEffect(() => {
    fetchCredits()
  }, [fetchCredits])

  // Compute providers from config (same as Step1)
  const aiSources = config?.aiSources || { current: 'custom' as AISourceType }

  const configuredCustomProviders = Object.keys(aiSources)
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
        model: source.model || ''
      }
    })

  const loggedInOAuthProviders = authProviders
    .filter(p => p.type !== 'custom' && p.enabled)
    .map(p => {
      const providerConfig = (aiSources as Record<string, any>)[p.type] as OAuthSourceConfig | undefined
      return {
        type: p.type,
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Model info - resolve display name from dynamic providers
  const selectedModelId = editingTask?.model || ''
  const selectedModelSource = editingTask?.modelSource || ''

  const getModelDisplayName = (): string => {
    if (!selectedModelId && !selectedModelSource) {
      const currentSource = aiSources.current || 'custom'
      const currentConfig = (aiSources as Record<string, any>)[currentSource]
      if (currentConfig?.modelNames?.[currentConfig?.model]) return currentConfig.modelNames[currentConfig.model]
      if (currentConfig?.model) return currentConfig.model
      return t('Model')
    }
    for (const provider of loggedInOAuthProviders) {
      if (provider.type === selectedModelSource && provider.config?.modelNames?.[selectedModelId]) {
        return provider.config.modelNames[selectedModelId]
      }
    }
    const customProvider = configuredCustomProviders.find(p => p.id === selectedModelSource)
    if (customProvider) return customProvider.model || customProvider.name
    return selectedModelId || t('Model')
  }

  const storyCount = editingTask?.stories?.length || 0

  // Estimate credits based on token pricing from backend
  const sfConfig = (aiSources as Record<string, any>)['skillsfan-credits'] || {}
  const modelPricing = sfConfig.modelPricing as Record<string, { input: number; output: number }> | undefined
  const effectiveModelId = selectedModelId || sfConfig.model || ''
  const pricing = modelPricing?.[effectiveModelId]

  // Average token usage per story (conservative estimate)
  const EST_INPUT_TOKENS_PER_STORY = 50_000
  const EST_OUTPUT_TOKENS_PER_STORY = 10_000

  const estimatedCredits = pricing && storyCount > 0
    ? Math.round(
        (EST_INPUT_TOKENS_PER_STORY / 1000 * pricing.input +
         EST_OUTPUT_TOKENS_PER_STORY / 1000 * pricing.output) * storyCount
      )
    : null
  const remainingAfter = credits !== null && estimatedCredits !== null ? credits - estimatedCredits : null
  const isCreditsLow = remainingAfter !== null && remainingAfter < 0

  // Method labels
  const methodLabels: Record<string, string> = {
    ai: t('AI Generate'),
    manual: t('Manual Create'),
    import: t('Import from prd.json')
  }

  // Go back to step 2 - delete prd.json
  const handlePrev = async () => {
    if (generatedPrdPath) {
      try {
        await api.loopTaskDeletePrd(generatedPrdPath)
      } catch (err) {
        console.error('Failed to delete prd.json:', err)
      }
      setGeneratedPrdPath(null)
    }
    setWizardStep(2 as WizardStep)
  }

  // Start execution
  const handleStart = async () => {
    if (!editingTask?.projectDir || !editingTask?.stories?.length) {
      setError(t('Invalid task configuration'))
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      // Create the task
      const task = await createTask(spaceId, {
        name: editingTask.name || t('New Loop Task'),
        projectDir: editingTask.projectDir,
        description: editingTask.description || '',
        source: editingTask.source || 'manual',
        stories: editingTask.stories,
        maxIterations: editingTask.maxIterations || 10,
        branchName: editingTask.branchName,
        model: editingTask.model,
        modelSource: editingTask.modelSource
      })

      // Clear log and go to step 4
      clearLog()
      setWizardStep(4 as WizardStep)
      addToast(t('Task created, execution started'), 'success')

      // Start execution
      const startResult = await api.ralphStart(spaceId, task.id)
      if (!startResult.success) {
        setError(startResult.error || t('Failed to start task'))
      }
    } catch (err) {
      setError((err as Error).message)
      setIsStarting(false)
    }
  }

  // View JSON content
  const handleViewJson = async () => {
    if (!generatedPrdPath) return

    try {
      const result = await api.readFile(generatedPrdPath)
      if (result.success && result.data) {
        setJsonContent(result.data)
        setShowJson(true)
      }
    } catch (err) {
      console.error('Failed to read prd.json:', err)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-auto p-4 min-h-0">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Task Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {t('Task Name')}
            </label>
            <input
              type="text"
              value={editingTask?.name || ''}
              onChange={(e) => updateEditing({ name: e.target.value })}
              placeholder={t('New Loop Task')}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Branch Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground flex items-center gap-1.5">
              <GitBranch size={14} className="text-muted-foreground" />
              {t('Branch Name')}
            </label>
            <input
              type="text"
              value={editingTask?.branchName || ''}
              onChange={(e) => updateEditing({ branchName: e.target.value })}
              placeholder={t('auto-generated if empty')}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground">
              {t('Leave empty to auto-generate from task name')}
            </p>
          </div>

          {/* Task Configuration Summary */}
          <div className="p-4 border border-border rounded-lg space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t('Configuration Summary')}</h3>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm">
                <FolderOpen size={14} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">{t('Project')}:</span>
                <span className="text-foreground truncate" title={editingTask?.projectDir}>
                  {editingTask?.projectDir}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <ListChecks size={14} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">{t('Stories')}:</span>
                <span className="text-foreground">
                  {editingTask?.stories?.length || 0} {t('stories')}
                  {' · '}
                  {methodLabels[createMethod || 'manual'] || createMethod}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Repeat size={14} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">{t('Max Iterations')}:</span>
                <span className="text-foreground">{editingTask?.maxIterations || 10}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Cpu size={14} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">{t('Model')}:</span>
                <span className="text-foreground">{getModelDisplayName()}</span>
              </div>
              {isSkillsFanCredits && estimatedCredits !== null && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Gem size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground shrink-0">{t('Est. Cost')}:</span>
                  <span className="text-foreground">~{estimatedCredits} {t('credits')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Credit Balance Card (only for skillsfan-credits users) */}
          {isSkillsFanCredits && credits !== null && estimatedCredits !== null && (
            <div className={cn(
              'p-4 rounded-lg border space-y-3',
              isCreditsLow
                ? 'bg-warning/10 border-warning/20'
                : 'bg-secondary/30 border-border'
            )}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('Available')}</span>
                  <span className="font-medium text-foreground tabular-nums">{Math.round(credits).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('Estimated Cost')}</span>
                  <span className="font-medium text-foreground tabular-nums">~{estimatedCredits}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('Remaining After')}</span>
                  <span className={cn('font-medium tabular-nums', isCreditsLow ? 'text-warning' : 'text-foreground')}>
                    ~{Math.round(remainingAfter!).toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', isCreditsLow ? 'bg-warning' : 'bg-primary')}
                  style={{ width: `${Math.max(0, Math.min(100, ((remainingAfter ?? 0) / credits) * 100))}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t('Estimates are approximate. Actual usage may vary.')}
              </p>
              {isCreditsLow && (
                <div className="flex items-center gap-1.5 text-sm text-warning">
                  <AlertTriangle size={14} />
                  {t('Credits may not be sufficient for this task')}
                </div>
              )}
            </div>
          )}

          {/* prd.json Status */}
          {generatedPrdPath && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="text-success shrink-0" size={16} />
              <span className="text-sm text-foreground flex-1">{t('prd.json generated')}</span>
              <button
                onClick={handleViewJson}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <FileJson size={14} />
                {t('View JSON')}
              </button>
            </div>
          )}

          {/* Story List Preview (Compact) */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">{t('Story List')}</h3>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {editingTask?.stories?.map((story, index) => (
                <div key={story.id} className="px-3 py-2.5 flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                    {index + 1}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{story.id}</span>
                  <span className="text-sm text-foreground truncate flex-1">{story.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {story.acceptanceCriteria.length} {t('criteria')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm text-warning">
            {t('After starting, you cannot return to edit')}
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
              disabled={isStarting}
              className="px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              {t('Return to Edit')}
            </button>
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isStarting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {t('Start Execution')}
            </button>
          </div>
        </div>
      </div>

      {/* JSON View Modal */}
      {showJson && jsonContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-medium text-foreground">prd.json</h3>
              <button
                onClick={() => setShowJson(false)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">
                {jsonContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
