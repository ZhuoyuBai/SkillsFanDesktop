/**
 * SpaceTerminal - Terminal-first workspace with a left history rail.
 *
 * The left sidebar keeps space management and terminal session history visible,
 * while the active Claude Code terminal stays on the right.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Settings, SquarePen, Terminal as TerminalIcon, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { SpaceSwitcher } from '../space/SpaceSwitcher'
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
  createdAt: number
}

const TERMINAL_ID_PREFIX = 'space-terminal-'

function buildTerminalId(spaceId: string, sequence: number): string {
  return `${TERMINAL_ID_PREFIX}${spaceId}-${sequence}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function SpaceTerminal({ spaceId }: SpaceTerminalProps) {
  const { t } = useTranslation()
  const { setView } = useAppStore()
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
      defaultTitle: t('Untitled task'),
      createdAt: Date.now()
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
        ? t('Untitled task')
        : t('Untitled task {{number}}', { number: sequence }),
      createdAt: Date.now()
    }
  }, [spaceId, t])

  useEffect(() => {
    if (previousSpaceIdRef.current === spaceId) {
      return
    }

    previousSpaceIdRef.current = spaceId
    sequenceRef.current = 0
    const initialSession = createSession()
    setSessions([initialSession])
    setActiveSessionId(initialSession.id)
    setEditingSessionId(null)
    setDraftTitle('')
  }, [createSession, spaceId])

  const renderSessionTitle = useCallback((session: TerminalWorkspaceSession) => {
    if (session.customTitle?.trim()) {
      return session.customTitle.trim()
    }

    return session.defaultTitle
  }, [])

  const handleNewTerminal = useCallback(() => {
    const session = createSession()
    setSessions((prev) => [...prev, session])
    setActiveSessionId(session.id)
    setEditingSessionId(null)
    setDraftTitle('')
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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 bg-background">
      <aside className="w-[280px] flex-shrink-0 border-r border-border bg-card/50">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2 shadow-sm">
              <SpaceSwitcher />
            </div>

            <div className="mt-3">
              <button
                onClick={handleNewTerminal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <SquarePen className="w-4 h-4" />
                {t('New task')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <History className="w-3.5 h-3.5" />
            <span>{t('History')}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {sessions.length > 0 ? (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const title = renderSessionTitle(session)

                  return (
                    <div
                      key={session.id}
                      className={
                        isActive
                          ? 'group rounded-xl border border-border bg-background px-3 py-2 shadow-sm'
                          : 'group rounded-xl border border-transparent px-3 py-2 hover:bg-secondary/60 transition-colors'
                      }
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setActiveSessionId(session.id)}
                          onDoubleClick={() => startRenaming(session)}
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          title={title}
                        >
                          <TerminalIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            {editingSessionId === session.id ? (
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
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-primary"
                                aria-label={t('Rename terminal')}
                              />
                            ) : (
                              <>
                                <div className="truncate text-sm font-medium text-foreground">{title}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </>
                            )}
                          </div>
                        </button>

                        <button
                          onClick={() => handleCloseTerminal(session.id)}
                          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                          title={t('Close terminal')}
                          aria-label={t('Close terminal')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                <div className="text-sm font-medium text-foreground">{t('No terminals open')}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('Create a new Claude Code terminal to start another session.')}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <button
              onClick={() => setView('settings')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={t('Settings')}
              aria-label={t('Settings')}
            >
              <Settings className="w-4 h-4" />
              <span>{t('Settings')}</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
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
                <SquarePen className="w-4 h-4" />
                {t('New task')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
