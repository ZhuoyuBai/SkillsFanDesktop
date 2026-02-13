/**
 * Input Area - Enhanced message input with bottom toolbar
 *
 * Layout (following industry standard - Qwen, ChatGPT, Baidu):
 * ┌──────────────────────────────────────────────────────┐
 * │ [Image previews]                                     │
 * │ ┌──────────────────────────────────────────────────┐ │
 * │ │ Textarea                                         │ │
 * │ └──────────────────────────────────────────────────┘ │
 * │ [+] [⚛]─────────────────────────────────  [Send] │
 * │      Bottom toolbar: always visible, expandable     │
 * └──────────────────────────────────────────────────────┘
 *
 * Features:
 * - Auto-resize textarea
 * - Keyboard shortcuts (Enter to send, Shift+Enter newline)
 * - Image paste/drop support with compression
 * - Extended thinking mode toggle (theme-colored)
 * - Bottom toolbar for future extensibility
 */

import { useState, useRef, useEffect, useMemo, useCallback, KeyboardEvent, ClipboardEvent, DragEvent } from 'react'
import { Paperclip, Loader2, AlertCircle, Globe, Package, Image, File } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useSpaceStore } from '../../stores/space.store'
import { useOnboardingStore } from '../../stores/onboarding.store'
import { useAIBrowserStore } from '../../stores/ai-browser.store'
import { getOnboardingPrompt } from '../onboarding/onboardingData'
import { AttachmentPreview } from './AttachmentPreview'
import { FilePopover } from './FilePopover'
import { CommandPopover } from './CommandPopover'
import type { SlashCommand } from './CommandPopover'
import { ModelSelector } from '../layout/ModelSelector'
import { CreditsDisplay } from '../layout/CreditsDisplay'
import { SpaceSelector } from '../layout/SpaceSelector'
import { processFile, isSupportedFile, checkFileSize, getAcceptedExtensions } from '../../utils/fileProcessor'
import { api } from '../../api'
import type { Attachment } from '../../types'
import { useTranslation } from '../../i18n'

interface InputAreaProps {
  onSend: (content: string, attachments?: Attachment[], thinkingEnabled?: boolean) => void
  onStop: () => void
  onInject?: (content: string, attachments?: Attachment[]) => void  // Inject message during generation
  isGenerating: boolean
  isCompact?: boolean
  noBorder?: boolean  // Hide top border (used in empty state centered layout)
  suggestedContent?: string  // External suggested content to fill in
  showTypewriterAnimation?: boolean  // Show typewriter placeholder animation (default: true, set to false when in conversation)
}

// Mobile breakpoint (matches Tailwind sm: 640px)
const MOBILE_BREAKPOINT = 640

// Hook to detect mobile viewport (responsive to window resize)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

// Typewriter animation phrase keys - matches QUICK_PROMPTS in ChatView
// These are i18n keys that get resolved at render time via getTypewriterPhrases()
// i18next-parser hint:
// t('Create a "daily-plan.txt" file on desktop...')
// t('Create a "sales.csv" sample file on desktop...')
// t('Create an "ideas.md" file on desktop...')
// t('Create a "project-notes" folder on desktop...')
// t('Create a "product-copy.md" file on desktop...')
const TYPEWRITER_PHRASE_KEYS = [
  'Create a "daily-plan.txt" file on desktop...',
  'Create a "sales.csv" sample file on desktop...',
  'Create an "ideas.md" file on desktop...',
  'Create a "project-notes" folder on desktop...',
  'Create a "product-copy.md" file on desktop...',
]

