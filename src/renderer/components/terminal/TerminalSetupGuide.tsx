/**
 * TerminalSetupGuide - Guides users to choose an AI source when none is configured.
 * Shown in the terminal area instead of an error when the user skipped initial setup.
 */

import { Terminal, Key } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface TerminalSetupGuideProps {
  onChooseClaudeLogin: () => void
  onChooseApiSetup: () => void
}

export function TerminalSetupGuide({
  onChooseClaudeLogin,
  onChooseApiSetup
}: TerminalSetupGuideProps) {
  const { t } = useTranslation()

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6 -mt-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-foreground">
            {t('Choose how to get started')}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            {t('Set up your AI model to start using the terminal')}
          </p>
        </div>

        {/* Two option cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Option A: Claude Code official login */}
          <button
            onClick={onChooseClaudeLogin}
            className="flex flex-col items-center gap-5 p-8 rounded-2xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Terminal className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {t('Use Claude Code Login')}
              </p>
              <p className="mt-2 text-base text-muted-foreground">
                {t('Sign in with your Claude account. Claude Code will handle authentication in the terminal.')}
              </p>
            </div>
          </button>

          {/* Option B: Configure domestic model API */}
          <button
            onClick={onChooseApiSetup}
            className="flex flex-col items-center gap-5 p-8 rounded-2xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Key className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {t('Configure Model API')}
              </p>
              <p className="mt-2 text-base text-muted-foreground">
                {t('Set up an API key for models like Zhipu GLM, DeepSeek, Kimi, etc.')}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
