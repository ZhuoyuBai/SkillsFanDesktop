/**
 * Space Page - Terminal-first workspace
 *
 * In the terminal-first shell the Space page is a thin wrapper
 * around SpaceTerminal plus optional platform chrome (header bar,
 * Git Bash warning on Windows).
 */

import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { SpaceTerminal } from '../components/terminal/SpaceTerminal'
import { Header, usePlatform } from '../components/layout/Header'
import { GitBashWarningBanner } from '../components/setup/GitBashWarningBanner'
import { useTranslation } from '../i18n'

export function SpacePage() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const { mockBashMode, gitBashInstallProgress, startGitBashInstall } = useAppStore()
  const { currentSpace } = useSpaceStore()

  const shouldShowHeader = !platform.isMac

  if (!currentSpace) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-muted-foreground">{t('No space selected')}</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 w-full flex flex-col bg-card">
      {shouldShowHeader ? (
        <Header className="bg-card backdrop-blur-sm border-b border-border/20" />
      ) : (
        <div className="h-10 flex-shrink-0 drag-region" />
      )}

      {mockBashMode && (
        <GitBashWarningBanner
          installProgress={gitBashInstallProgress}
          onInstall={startGitBashInstall}
        />
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <SpaceTerminal key={currentSpace.id} spaceId={currentSpace.id} />
      </div>
    </div>
  )
}
