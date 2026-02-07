/**
 * Step1CreateTask - First step of the wizard
 *
 * Layout:
 * - Three creation methods in a row (AI/Manual/Import), default AI
 * - Content area changes based on selection
 * - Collapsible "Advanced Settings" with project directory (collapsed by default)
 * - Footer with "Next" button
 *
 * Behavior:
 * - AI: Enter description → click Next → generate stories → go to step 2
 * - Manual: Click Next → go to step 2 with empty story list
 * - Import: Select file → validate → click Next → go to step 2
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  Wand2,
  FileEdit,
  Upload,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  FileJson
} from 'lucide-react'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { useSpaceStore } from '../../../stores/space.store'
import { api } from '../../../api'
import { cn } from '../../../lib/utils'
import type { CreateMethod, WizardStep } from '../../../../shared/types/loop-task'

interface ImportResult {
  success: boolean
  project?: string
  storyCount?: number
  branchName?: string
  error?: string
}

interface Step1CreateTaskProps {
  onCancel?: () => void  // Kept for API compatibility, cancel is now in header
}

export function Step1CreateTask(_props: Step1CreateTaskProps) {
  const { t } = useTranslation()
  const { currentSpace } = useSpaceStore()
  const {
    editingTask,
    updateEditing,
    createMethod,
    setCreateMethod,
    aiDescription,
    setAiDescription,
    setWizardStep
  } = useLoopTaskStore()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Default to AI method and set project directory
  useEffect(() => {
    if (!createMethod) {
      setCreateMethod('ai')
    }
    if (!editingTask?.projectDir && currentSpace?.path) {
      updateEditing({ projectDir: currentSpace.path })
    }
  }, [currentSpace?.path, editingTask?.projectDir, updateEditing, createMethod, setCreateMethod])

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const result = await api.selectFolder()
      if (result.success && result.data) {
        updateEditing({ projectDir: result.data })
        setError(null)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
  }

  // Handle method selection
  const handleMethodSelect = (method: CreateMethod) => {
    setCreateMethod(method)
    setError(null)
    setImportResult(null)
  }

  // Handle file import (validate only, don't go to next step)
  const handleImport = async () => {
    if (!editingTask?.projectDir) {
      setError(t('Please select a project directory'))
      return
    }

    setIsLoading(true)
    setError(null)
    setImportResult(null)

    try {
      const result = await api.ralphImportPrd({ projectDir: editingTask.projectDir })

      if (result.success && result.data) {
        updateEditing({
          stories: result.data.stories,
          branchName: result.data.branchName,
          description: result.data.description,
          source: 'import'
        })
        // Auto-advance to step 2 after successful import
        setWizardStep(2 as WizardStep)
      } else {
        setImportResult({
          success: false,
          error: result.error || t('Failed to import prd.json')
        })
      }
    } catch (err) {
      setImportResult({
        success: false,
        error: (err as Error).message
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Next button click
  const handleNext = async () => {
    if (!editingTask?.projectDir) {
      setError(t('Please select a project directory'))
      setShowAdvanced(true)
      return
    }

    setError(null)

    if (createMethod === 'ai') {
      // AI: Generate stories then go to step 2
      if (!aiDescription.trim()) {
        setError(t('Please enter a feature description'))
        return
      }

      setIsLoading(true)
      try {
        const result = await api.ralphGenerateStories({
          projectDir: editingTask.projectDir,
          description: aiDescription
        })

        if (result.success && result.data) {
          updateEditing({
            stories: result.data,
            description: aiDescription,
            source: 'generate'
          })
          setWizardStep(2 as WizardStep)
        } else {
          setError(result.error || t('Failed to generate stories'))
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    } else if (createMethod === 'manual') {
      // Manual: Go directly to step 2 with empty stories
      updateEditing({ source: 'manual', stories: [] })
      setWizardStep(2 as WizardStep)
    } else if (createMethod === 'import') {
      // Import: Only go if import was successful
      if (!importResult?.success) {
        setError(t('Please import a valid prd.json file first'))
        return
      }
      setWizardStep(2 as WizardStep)
    }
  }

  // Check if Next button should be enabled
  const canProceed = () => {
    if (createMethod === 'ai') {
      return aiDescription.trim().length > 0
    }
    if (createMethod === 'manual') {
      return true
    }
    if (createMethod === 'import') {
      return importResult?.success === true
    }
    return false
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Task Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {t('Title')}
            </label>
            <input
              type="text"
              value={editingTask?.name || ''}
              onChange={(e) => updateEditing({ name: e.target.value })}
              placeholder={t('Task title...')}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
            />
          </div>

          {/* Creation Method - Horizontal Row */}
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-foreground">
                {t('Choose the best way to create your automated task')}
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* AI Create */}
              <button
                onClick={() => handleMethodSelect('ai')}
                className={cn(
                  'relative px-3 py-2.5 border rounded-lg transition-all duration-200 text-left flex items-center gap-2.5 group',
                  createMethod === 'ai'
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 shrink-0',
                    createMethod === 'ai'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted/50 text-muted-foreground group-hover:bg-muted'
                  )}
                >
                  <Wand2 size={16} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-semibold text-foreground flex-1">
                  {t('AI Generate')}
                </span>
                <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded">
                  {t('Recommended')}
                </span>
              </button>

              {/* Manual Create */}
              <button
                onClick={() => handleMethodSelect('manual')}
                className={cn(
                  'relative px-3 py-2.5 border rounded-lg transition-all duration-200 text-left flex items-center gap-2.5 group',
                  createMethod === 'manual'
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 shrink-0',
                    createMethod === 'manual'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted/50 text-muted-foreground group-hover:bg-muted'
                  )}
                >
                  <FileEdit size={16} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {t('Manual Create')}
                </span>
              </button>

              {/* Import */}
              <button
                onClick={() => handleMethodSelect('import')}
                className={cn(
                  'relative px-3 py-2.5 border rounded-lg transition-all duration-200 text-left flex items-center gap-2.5 group',
                  createMethod === 'import'
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 shrink-0',
                    createMethod === 'import'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted/50 text-muted-foreground group-hover:bg-muted'
                  )}
                >
                  <Upload size={16} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {t('Import')}
                </span>
              </button>
            </div>
          </div>

          {/* Content Area - Changes based on selection */}
          <div>
            {/* AI Generate Content */}
            {createMethod === 'ai' && (
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder={t('Describe the feature you want to implement...')}
                rows={5}
                className="w-full px-4 py-3 border border-border bg-card/95 rounded-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 resize-none transition-all"
              />
            )}

            {/* Manual Create Content */}
            {createMethod === 'manual' && (
              <div className="p-6 border border-dashed border-border rounded-lg bg-muted/30">
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileEdit size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t('Manual Create')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('You will be able to add user stories one by one in the next step')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Import Content */}
            {createMethod === 'import' && (
              <div className="space-y-4">
                {/* Import Button */}
                {!importResult && (
                  <div className="p-6 border border-dashed border-border rounded-lg bg-muted/30">
                    <div className="flex flex-col items-center text-center gap-3">
                      <button
                        onClick={handleImport}
                        disabled={isLoading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {isLoading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <FileJson size={16} />
                        )}
                        {t('Select prd.json file')}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {t('Load existing stories from prd.json file')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Import Success */}
                {importResult?.success && (
                  <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="text-success shrink-0 mt-0.5" size={18} />
                      <div className="flex-1 space-y-1">
                        <p className="font-medium text-foreground">{t('Import successful')}</p>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <p>
                            {t('Project')}: {importResult.project}
                          </p>
                          <p>
                            {t('Story Count')}: {importResult.storyCount}
                          </p>
                          {importResult.branchName && (
                            <p>
                              {t('Branch')}: {importResult.branchName}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setImportResult(null)}
                        className="text-sm text-primary hover:underline"
                      >
                        {t('Re-import')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Import Error */}
                {importResult && !importResult.success && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-destructive shrink-0 mt-0.5" size={18} />
                      <div className="flex-1">
                        <p className="font-medium text-destructive">{t('Import failed')}</p>
                        <p className="text-sm text-muted-foreground mt-1">{importResult.error}</p>
                      </div>
                      <button
                        onClick={() => setImportResult(null)}
                        className="text-sm text-primary hover:underline"
                      >
                        {t('Retry')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced Settings (Collapsible) - tight to content */}
          <div className="-mt-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{t('Advanced Settings')}</span>
            </button>

            {showAdvanced && (
              <div className="pl-8 pt-3 space-y-2">
                  <label className="block text-sm text-muted-foreground">
                    {t('Project Directory')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editingTask?.projectDir || ''}
                      onChange={(e) => updateEditing({ projectDir: e.target.value })}
                      placeholder="/path/to/your/project"
                      className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={handleSelectFolder}
                      className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-2 text-sm"
                    >
                      <FolderOpen size={14} />
                      {t('Browse')}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('Defaults to current space directory')}
                  </p>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer - consistent with Step2/Step3 */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-end">
          <button
            onClick={handleNext}
            disabled={isLoading || !canProceed()}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {createMethod === 'ai' ? t('Generating...') : t('Next')}
              </>
            ) : (
              <>
                {t('Next')}
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