// Hook for typewriter animation effect
function useTypewriter(phrases: string[], options?: {
  typeSpeed?: number      // Speed of typing each character (ms)
  deleteSpeed?: number    // Speed of deleting each character (ms)
  pauseAfterType?: number // Pause after typing complete (ms)
  pauseAfterDelete?: number // Pause after deleting complete (ms)
}) {
  const {
    typeSpeed = 80,
    deleteSpeed = 40,
    pauseAfterType = 2000,
    pauseAfterDelete = 500,
  } = options || {}

  const [displayText, setDisplayText] = useState('')
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (phrases.length === 0) return

    const currentPhrase = phrases[phraseIndex]

    if (isPaused) {
      const pauseDuration = isDeleting ? pauseAfterDelete : pauseAfterType
      const timer = setTimeout(() => {
        setIsPaused(false)
        if (!isDeleting) {
          setIsDeleting(true)
        } else {
          setPhraseIndex((prev) => (prev + 1) % phrases.length)
          setIsDeleting(false)
        }
      }, pauseDuration)
      return () => clearTimeout(timer)
    }

    if (!isDeleting) {
      // Typing
      if (displayText.length < currentPhrase.length) {
        const timer = setTimeout(() => {
          setDisplayText(currentPhrase.slice(0, displayText.length + 1))
        }, typeSpeed)
        return () => clearTimeout(timer)
      } else {
        // Finished typing, pause before deleting
        setIsPaused(true)
      }
    } else {
      // Deleting
      if (displayText.length > 0) {
        const timer = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1))
        }, deleteSpeed)
        return () => clearTimeout(timer)
      } else {
        // Finished deleting, pause before next phrase
        setIsPaused(true)
      }
    }
  }, [displayText, phraseIndex, isDeleting, isPaused, phrases, typeSpeed, deleteSpeed, pauseAfterType, pauseAfterDelete])

  return displayText
}

// Attachment constraints
const MAX_ATTACHMENTS = 10  // Max attachments per message

// Model patterns that do not support image/vision input (matched case-insensitively via includes)
const NO_VISION_PATTERNS = ['glm-5', 'glm-4', 'minimax-m2.1', 'minimax-m2.5']

function isNoVisionModel(modelId: string): boolean {
  if (!modelId) return false
  const lower = modelId.toLowerCase()
  return NO_VISION_PATTERNS.some(p => lower.includes(p))
}

// Error message type
interface AttachmentError {
  id: string
  message: string
}

