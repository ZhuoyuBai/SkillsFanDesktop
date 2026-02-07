/**
 * Ralph Page - Loop Task Management
 *
 * Main page for creating and managing autonomous AI agent loop tasks.
 * Provides a 3-step flow: Setup → Stories → Progress
 */

import { useTranslation } from 'react-i18next'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/app.store'
import { usePlatform } from '../components/layout/Header'
import { isElectron } from '../api/transport'
import { useRalphStore } from '../stores/ralph.store'
import { RalphSetup } from '../components/ralph/RalphSetup'
import { RalphStoryEditor } from '../components/ralph/RalphStoryEditor'
import { RalphProgress } from '../components/ralph/RalphProgress'

export function RalphPage() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const isInElectron = isElectron()
  const { goBack } = useAppStore()
  const { view, reset, currentTask } = useRalphStore()

  const handleClose = () => {
    // Reset state when leaving
    reset()
    goBack()
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className={`flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${isInElectron ? 'drag-region' : ''} ${isInElectron && platform.isMac ? 'pl-20' : ''}`}>
        <div className="flex items-center gap-3 no-drag">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={t('Back')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <RefreshCw size={18} className="text-primary" />
            <h1 className="text-lg font-semibold">{t('Loop Task')}</h1>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={
              view === 'setup' ? 'text-primary font-medium' : 'text-muted-foreground'
            }
          >
            1. {t('Setup')}
          </span>
          <span className="text-border">→</span>
          <span
            className={
              view === 'stories' ? 'text-primary font-medium' : 'text-muted-foreground'
            }
          >
            2. {t('Stories')}
          </span>
          <span className="text-border">→</span>
          <span
            className={
              view === 'progress' ? 'text-primary font-medium' : 'text-muted-foreground'
            }
          >
            3. {t('Progress')}
          </span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'setup' && <RalphSetup />}
        {view === 'stories' && <RalphStoryEditor />}
        {view === 'progress' && <RalphProgress />}
      </div>
    </div>
  )
}
