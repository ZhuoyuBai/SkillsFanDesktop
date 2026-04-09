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
import {
  SHIFT_ENTER_NEWLINE_PASTE_TEXT,
  shouldHandleShiftEnterNewline,
} from './input-shortcuts'
import {
  formatTerminalImagePaths,
  maskTerminalImagePaths,
  maskTerminalImagePathsLightweight,
  relabelTerminalImages,
  rewritePromptOnlySubmittedInputEcho,
  rewriteSubmittedTerminalInputEcho,
  stripTerminalImageTokens,
  suppressStandaloneSubmittedImageEcho,
  type TerminalDraftImage,
} from './terminal-image-draft'
import { canLaunchTerminal } from '../../types'
import { DesktopPet } from '../pet/DesktopPet'

interface TerminalSessionPaneProps {
  terminalId: string
  spaceId: string
  isActive: boolean
}

interface PendingTerminalSubmitMask {
  expiresAt: number
  images: TerminalDraftImage[]
  visibleInput: string
  cleanedInput: string
}

const TERMINAL_IMAGE_SUBMIT_MASK_MS = 4000
const TERMINAL_OUTPUT_MASK_FLUSH_MS = 24

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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image.'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(blob)
  })
}

function getClipboardImageFiles(clipboardData: DataTransfer | null): File[] {
  return Array.from(clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)
}

function getTerminalInputPrefix(term: XTerm): string {
  const cursorY = term.buffer.active.cursorY
  const cursorX = term.buffer.active.cursorX
  const line = term.buffer.active.getLine(cursorY)
  if (!line || cursorX <= 0) {
    return ''
  }

  const previousText = line.translateToString(false, 0, cursorX)
  return /\s$/.test(previousText) ? '' : ' '
}