export function InputArea({ onSend, onStop, onInject, isGenerating, isCompact = false, noBorder = false, suggestedContent, showTypewriterAnimation = true }: InputAreaProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [fileError, setFileError] = useState<AttachmentError | null>(null)
  const [infoToast, setInfoToast] = useState<string | null>(null)  // Info toast message
  const [thinkingEnabled, setThinkingEnabled] = useState(false)  // Extended thinking mode
  const [showAttachMenu, setShowAttachMenu] = useState(false)  // Attachment menu visibility
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)

  // AI Browser state
  const { enabled: aiBrowserEnabled, setEnabled: setAIBrowserEnabled } = useAIBrowserStore()

  // Settings navigation
  const { config, openSettingsWithSection } = useAppStore()

  // Current model ID for vision support check
  const currentModelId = (() => {
    const aiSources = config?.aiSources
    if (!aiSources?.current) return ''
    const providerConfig = (aiSources as any)[aiSources.current]
    return (providerConfig?.model as string) || ''
  })()

  // Current space for @ file reference
  const { currentSpace } = useSpaceStore()

  // === @ File reference state ===
  const [filePopoverVisible, setFilePopoverVisible] = useState(false)
  const [filePopoverFilter, setFilePopoverFilter] = useState('')
  const [filePopoverItems, setFilePopoverItems] = useState<Array<{ name: string; path: string; isDirectory: boolean; extension?: string }>>([])
  const [filePopoverIndex, setFilePopoverIndex] = useState(0)
  const [fileTriggerPosition, setFileTriggerPosition] = useState(0) // Position of @ in text

  // === / Command popover state ===
  const [cmdPopoverVisible, setCmdPopoverVisible] = useState(false)
  const [cmdPopoverFilter, setCmdPopoverFilter] = useState('')
  const [cmdPopoverIndex, setCmdPopoverIndex] = useState(0)
  const [cmdTriggerPosition, setCmdTriggerPosition] = useState(0) // Position of / in text
  const [cachedCommands, setCachedCommands] = useState<SlashCommand[]>([])
  const [activeSkillBadge, setActiveSkillBadge] = useState<{ name: string; content: string } | null>(null)

  // Preload slash commands when space changes
  useEffect(() => {
    api.listSlashCommands(currentSpace?.id).then(result => {
      if (result.success && result.data) {
        setCachedCommands(result.data as SlashCommand[])
      }
    })
  }, [currentSpace?.id])

  // Translate typewriter phrases
  const typewriterPhrases = TYPEWRITER_PHRASE_KEYS.map(key => t(key))

  // Typewriter animation for placeholder
  const typewriterText = useTypewriter(typewriterPhrases, {
    typeSpeed: 40,
    deleteSpeed: 20,
    pauseAfterType: 4000,
    pauseAfterDelete: 200,
  })

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (fileError) {
      const timer = setTimeout(() => setFileError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [fileError])

  // Auto-clear info toast after 2 seconds
  useEffect(() => {
    if (infoToast) {
      const timer = setTimeout(() => setInfoToast(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [infoToast])

  // Show info toast when clicking disabled buttons during generation
  const handleDisabledClick = () => {
    setInfoToast(t('Please wait for the response to complete'))
  }

  // Close attachment menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false)
      }
    }

    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAttachMenu])

  // === @ File reference: debounced fetch ===
  const fetchFilesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchFiles = useCallback((query: string) => {
    if (!currentSpace?.id) return
    if (fetchFilesTimerRef.current) clearTimeout(fetchFilesTimerRef.current)
    fetchFilesTimerRef.current = setTimeout(async () => {
      const result = await api.spaceListFiles(currentSpace.id, query)
      if (result.success && result.data) {
        setFilePopoverItems(result.data as Array<{ name: string; path: string; isDirectory: boolean; extension?: string }>)
      }
    }, query ? 200 : 0) // Immediate on first @, debounced on subsequent typing
  }, [currentSpace?.id])

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (fetchFilesTimerRef.current) clearTimeout(fetchFilesTimerRef.current)
    }
  }, [])

  // === / Command popover: filtered commands ===
  const filteredCommands = useMemo(() => {
    if (!cmdPopoverVisible) return []
    const filterLower = cmdPopoverFilter.toLowerCase()
    const builtin = cachedCommands.filter(c => c.source.kind === 'builtin')
    const skills = cachedCommands.filter(c => c.source.kind !== 'builtin')
    const fb = filterLower
      ? builtin.filter(c => c.name.toLowerCase().includes(filterLower) || c.description.toLowerCase().includes(filterLower))
      : builtin
    const fs = filterLower
      ? skills.filter(c => c.name.toLowerCase().includes(filterLower) || c.description.toLowerCase().includes(filterLower))
      : skills
    return [...fb, ...fs]
  }, [cmdPopoverVisible, cmdPopoverFilter, cachedCommands])

  // Handle command selection from popover
  const handleCommandSelect = useCallback((command: SlashCommand) => {
    setCmdPopoverVisible(false)

    switch (command.type) {
      case 'immediate':
        // Clear input and execute immediately
        setContent('')
        // Dispatch immediate command via custom event (handled by parent)
        window.dispatchEvent(new CustomEvent('skillsfan:slash-command', {
          detail: { command: command.name, type: 'immediate' }
        }))
        break

      case 'prompt':
        // Replace input with preset prompt content
        setContent(command.content || '')
        textareaRef.current?.focus()
        break

      case 'skill': {
        // If user typed extra text after the command, combine and send
        const afterCmd = content.slice(cmdTriggerPosition + 1 + command.name.length).trim()
        if (afterCmd) {
          const finalMsg = `${command.content}\n\nUser request: ${afterCmd}`
          setContent('')
          setActiveSkillBadge(null)
          onSend(finalMsg)
        } else {
          // Show skill badge and wait for user input
          setContent('')
          setActiveSkillBadge({ name: command.name, content: command.content || '' })
          textareaRef.current?.focus()
        }
        break
      }
    }
  }, [content, cmdTriggerPosition, onSend])

  // Handle file selection from popover
  const handleFileSelect = useCallback((item: { name: string; path: string; isDirectory: boolean; extension?: string }) => {
    const before = content.slice(0, fileTriggerPosition)
    const afterPos = fileTriggerPosition + 1 + filePopoverFilter.length // @ + filter length
    const after = content.slice(afterPos)
    const newContent = `${before}@${item.path} ${after}`
    setContent(newContent)
    setFilePopoverVisible(false)
    setFilePopoverFilter('')
    setFilePopoverItems([])
    // Refocus textarea
    textareaRef.current?.focus()
  }, [content, fileTriggerPosition, filePopoverFilter])

  // Apply suggested content from external source
  useEffect(() => {
    if (suggestedContent) {
      setContent(suggestedContent)
      textareaRef.current?.focus()
    }
  }, [suggestedContent])

  // Show error to user
  const showError = (message: string) => {
    setFileError({ id: `err-${Date.now()}`, message })
  }

  // Onboarding state
  const { isActive: isOnboarding, currentStep } = useOnboardingStore()
  const isOnboardingSendStep = isOnboarding && currentStep === 'send-message'

  // In onboarding send step, show prefilled prompt
  const onboardingPrompt = getOnboardingPrompt(t)
  const displayContent = isOnboardingSendStep ? onboardingPrompt : content

  // Show typewriter only when input is empty, not focused, not hovered, and animation is enabled
  const showTypewriter = showTypewriterAnimation && !content && !isFocused && !isHovered && !isOnboardingSendStep && !isGenerating

  // Add files as attachments (with limit check and loading state)
  const addFiles = async (files: File[]) => {
    const remainingSlots = MAX_ATTACHMENTS - attachments.length
    if (remainingSlots <= 0) return

    const filesToProcess = files.slice(0, remainingSlots)

    // Show loading state during processing
    setIsProcessingFiles(true)

    try {
      const results = await Promise.allSettled(
        filesToProcess.map(async (file) => {
          // Validate support
          if (!isSupportedFile(file)) {
            showError(t('Unsupported file type: {{name}}', { name: file.name }))
            return null
          }
          // Validate size
          const sizeCheck = checkFileSize(file)
          if (!sizeCheck.valid) {
            showError(sizeCheck.error!)
            return null
          }
          return processFile(file)
        })
      )

      const validAttachments = results
        .filter((r): r is PromiseFulfilledResult<Attachment | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((att): att is Attachment => att !== null)

      if (validAttachments.length > 0) {
        setAttachments(prev => [...prev, ...validAttachments])
      }
    } catch (error) {
      console.error('Failed to process files:', error)
      showError(t('Failed to process files'))
    } finally {
      setIsProcessingFiles(false)
    }
  }

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id))
  }

  // Handle paste event
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const pasteFiles: File[] = []

    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && isSupportedFile(file)) {
          pasteFiles.push(file)
        }
      }
    }

    if (pasteFiles.length > 0) {
      e.preventDefault()  // Prevent default only if we're handling files
      await addFiles(pasteFiles)
    }
  }

  // Handle drag events
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter(file => isSupportedFile(file))

    if (files.length > 0) {
      await addFiles(files)
    }
  }

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      await addFiles(files)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle image input change
  const handleImageInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      await addFiles(files)
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  // Handle attach button click - select files
  const handleAttachButtonClick = () => {
    setShowAttachMenu(false)
    fileInputRef.current?.click()
  }

  // Handle image button click - select images only
  const handleImageButtonClick = () => {
    if (isNoVisionModel(currentModelId)) {
      setInfoToast(t('This model does not support image understanding'))
      setShowAttachMenu(false)
      return
    }
    setShowAttachMenu(false)
    imageInputRef.current?.click()
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [displayContent])

  // Handle send
  const handleSend = () => {
    const textToSend = isOnboardingSendStep ? onboardingPrompt : content.trim()

    // If skill badge is active, prepend skill content
    let finalText = textToSend
    if (activeSkillBadge && textToSend) {
      finalText = `${activeSkillBadge.content}\n\nUser request: ${textToSend}`
    }

    const hasContent = finalText || attachments.length > 0

    if (!hasContent) return

    // Block send if images attached with a model that doesn't support vision
    const hasImageAttachments = attachments.some(a => a.type === 'image')
    if (hasImageAttachments && isNoVisionModel(currentModelId)) {
      setInfoToast(t('This model does not support image understanding'))
      return
    }

    if (isGenerating && onInject) {
      // During generation: inject message instead of normal send
      onInject(finalText, attachments.length > 0 ? attachments : undefined)
      setContent('')
      setAttachments([])
      setActiveSkillBadge(null)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } else if (!isGenerating) {
      // Normal send
      onSend(finalText, attachments.length > 0 ? attachments : undefined, thinkingEnabled)

      if (!isOnboardingSendStep) {
        setContent('')
        setAttachments([])  // Clear attachments after send
        setActiveSkillBadge(null)
        // Don't reset thinkingEnabled - user might want to keep it on
        // Reset height
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      }
    }
  }

  // Detect mobile device (touch + narrow screen)
  const isMobile = () => {
    return 'ontouchstart' in window && window.innerWidth < 768
  }

  // Handle key press
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore key events during IME composition (Chinese/Japanese/Korean input)
    // This prevents Enter from sending the message while confirming IME candidates
    if (e.nativeEvent.isComposing) return

    // === / Command popover keyboard navigation ===
    if (cmdPopoverVisible && filteredCommands.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCmdPopoverIndex(prev => Math.max(0, prev - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCmdPopoverIndex(prev => Math.min(filteredCommands.length - 1, prev + 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredCommands[cmdPopoverIndex]) {
          handleCommandSelect(filteredCommands[cmdPopoverIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCmdPopoverVisible(false)
        return
      }
    }

    // === @ File popover keyboard navigation ===
    if (filePopoverVisible && filePopoverItems.length > 0) {
      const displayCount = Math.min(filePopoverItems.length, 20)
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFilePopoverIndex(prev => Math.max(0, prev - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFilePopoverIndex(prev => Math.min(displayCount - 1, prev + 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filePopoverItems[filePopoverIndex]) {
          handleFileSelect(filePopoverItems[filePopoverIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setFilePopoverVisible(false)
        return
      }
    }

    // Mobile: Enter for newline, send via button only
    // PC: Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault()
      handleSend()
    }
    // Esc behavior during generation:
    // - If input has content: clear input (don't stop)
    // - If input is empty: stop generation
    if (e.key === 'Escape' && isGenerating) {
      e.preventDefault()
      if (content.trim()) {
        setContent('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      } else {
        onStop()
      }
    }
  }

  // In onboarding mode, can always send (prefilled content)
  // Can send if has text OR has attachments (and not processing files)
  // Allow sending during generation if onInject is provided (for inject feature)
  const canSend = isOnboardingSendStep || ((content.trim().length > 0 || attachments.length > 0) && !isProcessingFiles && (!isGenerating || !!onInject))
  const hasAttachments = attachments.length > 0

  return (
    <div className={`
      ${noBorder ? '' : 'border-t border-border/50'} bg-background/80 backdrop-blur-sm
      transition-[padding] duration-300 ease-out
      ${isCompact ? 'px-3 py-2' : noBorder ? 'px-4 py-0' : 'px-4 py-3'}
    `}>
      <div className={isCompact ? '' : 'max-w-4xl mx-auto'}>
        {/* Error toast notification */}
        {fileError && (
          <div className="mb-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20
            flex items-start gap-2 animate-fade-in">
            <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
            <span className="text-sm text-destructive flex-1">{fileError.message}</span>
          </div>
        )}

        {/* Info toast notification */}
        {infoToast && (
          <div className="mb-2 p-3 rounded-xl bg-muted border border-border
            flex items-center gap-2 animate-fade-in">
            <span className="text-sm text-muted-foreground">{infoToast}</span>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageInputChange}
        />

        {/* Skill Management Button - above input */}
        {!isOnboarding && (
          <div className="flex items-center mb-2">
            <button
              onClick={() => {
                if (isGenerating) {
                  handleDisabledClick()
                  return
                }
                openSettingsWithSection('skills')
              }}
              className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium
                transition-all duration-200 border
                text-foreground/70 border-border hover:bg-muted hover:text-foreground"
              title={t('Skill Management')}
            >
              <Package size={15} className="text-primary/80" />
              <span>{t('Skill Management')}</span>
            </button>
          </div>
        )}

        {/* Attachment preview area - outside input container */}
        {(hasAttachments || isProcessingFiles) && (
          <AttachmentPreview
            attachments={attachments}
            onRemove={removeAttachment}
            isProcessing={isProcessingFiles}
          />
        )}

        {/* Input container */}
        <div
          className={`
            relative flex flex-col rounded-2xl
            border border-border bg-card/95 shadow-lg ring-1 ring-inset ring-white/5
            ${isGenerating && !onInject ? 'opacity-60' : ''}
            ${isDragOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center
              bg-primary/5 rounded-2xl border-2 border-dashed border-primary/30
              pointer-events-none z-10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Paperclip size={24} />
                <span className="text-sm font-medium">{t('Drop files here')}</span>
              </div>
            </div>
          )}

          {/* @ File reference popover */}
          <FilePopover
            visible={filePopoverVisible}
            filter={filePopoverFilter}
            items={filePopoverItems}
            selectedIndex={filePopoverIndex}
            onSelect={handleFileSelect}
            onClose={() => setFilePopoverVisible(false)}
          />

          {/* / Command popover */}
          <CommandPopover
            visible={cmdPopoverVisible}
            filter={cmdPopoverFilter}
            commands={cachedCommands}
            selectedIndex={cmdPopoverIndex}
            onSelect={handleCommandSelect}
            onClose={() => setCmdPopoverVisible(false)}
          />

          {/* Active skill badge */}
          {activeSkillBadge && (
            <div className="mx-4 mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full
                bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                <span>{'\u26a1'}</span>
                <span>{activeSkillBadge.name}</span>
                <button
                  onClick={() => setActiveSkillBadge(null)}
                  className="ml-0.5 hover:text-primary/70 transition-colors"
                >
                  {'\u2715'}
                </button>
              </div>
            </div>
          )}

          {/* Textarea area */}
          <div className="px-4 pt-3 pb-2 relative">
            {/* Typewriter animation overlay */}
            {showTypewriter && (
              <div
                className="absolute left-0 top-0 px-4 pt-3 pb-2 pointer-events-none
                  text-muted-foreground/50 text-base leading-relaxed text-left"
              >
                {typewriterText}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={displayContent}
              onChange={(e) => {
                if (isOnboardingSendStep) return
                const value = e.target.value
                setContent(value)

                // Detect @ trigger for file reference
                const cursorPos = e.target.selectionStart || 0
                const beforeCursor = value.slice(0, cursorPos)
                const atMatch = beforeCursor.match(/@([^\s@]*)$/)

                if (atMatch && (atMatch.index === 0 || beforeCursor[atMatch.index! - 1] === ' ' || beforeCursor[atMatch.index! - 1] === '\n')) {
                  const filter = atMatch[1]
                  setFilePopoverVisible(true)
                  setFilePopoverFilter(filter)
                  setFileTriggerPosition(cursorPos - atMatch[0].length)
                  setFilePopoverIndex(0)
                  fetchFiles(filter)
                  setCmdPopoverVisible(false) // Close command popover if open
                  return
                } else {
                  setFilePopoverVisible(false)
                }

                // Detect / trigger for slash commands
                const slashMatch = beforeCursor.match(/(^|\s)\/([^\s]*)$/)
                if (slashMatch) {
                  const filter = slashMatch[2]
                  setCmdPopoverVisible(true)
                  setCmdPopoverFilter(filter)
                  setCmdTriggerPosition(cursorPos - slashMatch[2].length - 1) // position of /
                  setCmdPopoverIndex(0)
                } else {
                  setCmdPopoverVisible(false)
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              placeholder=""
              disabled={isGenerating && !onInject}
              readOnly={isOnboardingSendStep}
              rows={2}
              className={`w-full bg-transparent resize-none
                focus:outline-none text-foreground placeholder:text-muted-foreground/50
                disabled:cursor-not-allowed min-h-[56px] text-base leading-relaxed
                ${isOnboardingSendStep ? 'cursor-default' : ''}`}
              style={{ maxHeight: '200px' }}
            />
          </div>

          {/* Bottom toolbar - always visible, industry standard layout */}
          <InputToolbar
            isGenerating={isGenerating}
            isOnboarding={isOnboardingSendStep}
            isProcessingFiles={isProcessingFiles}
            thinkingEnabled={thinkingEnabled}
            onThinkingToggle={() => setThinkingEnabled(!thinkingEnabled)}
            aiBrowserEnabled={aiBrowserEnabled}
            onAIBrowserToggle={() => setAIBrowserEnabled(!aiBrowserEnabled)}
            showAttachMenu={showAttachMenu}
            onAttachMenuToggle={() => setShowAttachMenu(!showAttachMenu)}
            onAttachClick={handleAttachButtonClick}
            onImageClick={handleImageButtonClick}
            attachmentCount={attachments.length}
            maxAttachments={MAX_ATTACHMENTS}
            attachMenuRef={attachMenuRef}
            canSend={canSend}
            onSend={handleSend}
            onStop={onStop}
            onDisabledClick={handleDisabledClick}
            popoverUp={!noBorder}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Input Toolbar - Bottom action bar
 * Extracted as a separate component for maintainability and future extensibility
 *
 * Layout: [+attachment] ──────────────────── [⚛ thinking] [send]
 */
interface InputToolbarProps {
  isGenerating: boolean
  isOnboarding: boolean
  isProcessingFiles: boolean
  thinkingEnabled: boolean
  onThinkingToggle: () => void
  aiBrowserEnabled: boolean
  onAIBrowserToggle: () => void
  showAttachMenu: boolean
  onAttachMenuToggle: () => void
  onAttachClick: () => void
  onImageClick: () => void
  attachmentCount: number
  maxAttachments: number
  attachMenuRef: React.RefObject<HTMLDivElement | null>
  canSend: boolean
  onSend: () => void
  onStop: () => void
  onDisabledClick: () => void  // Callback when clicking disabled buttons during generation
  popoverUp?: boolean  // true = popover opens upward (bottom input), false = downward (centered input)
}

function InputToolbar({
  isGenerating,
  isOnboarding,
  isProcessingFiles,
  thinkingEnabled,
  onThinkingToggle,
  aiBrowserEnabled,
  onAIBrowserToggle,
  showAttachMenu,
  onAttachMenuToggle,
  onAttachClick,
  onImageClick,
  attachmentCount,
  maxAttachments,
  attachMenuRef,
  canSend,
  onSend,
  onStop,
  onDisabledClick,
  popoverUp = false
}: InputToolbarProps) {
  const { t } = useTranslation()

  // Detect mobile viewport for simplified toolbar (responsive to window resize)
  const isMobile = useIsMobile()

  return (
    <div className="flex items-center justify-between px-2 pb-2 pt-1">
      {/* Left section: attachment button + model/space selectors */}
      <div className="flex items-center gap-1">
        {/* Attachment menu */}
        {!isGenerating && !isOnboarding && (
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={onAttachMenuToggle}
              disabled={isProcessingFiles}
              className={`w-8 h-8 flex items-center justify-center rounded-lg
                transition-all duration-150
                ${showAttachMenu
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground/80 hover:text-foreground hover:bg-muted'
                }
                ${isProcessingFiles ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={t('Add attachment')}
            >
              <Paperclip size={16} className={`transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
            </button>

            {showAttachMenu && (
              <div className={`absolute left-0 p-1 bg-popover border border-border
                rounded-lg shadow-lg z-20 animate-fade-in
                ${popoverUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                <button
                  onClick={onImageClick}
                  disabled={attachmentCount >= maxAttachments}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm whitespace-nowrap
                    rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted disabled:text-muted-foreground/40 disabled:cursor-not-allowed"
                >
                  <Image size={14} />
                  <span>{t('Select image')}</span>
                </button>
                <button
                  onClick={onAttachClick}
                  disabled={attachmentCount >= maxAttachments}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm whitespace-nowrap
                    rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted disabled:text-muted-foreground/40 disabled:cursor-not-allowed"
                >
                  <File size={14} />
                  <span>{t('Select file')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Model Selector - icon only on narrow windows */}
        {!isOnboarding && (
          <ModelSelector variant="compact" iconOnly={isMobile} disabled={isGenerating} onDisabledClick={onDisabledClick} popoverUp={popoverUp} />
        )}

        {/* Space Selector - icon only on narrow windows */}
        {!isOnboarding && (
          <SpaceSelector iconOnly={isMobile} disabled={isGenerating} onDisabledClick={onDisabledClick} />
        )}

        {/* AI Browser toggle - temporarily hidden */}
        {/* {!isGenerating && !isOnboarding && (
          <button
            onClick={onAIBrowserToggle}
            className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg
              transition-all duration-200 border
              ${aiBrowserEnabled
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'text-foreground/80 border-border/60 hover:text-foreground hover:bg-muted hover:border-border'
              }
            `}
            title={aiBrowserEnabled ? t('AI Browser enabled (click to disable)') : t('Enable AI Browser')}
          >
            <Globe size={15} />
            {!isMobile && <span className="text-xs">{t('Browser')}</span>}
          </button>
        )} */}

      </div>

      {/* Right section: credits + action button */}
      <div className="flex items-center gap-1.5">
        {/* Credits Display - only shown when using SkillsFan Credits */}
        {!isOnboarding && <CreditsDisplay />}
        {isGenerating ? (
          <button
            onClick={onStop}
            className="w-8 h-8 flex items-center justify-center
              bg-destructive text-destructive-foreground rounded-full
              hover:bg-destructive/90 active:scale-95
              transition-all duration-150
              animate-pulse shadow-sm shadow-destructive/30"
            title={t('Stop generation (Esc)')}
          >
            <div className="w-3 h-3 bg-current rounded-sm" />
          </button>
        ) : (
          <button
            data-onboarding="send-button"
            onClick={onSend}
            disabled={!canSend}
            className={`
              w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200
              ${canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                : 'bg-muted text-muted-foreground/60 cursor-not-allowed'
              }
            `}
            title={thinkingEnabled ? t('Send (Deep Thinking)') : t('Send')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
