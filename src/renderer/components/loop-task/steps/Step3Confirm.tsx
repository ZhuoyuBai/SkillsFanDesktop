/**
 * Step3Confirm - Third step of the wizard
 *
 * Shows:
 * - Task overview (project dir, method, story count, iterations)
 * - prd.json generation status
 * - Read-only story list preview
 *
 * When "Return to Edit" is clicked, deletes prd.json and goes back to step 2
 * When "Start Execution" is clicked, creates task and goes to step 4
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  FileJson,
  Loader2,
  X
} from 'lucide-react'
import { useLoopTaskStore } from '../../../stores/loop-task.store'
import { useChatStore } from '../../../stores/chat.store'
import { api } from '../../../api'
import type { WizardStep } from '../../../../shared/types/loop-task'

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
    createTask,
    clearLog
  } = useLoopTaskStore()
  const { setSelectionType } = useChatStore()

  const [isStarting, setIsStarting] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [jsonContent, setJsonContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        branchName: editingTask.branchName
      })

      // Clear log and go to step 4
      clearLog()
      setWizardStep(4 as WizardStep)

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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Task Overview */}
          <div className="p-4 border border-border rounded-lg space-y-3">
            <h3 className="font-medium text-foreground">{t('Task Overview')}</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">{t('Project Directory')}:</span>
              <span className="text-foreground truncate" title={editingTask?.projectDir}>
                {editingTask?.projectDir}
              </span>

              <span className="text-muted-foreground">{t('Creation Method')}:</span>
              <span className="text-foreground">
                {methodLabels[createMethod || 'manual'] || createMethod}
              </span>

              <span className="text-muted-foreground">{t('Story Count')}:</span>
              <span className="text-foreground">{editingTask?.stories?.length || 0}</span>

              <span className="text-muted-foreground">{t('Max Iterations')}:</span>
              <span className="text-foreground">{editingTask?.maxIterations || 10}</span>
            </div>
          </div>

          {/* prd.json Status */}
          {generatedPrdPath && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="text-green-600 shrink-0" size={16} />
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

          {/* Story List Preview (Read-only) */}
          <div className="space-y-3">
            <h3 className="font-medium text-foreground">{t('Story List')}</h3>
            <div className="space-y-2">
              {editingTask?.stories?.map((story, index) => (
                <div key={story.id} className="p-3 border border-border rounded-lg bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
                    <span className="font-medium text-foreground">{story.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{story.description}</p>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t('Acceptance Criteria')}:
                    </span>
                    <ul className="list-disc list-inside text-sm text-foreground mt-1">
                      {story.acceptanceCriteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  {story.notes && (
                    <div className="mt-2">
                      <span className="text-xs text-muted-foreground">{t('Notes')}:</span>
                      <p className="text-sm text-muted-foreground">{story.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
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