function getTerminalInputText(term: XTerm): string {
  const line = term.buffer.active.getLine(term.buffer.active.cursorY)
  if (!line) {
    return ''
  }

  const fullLine = line.translateToString(true)
  return fullLine.replace(/^\s*[›>]\s?/u, '')
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
  const [isPtyReady, setIsPtyReady] = useState(false)
  const [, setPendingImages] = useState<TerminalDraftImage[]>([])
  const pendingImagesRef = useRef<TerminalDraftImage[]>([])
  const ptyCreatedRef = useRef(false)
  const suppressNextImagePasteRef = useRef(false)
  const pendingSubmitMaskRef = useRef<PendingTerminalSubmitMask | null>(null)
  const pendingOutputMaskBufferRef = useRef('')
  const pendingOutputMaskFlushTimerRef = useRef<number | null>(null)
  const sessionImagesRef = useRef<TerminalDraftImage[]>([])
  const showModelControls = config?.terminal?.skipClaudeLogin !== false

  const clearPendingImages = useCallback(() => {
    pendingImagesRef.current = []
    setPendingImages([])
  }, [])

  const clearPendingOutputMaskBuffer = useCallback(() => {
    pendingOutputMaskBufferRef.current = ''
    if (pendingOutputMaskFlushTimerRef.current !== null) {
      window.clearTimeout(pendingOutputMaskFlushTimerRef.current)
      pendingOutputMaskFlushTimerRef.current = null
    }
  }, [])

  const appendPendingImages = useCallback((images: Array<{
    filePath: string
    name: string
    size: number
    mediaType: string
  }>): TerminalDraftImage[] => {
    if (images.length === 0) {
      return []
    }

    const previousImages = pendingImagesRef.current
    const rawNewImages = images.map((image) => ({
      id: crypto.randomUUID(),
      filePath: image.filePath,
      name: image.name,
      size: image.size,
      mediaType: image.mediaType,
    }))
    const nextImages = relabelTerminalImages([
      ...previousImages,
      ...rawNewImages,
    ])
    pendingImagesRef.current = nextImages
    setPendingImages(nextImages)
    return nextImages.slice(previousImages.length)
  }, [])

  const savePastedFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    try {
      const savedImages = []
      for (const file of files) {
        const dataUrl = await readBlobAsDataUrl(file)
        const result = await api.saveTerminalImage({
          terminalId,
          base64Data: dataUrl,
          mediaType: file.type || 'image/png',
          name: file.name || undefined,
        })
        if (result.success && result.data) {
          savedImages.push(result.data)
        }
      }
      const addedImages = appendPendingImages(savedImages)
      const term = xtermRef.current
      if (term && addedImages.length > 0) {
        term.focus()
        const prefix = getTerminalInputPrefix(term)
        term.paste(`${prefix}${addedImages.map((image) => image.token).join(' ')}`)
      }
    } catch (error) {
      console.error('[TerminalSessionPane] Failed to save pasted image:', error)
    }
  }, [appendPendingImages, terminalId])

  const handleClipboardShortcutPaste = useCallback(async () => {
    try {
      const result = await api.readTerminalClipboard(terminalId)
      if (!result.success || !result.data) {
        return
      }

      if (result.data.kind === 'image') {
        const addedImages = appendPendingImages([result.data.image])
        const term = xtermRef.current
        if (term && addedImages.length > 0) {
          term.focus()
          const prefix = getTerminalInputPrefix(term)
          term.paste(`${prefix}${addedImages.map((image) => image.token).join(' ')}`)
        }
        return
      }

      if (result.data.kind === 'text' && result.data.text) {
        xtermRef.current?.focus()
        xtermRef.current?.paste(result.data.text)
      }
    } catch (error) {
      console.error('[TerminalSessionPane] Failed to read terminal clipboard:', error)
    }
  }, [appendPendingImages, terminalId])

  const submitPendingImages = useCallback(async () => {
    const term = xtermRef.current
    const images = pendingImagesRef.current
    if (!term || images.length === 0 || !isPtyReady || isExited || startupError) {
      return
    }

    const imagePaths = formatTerminalImagePaths(images)
    if (!imagePaths) {
      return
    }

    const currentInput = getTerminalInputText(term)
    const visibleInput = currentInput.replace(/[ \t]{2,}/g, ' ').trim()
    const cleanedInput = stripTerminalImageTokens(currentInput)
    const finalInput = cleanedInput ? `${cleanedInput} ${imagePaths}` : imagePaths

    const imagesCopy = images.map((image) => ({ ...image }))
    sessionImagesRef.current = [...sessionImagesRef.current, ...imagesCopy]

    pendingSubmitMaskRef.current = {
      expiresAt: Date.now() + TERMINAL_IMAGE_SUBMIT_MASK_MS,
      images: imagesCopy,
      visibleInput,
      cleanedInput,
    }

    term.focus()
    await api.ptyWrite(terminalId, '\u0015')
    await api.ptyWrite(terminalId, finalInput)
    await api.ptyWrite(terminalId, '\r')
    clearPendingImages()
  }, [clearPendingImages, isExited, isPtyReady, startupError, terminalId])

  const flushPendingOutputMaskBuffer = useCallback(() => {
    const term = xtermRef.current
    if (!term) {
      clearPendingOutputMaskBuffer()
      return
    }

    const bufferedData = pendingOutputMaskBufferRef.current
    if (!bufferedData) {
      clearPendingOutputMaskBuffer()
      return
    }

    clearPendingOutputMaskBuffer()

    let nextData = bufferedData
    const pendingSubmitMask = pendingSubmitMaskRef.current

    if (pendingSubmitMask) {
      nextData = maskTerminalImagePaths(nextData, pendingSubmitMask.images)
    }

    if (pendingSubmitMask) {
      const rewrite = rewriteSubmittedTerminalInputEcho(
        nextData,
        pendingSubmitMask.visibleInput,
        pendingSubmitMask.cleanedInput,
        pendingSubmitMask.images,
      )
      nextData = rewrite.text

      if (!rewrite.rewritten) {
        const promptRewrite = rewritePromptOnlySubmittedInputEcho(
          nextData,
          pendingSubmitMask.visibleInput,
          pendingSubmitMask.cleanedInput,
        )
        nextData = promptRewrite.text

        const suppression = suppressStandaloneSubmittedImageEcho(nextData, pendingSubmitMask.images)
        nextData = suppression.text
      }

      if (Date.now() >= pendingSubmitMask.expiresAt) {
        pendingSubmitMaskRef.current = null
      }
    }

    // Persistent session-level masking as final pass
    const sessionImages = sessionImagesRef.current
    if (sessionImages.length > 0) {
      nextData = maskTerminalImagePathsLightweight(nextData, sessionImages)
    }

    if (nextData.length > 0) {
      term.write(nextData)
    }
  }, [clearPendingOutputMaskBuffer])

  const schedulePendingOutputMaskFlush = useCallback(() => {
    if (pendingOutputMaskFlushTimerRef.current !== null) {
      window.clearTimeout(pendingOutputMaskFlushTimerRef.current)
    }

    pendingOutputMaskFlushTimerRef.current = window.setTimeout(() => {
      flushPendingOutputMaskBuffer()
    }, TERMINAL_OUTPUT_MASK_FLUSH_MS)
  }, [flushPendingOutputMaskBuffer])

  // Initialize xterm.js and connect to PTY
  useEffect(() => {
    if (!terminalRef.current || ptyCreatedRef.current) return
    ptyCreatedRef.current = true

    // If no AI source is configured AND not using Claude native login, show setup guide
    const showSetup = !config || !canLaunchTerminal(config)
    if (showSetup) {
      setNeedsSetup(true)
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.12,
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

    const terminalPasteListener = (event: ClipboardEvent) => {
      const imageFiles = getClipboardImageFiles(event.clipboardData)
      if (imageFiles.length === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      if (suppressNextImagePasteRef.current) {
        suppressNextImagePasteRef.current = false
        return
      }
      void savePastedFiles(imageFiles)
    }
    const terminalKeydownListener = (event: KeyboardEvent) => {
      const isCtrlPasteShortcut = window.platform.isMac
        && event.key.toLowerCase() === 'v'
        && event.ctrlKey
        && !event.metaKey
        && !event.altKey

      if (!isCtrlPasteShortcut) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      suppressNextImagePasteRef.current = true
      window.setTimeout(() => {
        suppressNextImagePasteRef.current = false
      }, 100)
      void handleClipboardShortcutPaste()
    }

    term.textarea?.addEventListener('paste', terminalPasteListener, true)
    term.element?.addEventListener('paste', terminalPasteListener, true)
    term.textarea?.addEventListener('keydown', terminalKeydownListener, true)

    // Listen for PTY output
    const unsubData = api.onPtyData(({ id, data }: { id: string; data: string }) => {
      if (id === terminalId) {
        if (data.length > 0) {
          setHasOutput(true)
        }

        const hasActivePathMasking = pendingSubmitMaskRef.current !== null
        if (!hasActivePathMasking && pendingOutputMaskBufferRef.current.length === 0) {
          const sessionImages = sessionImagesRef.current
          if (sessionImages.length > 0) {
            term.write(maskTerminalImagePathsLightweight(data, sessionImages))
          } else {
            term.write(data)
          }
          return
        }

        // PTY often splits prompt echoes and image paths across adjacent chunks.
        // Buffer briefly so path masking can see the full emitted line.
        pendingOutputMaskBufferRef.current += data

        if (pendingOutputMaskBufferRef.current.length >= 4096) {
          flushPendingOutputMaskBuffer()
        } else {
          schedulePendingOutputMaskFlush()
        }
      }
    })

    // Listen for PTY exit
    const unsubExit = api.onPtyExit(({ id, exitCode }: { id: string; exitCode: number }) => {
      if (id === terminalId) {
        flushPendingOutputMaskBuffer()
        setIsExited(true)
        setIsPtyReady(false)
        setHasOutput(false)
        clearPendingImages()
        pendingSubmitMaskRef.current = null
        sessionImagesRef.current = []
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
      }
    })

    // Skip PTY creation if setup is needed - user will trigger it via the guide
    if (showSetup) {
      return () => {
        unsubData()
        unsubExit()
        clearPendingOutputMaskBuffer()
        term.textarea?.removeEventListener('paste', terminalPasteListener, true)
        term.element?.removeEventListener('paste', terminalPasteListener, true)
        term.textarea?.removeEventListener('keydown', terminalKeydownListener, true)
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
        setIsPtyReady(true)
        setModel((result.data as any).model || '')
      } else if (!result.success) {
        const issue = describeTerminalLaunchError(result.error, t)
        term.writeln(`\x1b[31m${issue.title}\x1b[0m`)
        term.writeln(`\x1b[90m${issue.message}\x1b[0m`)
        setStartupError(result.error || t('Unknown error'))
        setIsPtyReady(false)
        setIsExited(true)
      }
    })

    return () => {
      unsubData()
      unsubExit()
      clearPendingOutputMaskBuffer()
      term.textarea?.removeEventListener('paste', terminalPasteListener, true)
      term.element?.removeEventListener('paste', terminalPasteListener, true)
      term.textarea?.removeEventListener('keydown', terminalKeydownListener, true)
      term.dispose()
      api.ptyDestroy(terminalId).catch(() => {})
    }
  }, [
    clearPendingImages,
    clearPendingOutputMaskBuffer,
    config,
    flushPendingOutputMaskBuffer,
    handleClipboardShortcutPaste,
    savePastedFiles,
    schedulePendingOutputMaskFlush,
    terminalId,
    spaceId,
    t,
  ])

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

  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (
        pendingImagesRef.current.length > 0
        && event.type === 'keydown'
        && event.key === 'Enter'
        && !event.shiftKey
        && !event.altKey
        && !event.ctrlKey
        && !event.metaKey
      ) {
        if (isPtyReady && !isExited && !startupError) {
          void submitPendingImages()
          return false
        }
      }

      if (!config?.terminal?.shiftEnterNewline) {
        return true
      }

      if (shouldHandleShiftEnterNewline(event)) {
        term.paste(SHIFT_ENTER_NEWLINE_PASTE_TEXT)
        return false
      }

      return true
    })
  }, [config?.terminal?.shiftEnterNewline, isExited, isPtyReady, startupError, submitPendingImages])

  const handleRestart = useCallback(async () => {
    setIsExited(false)
    setStartupError(null)
    setHasOutput(false)
    setIsPtyReady(false)
    clearPendingImages()
    clearPendingOutputMaskBuffer()
    pendingSubmitMaskRef.current = null
    sessionImagesRef.current = []
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
      setIsPtyReady(true)
      setModel((result.data as any).model || '')
    } else if (!result.success) {
      const issue = describeTerminalLaunchError(result.error, t)
      term?.writeln(`\x1b[31m${issue.title}\x1b[0m`)
      term?.writeln(`\x1b[90m${issue.message}\x1b[0m`)
      setStartupError(result.error || t('Unknown error'))
      setIsPtyReady(false)
      setIsExited(true)
    }
  }, [clearPendingImages, clearPendingOutputMaskBuffer, terminalId, spaceId, t])

  const handleModelChange = useCallback(() => {
    setPendingModelChange(true)
  }, [])

  const handleNewConversation = useCallback(() => {
    if (isExited || startupError) return

    clearPendingImages()
    clearPendingOutputMaskBuffer()
    pendingSubmitMaskRef.current = null
    sessionImagesRef.current = []
    xtermRef.current?.focus()
    void api.ptyWrite(terminalId, '/new\r')
  }, [clearPendingImages, clearPendingOutputMaskBuffer, isExited, startupError, terminalId])

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
          {showModelControls && (
            <ModelSelector
              variant="compact"
              disabled={!hasOutput && !isExited && !startupError}
              onModelChange={handleModelChange}
            />
          )}
          {showModelControls && pendingModelChange && (
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

        {!needsSetup && isActive && config?.desktopPet?.enabled && (
          <DesktopPet isActive={isActive} />
        )}
      </div>

    </div>
  )
}
