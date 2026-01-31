/**
 * Ralph Setup - Task configuration step
 *
 * Allows users to:
 * - Select project directory
 * - Choose task source (import/generate/manual)
 * - Enter feature description (for AI generation)
 * - Set max iterations
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FileJson, Sparkles, PenLine, ChevronRight } from 'lucide-react'
import { useRalphStore, type TaskSource } from '../../stores/ralph.store'
import { api } from '../../api'

export function RalphSetup() {
  const { t } = useTranslation()
  const {
    projectDir,
    setProjectDir,
    description,
    setDescription,
    source,
    setSource,
    maxIterations,
    setMaxIterations,
    branchName,
    setBranchName,
    setStories,
    setView,
    isGenerating,
    setIsGenerating,
    isImporting,
    setIsImporting,
    setError
  } = useRalphStore()

  const [localError, setLocalError] = useState<string | null>(null)

  const handleSelectFolder = async () => {
    try {
      const result = await api.selectFolder()
      if (result.success && result.data) {
        setProjectDir(result.data)
        setLocalError(null)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
  }

  const handleNext = async () => {
    setLocalError(null)

    if (!projectDir) {
      setLocalError(t('Please select a project directory'))
      return
    }

    if (source === 'import') {
      // Import from prd.json
      setIsImporting(true)
      try {
        const result = await api.ralphImportPrd({ projectDir })
        if (result.success && result.data) {
          setStories(result.data.stories)
          if (result.data.branchName) {
            setBranchName(result.data.branchName)
          }
          if (result.data.description) {
            setDescription(result.data.description)
          }
          setView('stories')
        } else {
          setLocalError(result.error || t('Failed to import prd.json'))
        }
      } catch (err) {
        setLocalError(t('Failed to import prd.json'))
      } finally {
        setIsImporting(false)
      }
    } else if (source === 'generate') {
      // AI generate stories
      if (!description.trim()) {
        setLocalError(t('Please enter a feature description'))
        return
      }

      // Jump to stories page immediately, show loading there
      setIsGenerating(true)
      setView('stories')

      // Continue API call in background
      api
        .ralphGenerateStories({ projectDir, description })
        .then((result) => {
          if (result.success && result.data) {
            setStories(result.data)
          } else {
            setError(result.error || t('Failed to generate stories'))
            setView('setup') // Return on error
          }
        })
        .catch(() => {
          setError(t('Failed to generate stories'))
          setView('setup') // Return on error
        })
        .finally(() => {
          setIsGenerating(false)
        })
    } else {
      // Manual - go directly to stories page with empty list
      setStories([])
      setView('stories')
    }
  }

  const sourceOptions: { value: TaskSource; icon: React.ReactNode; label: string; desc: string }[] = [
    {
      value: 'import',
      icon: <FileJson size={18} />,
      label: t('Import from prd.json'),
      desc: t('Load existing stories from prd.json file')
    },
    {
      value: 'generate',
      icon: <Sparkles size={18} />,
      label: t('AI Generate'),
      desc: t('Generate stories from feature description')
    },
    {
      value: 'manual',
      icon: <PenLine size={18} />,
      label: t('Manual Create'),
      desc: t('Create stories manually one by one')
    }
  ]

  const isLoading = isGenerating || isImporting
  const canProceed = projectDir && (source !== 'generate' || description.trim())

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Project Directory */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('Project Directory')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              placeholder="/path/to/your/project"
              className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSelectFolder}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-2"
            >
              <FolderOpen size={16} />
              {t('Browse')}
            </button>
          </div>
        </div>

        {/* Task Source */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            {t('Task Source')}
          </label>
          <div className="grid gap-3">
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSource(option.value)}
                className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-all ${
                  source === option.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                }`}
              >
                <div
                  className={`mt-0.5 ${
                    source === option.value ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {option.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{option.label}</div>
                  <div className="text-sm text-muted-foreground">{option.desc}</div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-1 ${
                    source === option.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  }`}
                >
                  {source === option.value && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Feature Description (for AI generation) */}
        {source === 'generate' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {t('Feature Description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Describe the feature you want to implement...')}
              rows={4}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('AI will generate user stories based on this description')}
            </p>
          </div>
        )}

        {/* Max Iterations */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('Max Iterations')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value) || 10)}
              min={1}
              max={50}
              className="w-24 px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">{t('iterations')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Maximum number of story execution attempts')}
          </p>
        </div>

        {/* Error */}
        {localError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {localError}
          </div>
        )}

        {/* Next Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleNext}
            disabled={!canProceed || isLoading}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                {isGenerating ? t('Generating...') : t('Importing...')}
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
