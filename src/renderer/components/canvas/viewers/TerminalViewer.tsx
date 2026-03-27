/**
 * TerminalViewer - Embedded Claude Code CLI terminal
 *
 * Uses xterm.js to render a full Claude Code TUI experience
 * in a Canvas tab. Connected to a PTY in the main process
 * that runs the actual Claude Code CLI binary.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Terminal as TerminalIcon, RotateCw, Settings } from 'lucide-react'
import { api } from '../../../api'
import { useTranslation } from '../../../i18n'
import { useAppStore } from '../../../stores/app.store'
import type { TabState } from '../../../services/canvas-lifecycle'
import { TerminalStatusOverlay } from '../../terminal/TerminalStatusOverlay'
import { describeTerminalLaunchError } from '../../terminal/terminal-error'

interface TerminalViewerProps {
  tab: TabState
}

/**
 * Map SkillsFan CSS variables to xterm.js theme.
 * Reads computed styles from the document root.
 */
function getXtermTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const getVar = (name: string) => style.getPropertyValue(name).trim()

  // Convert HSL CSS variable values to usable colors
  const hsl = (varName: string) => {
    const value = getVar(varName)
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

export function TerminalViewer({ tab }: TerminalViewerProps) {
  const { t } = useTranslation()
  const { setView } = useAppStore()

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isExited, setIsExited] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [model, setModel] = useState<string>('')
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

    // Fit after a short delay to ensure container is sized
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Forward user input to PTY
    term.onData((data) => {
      api.ptyWrite(tab.id, data)
    })

    // Listen for PTY output
    const unsubData = api.onPtyData(({ id, data }: { id: string; data: string }) => {
      if (id === tab.id) {
        term.write(data)
      }
    })

    // Listen for PTY exit
    const unsubExit = api.onPtyExit(({ id, exitCode: code }: { id: string; exitCode: number }) => {
      if (id === tab.id) {
        setIsExited(true)
        term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`)
      }
    })

    // Create PTY in main process
    // Extract spaceId from tab metadata (stored during openTerminal)
    const spaceId = (tab as any).spaceId || ''
    api.ptyCreate({
      id: tab.id,
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
    }
  }, [tab.id])

  // Handle container resize
  useEffect(() => {
    if (!terminalRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      const fitAddon = fitAddonRef.current
      const term = xtermRef.current
      if (fitAddon && term) {
        try {
          fitAddon.fit()
          api.ptyResize(tab.id, term.cols, term.rows)
        } catch {
          // Ignore resize errors (e.g., terminal disposed)
        }
      }
    })

    resizeObserver.observe(terminalRef.current)
    return () => resizeObserver.disconnect()
  }, [tab.id])

  // Update theme when it changes
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

    // Destroy old PTY
    await api.ptyDestroy(tab.id)

    // Clear terminal
    const term = xtermRef.current
    if (term) {
      term.clear()
      term.reset()
    }

    // Create new PTY
    const spaceId = (tab as any).spaceId || ''
    const result = await api.ptyCreate({
      id: tab.id,
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
  }, [tab.id, t])

  const handleSettings = useCallback(() => {
    setView('settings')
  }, [setView])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TerminalIcon className="w-3.5 h-3.5" />
          <span className="font-medium">Claude Code</span>
          {model && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{model}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleRestart}
            title={t('Restart terminal')}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSettings}
            title={t('Settings')}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
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
    </div>
  )
}
