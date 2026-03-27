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
import { Plus, Settings } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { TerminalStatusOverlay } from './TerminalStatusOverlay'
import { TerminalSettingsDialog } from './TerminalSettingsDialog'
import { describeTerminalLaunchError } from './terminal-error'

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
    background: hsl('--background') || '#1e1e1e',
    foreground: hsl('--foreground') || '#d4d4d4',
    cursor: hsl('--foreground') || '#d4d4d4',
    cursorAccent: hsl('--background') || '#1e1e1e',
    selectionBackground: hsl('--primary') || '#264f78',
    selectionForeground: hsl('--primary-foreground') || '#ffffff',
  }
}

export function TerminalSessionPane({
  terminalId,
  spaceId,
  isActive
}: TerminalSessionPaneProps) {
  const { t } = useTranslation()

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isExited, setIsExited] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [model, setModel] = useState<string>('')
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const ptyCreatedRef = useRef(false)

  // Initialize xterm.js and connect to PTY
  useEffect(() => {
    if (!terminalRef.current || ptyCreatedRef.current) return
    ptyCreatedRef.current = true

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
        term.write(data)
      }
    })

    // Listen for PTY exit
    const unsubExit = api.onPtyExit(({ id, exitCode }: { id: string; exitCode: number }) => {
      if (id === terminalId) {
        setIsExited(true)
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
      }
    })

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
  }, [terminalId, spaceId])

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

  const handleNewConversation = useCallback(() => {
    if (isExited || startupError) {
      return
    }

    xtermRef.current?.focus()
    void api.ptyWrite(terminalId, '/new\r')
  }, [isExited, startupError, terminalId])

  const handleSettings = useCallback(() => {
    setShowSettingsDialog(true)
  }, [])

  return (
    <div className={isActive ? 'absolute inset-0 flex min-h-0 flex-col bg-background' : 'hidden'}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          {model ? <span className="truncate">{model}</span> : <span>{t('Claude Code')}</span>}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            title={t('Start a new Claude Code conversation')}
            aria-label={t('Start a new Claude Code conversation')}
            disabled={isExited || !!startupError}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('New chat')}</span>
          </button>
          <button
            onClick={handleSettings}
            title={t('Settings')}
            aria-label={t('Settings')}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={terminalRef} className="w-full h-full" />

        <TerminalStatusOverlay
          isExited={isExited}
          startupError={startupError}
          onRestart={handleRestart}
          onOpenSettings={handleSettings}
        />
      </div>

      <TerminalSettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        onReapplyCurrentTerminal={handleRestart}
      />
    </div>
  )
}
