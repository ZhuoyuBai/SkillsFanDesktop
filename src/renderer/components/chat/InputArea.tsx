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

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, DragEvent } from 'react'
import { Plus, ImagePlus, Loader2, AlertCircle, Globe, Package } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useOnboardingStore } from '../../stores/onboarding.store'
import { useAIBrowserStore } from '../../stores/ai-browser.store'
import { getOnboardingPrompt } from '../onboarding/onboardingData'
import { ImageAttachmentPreview } from './ImageAttachmentPreview'
import { ModelSelector } from '../layout/ModelSelector'
import { CreditsDisplay } from '../layout/CreditsDisplay'
import { SpaceSelector } from '../layout/SpaceSelector'
import { processImage, isValidImageType, formatFileSize } from '../../utils/imageProcessor'
import type { ImageAttachment } from '../../types'
import { useTranslation } from '../../i18n'

interface InputAreaProps {
  onSend: (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean) => void
  onStop: () => void
  onInject?: (content: string, images?: ImageAttachment[]) => void  // Inject message during generation
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

// Image constraints
const MAX_IMAGE_SIZE = 20 * 1024 * 1024  // 20MB max per image (before compression)
const MAX_IMAGES = 10  // Max images per message

// Error message type
interface ImageError {
  id: string
  message: string
}

export function InputArea({ onSend, onStop, onInject, isGenerating, isCompact = false, noBorder = false, suggestedContent, showTypewriterAnimation = true }: InputAreaProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessingImages, setIsProcessingImages] = useState(false)
  const [imageError, setImageError] = useState<ImageError | null>(null)
  const [infoToast, setInfoToast] = useState<string | null>(null)  // Info toast message
  const [thinkingEnabled, setThinkingEnabled] = useState(false)  // Extended thinking mode
  const [showAttachMenu, setShowAttachMenu] = useState(false)  // Attachment menu visibility
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)

  // AI Browser state
  const { enabled: aiBrowserEnabled, setEnabled: setAIBrowserEnabled } = useAIBrowserStore()

  // Settings navigation
  const { openSettingsWithSection } = useAppStore()

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
    if (imageError) {
      const timer = setTimeout(() => setImageError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [imageError])

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

  // Apply suggested content from external source
  useEffect(() => {
    if (suggestedContent) {
      setContent(suggestedContent)
      textareaRef.current?.focus()
    }
  }, [suggestedContent])

  // Show error to user
  const showError = (message: string) => {
    setImageError({ id: `err-${Date.now()}`, message })
  }

  // Onboarding state
  const { isActive: isOnboarding, currentStep } = useOnboardingStore()
  const isOnboardingSendStep = isOnboarding && currentStep === 'send-message'

  // In onboarding send step, show prefilled prompt
  const onboardingPrompt = getOnboardingPrompt(t)
  const displayContent = isOnboardingSendStep ? onboardingPrompt : content

  // Show typewriter only when input is empty, not focused, not hovered, and animation is enabled
  const showTypewriter = showTypewriterAnimation && !content && !isFocused && !isHovered && !isOnboardingSendStep && !isGenerating

  // Process file to ImageAttachment with professional compression
  const processFileWithCompression = async (file: File): Promise<ImageAttachment | null> => {
    // Validate type
    if (!isValidImageType(file)) {
      showError(t('Unsupported image format: {{type}}', { type: file.type || t('Unknown') }))
      return null
    }

    // Validate size (before compression)
    if (file.size > MAX_IMAGE_SIZE) {
      showError(t('Image too large ({{size}}), max 20MB', { size: formatFileSize(file.size) }))
      return null
    }

    try {
      // Use professional image processor for compression
      const processed = await processImage(file)

      return {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'image',
        mediaType: processed.mediaType,
        data: processed.data,
        name: file.name,
        size: processed.compressedSize
      }
    } catch (error) {
      console.error(`Failed to process image: ${file.name}`, error)
      showError(t('Failed to process image: {{name}}', { name: file.name }))
      return null
    }
  }

  // Add images (with limit check and loading state)
  const addImages = async (files: File[]) => {
    const remainingSlots = MAX_IMAGES - images.length
    if (remainingSlots <= 0) return

    const filesToProcess = files.slice(0, remainingSlots)

    // Show loading state during compression
    setIsProcessingImages(true)

    try {
      const newImages = await Promise.all(filesToProcess.map(processFileWithCompression))
      const validImages = newImages.filter((img): img is ImageAttachment => img !== null)

      if (validImages.length > 0) {
        setImages(prev => [...prev, ...validImages])
      }
    } finally {
      setIsProcessingImages(false)
    }
  }

  // Remove image
  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id))
  }

  // Handle paste event
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()  // Prevent default only if we're handling images
      await addImages(imageFiles)
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

    const files = Array.from(e.dataTransfer.files).filter(file => isValidImageType(file))

    if (files.length > 0) {
      await addImages(files)
    }
  }

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      await addImages(files)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle image button click (from attachment menu)
  const handleImageButtonClick = () => {
    setShowAttachMenu(false)
    fileInputRef.current?.click()
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
    const hasContent = textToSend || images.length > 0

    if (!hasContent) return

    if (isGenerating && onInject) {
      // During generation: inject message instead of normal send
      onInject(textToSend, images.length > 0 ? images : undefined)
      setContent('')
      setImages([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } else if (!isGenerating) {
      // Normal send
      onSend(textToSend, images.length > 0 ? images : undefined, thinkingEnabled)

      if (!isOnboardingSendStep) {
        setContent('')
        setImages([])  // Clear images after send
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
  // Can send if has text OR has images (and not processing images)
  // Allow sending during generation if onInject is provided (for inject feature)
  const canSend = isOnboardingSendStep || ((content.trim().length > 0 || images.length > 0) && !isProcessingImages && (!isGenerating || !!onInject))
  const hasImages = images.length > 0

  return (
    <div className={`
      ${noBorder ? '' : 'border-t border-border/50'} bg-background/80 backdrop-blur-sm
      transition-[padding] duration-300 ease-out
      ${isCompact ? 'px-3 py-2' : noBorder ? 'px-4 py-0' : 'px-4 py-3'}
    `}>
      <div className={isCompact ? '' : 'max-w-4xl mx-auto'}>
        {/* Error toast notification */}
        {imageError && (
          <div className="mb-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20
            flex items-start gap-2 animate-fade-in">
            <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
            <span className="text-sm text-destructive flex-1">{imageError.message}</span>
          </div>
        )}

        {/* Info toast notification */}
        {infoToast && (
          <div className="mb-2 p-3 rounded-xl bg-muted border border-border
            flex items-center gap-2 animate-fade-in">
            <span className="text-sm text-muted-foreground">{infoToast}</span>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
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
          {/* Image preview area */}
          {hasImages && (
            <ImageAttachmentPreview
              images={images}
              onRemove={removeImage}
            />
          )}

          {/* Image processing indicator */}
          {isProcessingImages && (
            <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground border-b border-border/30">
              <Loader2 size={14} className="animate-spin" />
              <span>{t('Processing image...')}</span>
            </div>
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center
              bg-primary/5 rounded-2xl border-2 border-dashed border-primary/30
              pointer-events-none z-10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImagePlus size={24} />
                <span className="text-sm font-medium">{t('Drop to add images')}</span>
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
              onChange={(e) => !isOnboardingSendStep && setContent(e.target.value)}
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
            isProcessingImages={isProcessingImages}
            thinkingEnabled={thinkingEnabled}
            onThinkingToggle={() => setThinkingEnabled(!thinkingEnabled)}
            aiBrowserEnabled={aiBrowserEnabled}
            onAIBrowserToggle={() => setAIBrowserEnabled(!aiBrowserEnabled)}
            showAttachMenu={showAttachMenu}
            onAttachMenuToggle={() => setShowAttachMenu(!showAttachMenu)}
            onImageClick={handleImageButtonClick}
            imageCount={images.length}
            maxImages={MAX_IMAGES}
            attachMenuRef={attachMenuRef}
            canSend={canSend}
            onSend={handleSend}
            onStop={onStop}
            onDisabledClick={handleDisabledClick}
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
  isProcessingImages: boolean
  thinkingEnabled: boolean
  onThinkingToggle: () => void
  aiBrowserEnabled: boolean
  onAIBrowserToggle: () => void
  showAttachMenu: boolean
  onAttachMenuToggle: () => void
  onImageClick: () => void
  imageCount: number
  maxImages: number
  attachMenuRef: React.RefObject<HTMLDivElement | null>
  canSend: boolean
  onSend: () => void
  onStop: () => void
  onDisabledClick: () => void  // Callback when clicking disabled buttons during generation
}

function InputToolbar({
  isGenerating,
  isOnboarding,
  isProcessingImages,
  thinkingEnabled,
  onThinkingToggle,
  aiBrowserEnabled,
  onAIBrowserToggle,
  showAttachMenu,
  onAttachMenuToggle,
  onImageClick,
  imageCount,
  maxImages,
  attachMenuRef,
  canSend,
  onSend,
  onStop,
  onDisabledClick
}: InputToolbarProps) {
  const { t } = useTranslation()

  // Detect mobile viewport for simplified toolbar (responsive to window resize)
  const isMobile = useIsMobile()

  return (
    <div className="flex items-center justify-between px-2 pb-2 pt-1">
      {/* Left section: attachment button + thinking toggle */}
      <div className="flex items-center gap-1">
        {/* Attachment menu - temporarily hidden */}
        {/* {!isGenerating && !isOnboarding && (
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={onAttachMenuToggle}
              disabled={isProcessingImages}
              className={`w-8 h-8 flex items-center justify-center rounded-lg
                transition-all duration-150
                ${showAttachMenu
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground/80 hover:text-foreground hover:bg-muted'
                }
                ${isProcessingImages ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={t('Add attachment')}
            >
              <Plus size={18} className={`transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
            </button>

            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-1 p-1 bg-popover border border-border
                rounded-lg shadow-lg z-20 animate-fade-in">
                <button
                  onClick={onImageClick}
                  disabled={imageCount >= maxImages}
                  className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-sm whitespace-nowrap
                    rounded-md transition-colors duration-150
                    ${imageCount >= maxImages
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-foreground hover:bg-muted'
                    }
                  `}
                >
                  <ImagePlus size={14} className="text-muted-foreground" />
                  <span>{t('Add image')}</span>
                  {imageCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {imageCount}/{maxImages}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )} */}

        {/* Model Selector - icon only on narrow windows */}
        {!isOnboarding && (
          <ModelSelector variant="compact" iconOnly={isMobile} disabled={isGenerating} onDisabledClick={onDisabledClick} />
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
