/**
 * TerminalSessionPane - A single PTY-backed Claude Code terminal session.
 *
 * This component stays mounted while hidden so background PTY output continues
 * to stream and the terminal state is preserved when switching tabs.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Plus } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { ModelSelector } from '../layout/ModelSelector'
import { TerminalStatusOverlay } from './TerminalStatusOverlay'
import { TerminalSetupGuide } from './TerminalSetupGuide'
import { describeTerminalLaunchError } from './terminal-error'
import { hasAnyAISource } from '../../types'

interface TerminalSessionPaneProps {
  terminalId: string
  spaceId: string
  isActive: boolean
}

/**
 * Map SkillsFan CSS variables to xterm.js theme.
 */
function getXtermTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const hsl = (varName: string) => {
    const value = style.getPropertyValue(varName).trim()
    if (!value) return undefined
    return `hsl(${value})`
  }

  return {
    background: hsl('--background') || '#141413',
    foreground: hsl('--foreground') || '#faf9f5',
    cursor: hsl('--foreground') || '#faf9f5',
    cursorAccent: hsl('--background') || '#141413',
    selectionBackground: hsl('--primary') || '#e6e6e6',
    selectionForeground: hsl('--primary-foreground') || '#141413',
  }
}

export function TerminalSessionPane({
  terminalId,
  spaceId,
  isActive
}: TerminalSessionPaneProps) {
  const { t } = useTranslation()
  const { openSettingsWithSection, config, setConfig } = useAppStore()

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isExited, setIsExited] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [hasOutput, setHasOutput] = useState(false)
  const [model, setModel] = useState<string>('')
  const [pendingModelChange, setPendingModelChange] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const ptyCreatedRef = useRef(false)

  // Initialize xterm.js and connect to PTY
  useEffect(() => {
    if (!terminalRef.current || ptyCreatedRef.current) return
    ptyCreatedRef.current = true

    // If no AI source is configured AND not using Claude native login, show setup guide
    const showSetup = !config || (!hasAnyAISource(config) && config.terminal?.skipClaudeLogin !== false)
    if (showSetup) {
      setNeedsSetup(true)
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getXtermTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(terminalRef.current)

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        if (!showSetup) term.focus()
      } catch {
        // Ignore initial fit errors until the pane is visible
      }
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Forward user input to PTY
    term.onData((data) => {
      api.ptyWrite(terminalId, data)
    })

    // Listen for PTY output
    const unsubData = api.onPtyData(({ id, data }: { id: string; data: string }) => {
      if (id === terminalId) {
        if (data.length > 0) {
          setHasOutput(true)
        }
        term.write(data)
      }
    })

    // Listen for PTY exit
    const unsubExit = api.onPtyExit(({ id, exitCode }: { id: string; exitCode: number }) => {
      if (id === terminalId) {
        setIsExited(true)
        setHasOutput(false)
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
      }
    })

    // Skip PTY creation if setup is needed - user will trigger it via the guide
    if (showSetup) {
      return () => {
        unsubData()
        unsubExit()
        term.dispose()
      }
    }

    // Create PTY
    api.ptyCreate({
      id: terminalId,
      spaceId,
      cols: term.cols,
      rows: term.rows,
    }).then((result) => {
      if (result.success && result.data) {
        setStartupError(null)
        setModel((result.data as any).model || '')
      } else if (!result.success) {
        const issue = describeTerminalLaunchError(result.error, t)
        term.writeln(`\x1b[31m${issue.title}\x1b[0m`)
        term.writeln(`\x1b[90m${issue.message}\x1b[0m`)
        setStartupError(result.error || t('Unknown error'))
        setIsExited(true)
      }
    })

    return () => {
      unsubData()
      unsubExit()
      term.dispose()
      api.ptyDestroy(terminalId).catch(() => {})
    }
  }, [terminalId, spaceId, t])

  // Handle container resize
  useEffect(() => {
    if (!terminalRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (!isActive) return

      const fitAddon = fitAddonRef.current
      const term = xtermRef.current
      if (fitAddon && term) {
        try {
          fitAddon.fit()
          api.ptyResize(terminalId, term.cols, term.rows)
        } catch {
          // Ignore resize errors
        }
      }
    })

    resizeObserver.observe(terminalRef.current)
    return () => resizeObserver.disconnect()
  }, [isActive, terminalId])

  // Re-fit when this pane becomes visible
  useEffect(() => {
    if (!isActive) return

    const fitAddon = fitAddonRef.current
    const term = xtermRef.current
    if (!fitAddon || !term) return

    const frame = requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        api.ptyResize(terminalId, term.cols, term.rows)
        term.focus()
      } catch {
        // Ignore fit errors if visibility changes during teardown
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [isActive, terminalId])

  // Update theme when dark/light mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = getXtermTheme()
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })

    return () => observer.disconnect()
  }, [])

  const handleRestart = useCallback(async () => {
    setIsExited(false)
    setStartupError(null)
    setHasOutput(false)
    await api.ptyDestroy(terminalId)

    const term = xtermRef.current
    if (term) {
      term.clear()
      term.reset()
    }

    const result = await api.ptyCreate({
      id: terminalId,
      spaceId,
      cols: term?.cols || 80,
      rows: term?.rows || 24,
    })

    if (result.success && result.data) {
      setStartupError(null)
      setModel((result.data as any).model || '')
    } else if (!result.success) {
      const issue = describeTerminalLaunchError(result.error, t)
      term?.writeln(`\x1b[31m${issue.title}\x1b[0m`)
      term?.writeln(`\x1b[90m${issue.message}\x1b[0m`)
      setStartupError(result.error || t('Unknown error'))
      setIsExited(true)
    }
  }, [terminalId, spaceId, t])

  const handleModelChange = useCallback(() => {
    setPendingModelChange(true)
  }, [])

  const handleNewConversation = useCallback(() => {
    if (isExited || startupError) return

    xtermRef.current?.focus()
    void api.ptyWrite(terminalId, '/new\r')
  }, [isExited, startupError, terminalId])

  const handleSettings = useCallback(() => {
    openSettingsWithSection('system')
  }, [openSettingsWithSection])

  const handleChooseClaudeLogin = useCallback(async () => {
    try {
      const result = await api.setConfig({ terminal: { skipClaudeLogin: false } })
      if (result.success && result.data) {
        setConfig(result.data as any)
      }
      setNeedsSetup(false)
      handleRestart()
    } catch (error) {
      console.error('[TerminalSessionPane] Failed to set Claude login mode:', error)
    }
  }, [setConfig, handleRestart])

  const handleChooseApiSetup = useCallback(() => {
    openSettingsWithSection('ai-model')
  }, [openSettingsWithSection])

  return (
    <div className={isActive ? 'absolute inset-0 flex min-h-0 flex-col bg-background' : 'hidden'}>
      {/* Toolbar - hidden when setup guide is shown */}
      <div className={`flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 flex-shrink-0 ${needsSetup ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <ModelSelector
            variant="compact"
            disabled={!hasOutput && !isExited && !startupError}
            onModelChange={handleModelChange}
          />
          {pendingModelChange && (
            <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
              {t('Effective after new chat')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            title={t('Start a new Claude Code conversation')}
            aria-label={t('Start a new Claude Code conversation')}
            disabled={isExited || !!startupError}
            className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('New chat')}</span>
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={terminalRef}
          className="w-full h-full cursor-text"
          onMouseDown={() => xtermRef.current?.focus()}
          onClick={() => xtermRef.current?.focus()}
        />

        {needsSetup ? (
          <TerminalSetupGuide
            onChooseClaudeLogin={handleChooseClaudeLogin}
            onChooseApiSetup={handleChooseApiSetup}
          />
        ) : (
          <>
            {!hasOutput && !isExited && !startupError && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                <div className="rounded-full border border-border/70 bg-card/85 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                  {t('Loading...')}
                </div>
              </div>
            )}

            <TerminalStatusOverlay
              isExited={isExited}
              startupError={startupError}
              onRestart={handleRestart}
              onOpenSettings={handleSettings}
            />
          </>
        )}
      </div>

    </div>
  )
}
