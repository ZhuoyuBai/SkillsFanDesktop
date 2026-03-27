/**
 * SpaceTerminal - Multi-session Claude Code terminal workspace for a space.
 *
 * Provides a lightweight tab strip with a plus button so users can run
 * multiple Claude Code terminal sessions in parallel inside Terminal Mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { TerminalSessionPane } from './TerminalSessionPane'

interface SpaceTerminalProps {
  spaceId: string
}

interface TerminalWorkspaceSession {
  id: string
  kind: 'local'
  sequence?: number
  defaultTitle: string
  customTitle?: string
}

const TERMINAL_ID_PREFIX = 'space-terminal-'

function buildTerminalId(spaceId: string, sequence: number): string {
  return `${TERMINAL_ID_PREFIX}${spaceId}-${sequence}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function SpaceTerminal({ spaceId }: SpaceTerminalProps) {
  const { t } = useTranslation()
  const sequenceRef = useRef(0)
  const initialSessionsRef = useRef<TerminalWorkspaceSession[] | null>(null)
  const previousSpaceIdRef = useRef(spaceId)
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  if (initialSessionsRef.current === null) {
    sequenceRef.current = 1
    initialSessionsRef.current = [{
      id: buildTerminalId(spaceId, 1),
      kind: 'local',
      sequence: 1,
      defaultTitle: t('Claude Code')
    }]
  }

  const [sessions, setSessions] = useState<TerminalWorkspaceSession[]>(() => initialSessionsRef.current!)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => initialSessionsRef.current![0]?.id ?? null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const createSession = useCallback((): TerminalWorkspaceSession => {
    sequenceRef.current += 1
    const sequence = sequenceRef.current
    return {
      id: buildTerminalId(spaceId, sequence),
      kind: 'local',
      sequence,
      defaultTitle: sequence === 1
        ? t('Claude Code')
        : t('Claude Code {{number}}', { number: sequence })
    }
  }, [spaceId, t])

  // Initialize a fresh terminal workspace when switching spaces.
  useEffect(() => {
    if (previousSpaceIdRef.current === spaceId) {
      return
    }

    previousSpaceIdRef.current = spaceId
    sequenceRef.current = 0
    const initialSession = createSession()
    setSessions([initialSession])
    setActiveSessionId(initialSession.id)
  }, [createSession])

  const handleNewTerminal = useCallback(() => {
    const session = createSession()
    setSessions((prev) => [...prev, session])
    setActiveSessionId(session.id)
  }, [createSession])

  const handleCloseTerminal = useCallback((terminalId: string) => {
    setSessions((prev) => {
      const closingIndex = prev.findIndex((session) => session.id === terminalId)
      const remaining = prev.filter((session) => session.id !== terminalId)

      setActiveSessionId((currentActiveId) => {
        if (remaining.length === 0) {
          return null
        }

        if (currentActiveId && currentActiveId !== terminalId && remaining.some((session) => session.id === currentActiveId)) {
          return currentActiveId
        }

        const nextActive =
          remaining[closingIndex] ||
          remaining[closingIndex - 1] ||
          remaining[0]

        return nextActive?.id ?? null
      })

      return remaining
    })
  }, [])

  const renderSessionTitle = useCallback((session: TerminalWorkspaceSession) => {
    if (session.customTitle?.trim()) {
      return session.customTitle.trim()
    }

    return session.defaultTitle
  }, [])

  const startRenaming = useCallback((session: TerminalWorkspaceSession) => {
    setEditingSessionId(session.id)
    setDraftTitle(renderSessionTitle(session))
  }, [renderSessionTitle])

  const commitRename = useCallback((sessionId: string) => {
    const nextTitle = draftTitle.trim()
    setSessions((prev) => prev.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        customTitle: nextTitle || undefined
      }
    }))
    setEditingSessionId(null)
    setDraftTitle('')
  }, [draftTitle])

  const cancelRename = useCallback(() => {
    setEditingSessionId(null)
    setDraftTitle('')
  }, [])

  useEffect(() => {
    if (!editingSessionId || !renameInputRef.current) return
    renameInputRef.current.focus()
    renameInputRef.current.select()
  }, [editingSessionId])

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60 flex-shrink-0">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId
              const title = renderSessionTitle(session)
              const canRename = true

              return (
                <div
                  key={session.id}
                  className={
                    isActive
                      ? 'group flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 shadow-sm'
                      : 'group flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors'
                  }
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveSessionId(session.id)}
                    onDoubleClick={() => {
                      if (canRename) {
                        startRenaming(session)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setActiveSessionId(session.id)
                      }
                    }}
                    className="flex min-w-0 items-center gap-2 cursor-pointer"
                    title={title}
                  >
                    <TerminalIcon className="w-4 h-4 flex-shrink-0" />
                    {canRename && editingSessionId === session.id ? (
                      <input
                        ref={renameInputRef}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRename(session.id)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelRename()
                          }
                        }}
                        className="w-[180px] rounded border border-border bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none focus:border-primary"
                        aria-label={t('Rename terminal')}
                      />
                    ) : (
                      <span className="max-w-[180px] truncate text-sm font-medium">{title}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCloseTerminal(session.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title={t('Close terminal')}
                    aria-label={t('Close terminal')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <button
          onClick={handleNewTerminal}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-secondary transition-colors flex-shrink-0"
          title={t('New terminal')}
          aria-label={t('New terminal')}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <TerminalSessionPane
              key={session.id}
              terminalId={session.id}
              spaceId={spaceId}
              isActive={session.id === activeSessionId}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
                <TerminalIcon className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{t('No terminals open')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('Create a new Claude Code terminal to start another session.')}
              </p>
              <button
                onClick={handleNewTerminal}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('Open Claude Code')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
