/**
 * CreateSpaceDialog - Reusable dialog for creating new spaces
 * Extracted from HomePage for reuse in SpaceSelector
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Monitor } from 'lucide-react'
import { useSpaceStore } from '../../stores/space.store'
import { SPACE_ICONS, DEFAULT_SPACE_ICON, SPACE_ICON_COLORS, DEFAULT_SPACE_ICON_COLOR } from '../../types'
import type { Space, CreateSpaceInput, SpaceIconId, SpaceIconColorId } from '../../types'
import { SpaceIcon, FolderOpen, ChevronDown } from '../icons/ToolIcons'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { canvasLifecycle } from '../../services/canvas-lifecycle'

// Check if running in web mode
const isWebMode = api.isRemoteMode()

interface CreateSpaceDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (space: Space) => void
}

export function CreateSpaceDialog({ isOpen, onClose, onCreated }: CreateSpaceDialogProps) {
  const { t } = useTranslation()
  const { createSpace } = useSpaceStore()

  // Form state
  const [newSpaceName, setNewSpaceName] = useState('')
  const [newSpaceIcon, setNewSpaceIcon] = useState<SpaceIconId>(DEFAULT_SPACE_ICON)
  const [newSpaceIconColor, setNewSpaceIconColor] = useState<SpaceIconColorId>(DEFAULT_SPACE_ICON_COLOR)
  const [useCustomPath, setUseCustomPath] = useState(false)
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [defaultPath, setDefaultPath] = useState<string>('~/.skillsfan/spaces')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Ref for space name input
  const spaceNameInputRef = useRef<HTMLInputElement>(null)
  const restoreBrowserViewsRef = useRef(false)

  // Load default path when dialog opens
  useEffect(() => {
    if (isOpen) {
      api.getDefaultSpacePath().then((res) => {
        if (res.success && res.data) {
          setDefaultPath(res.data as string)
        }
      })
      // Focus the space name input when dialog opens
      setTimeout(() => {
        spaceNameInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Hide BrowserViews while dialog is open to avoid overlay gaps
  useEffect(() => {
    if (!isOpen) return
    if (!canvasLifecycle.getIsOpen()) return

    restoreBrowserViewsRef.current = true
    void canvasLifecycle.hideAllBrowserViews()

    return () => {
      if (!restoreBrowserViewsRef.current) return
      restoreBrowserViewsRef.current = false

      if (canvasLifecycle.getIsOpen()) {
        void canvasLifecycle.showActiveBrowserView()
      }
    }
  }, [isOpen])

  // Reset form state
  const resetForm = () => {
    setNewSpaceName('')
    setNewSpaceIcon(DEFAULT_SPACE_ICON)
    setNewSpaceIconColor(DEFAULT_SPACE_ICON_COLOR)
    setUseCustomPath(false)
    setCustomPath(null)
    setShowAdvanced(false)
  }

  // Handle close
  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Handle folder selection
  const handleSelectFolder = async () => {
    if (isWebMode) return
    const res = await api.selectFolder()
    if (res.success && res.data) {
      const path = res.data as string
      setCustomPath(path)
      setUseCustomPath(true)
      // Extract directory name as suggested space name
      const dirName = path.split('/').pop() || ''
      if (dirName && !newSpaceName.trim()) {
        setNewSpaceName(dirName)
      }
      // Focus the space name input
      setTimeout(() => {
        spaceNameInputRef.current?.focus()
        spaceNameInputRef.current?.select()
      }, 100)
    }
  }

  // Handle create space
  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return

    // Get the color value from the color ID
    const colorConfig = SPACE_ICON_COLORS.find(c => c.id === newSpaceIconColor)
    const iconColorValue = colorConfig?.value || ''

    const input: CreateSpaceInput = {
      name: newSpaceName.trim(),
      icon: newSpaceIcon,
      iconColor: iconColorValue || undefined,
      customPath: useCustomPath && customPath ? customPath : undefined
    }

    const newSpace = await createSpace(input)

    if (newSpace) {
      resetForm()
      onClose()
      onCreated?.(newSpace)
    }
  }

  // Shorten path for display
  const shortenPath = (path: string) => {
    const home = path.includes('/Users/') ? path.replace(/\/Users\/[^/]+/, '~') : path
    return home
  }

  if (!isOpen) return null

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      {/* Backdrop - click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      {/* Dialog content */}
      <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-md max-h-[85vh] overflow-y-auto animate-fade-in shadow-2xl">
        <h2 className="text-lg font-semibold mb-6 text-foreground/95 tracking-tight">{t('Create Dedicated Space')}</h2>

        {/* 1. Space name - Primary input, most important */}
        <div className="mb-6">
          <label className="block text-sm text-muted-foreground mb-2.5 font-medium">{t('Name this space')}</label>
          <input
            ref={spaceNameInputRef}
            type="text"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            placeholder={t('My Project')}
            className="w-full px-4 py-3 bg-input/50 focus:bg-input rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSpaceName.trim() && !(useCustomPath && !customPath)) {
                handleCreateSpace()
              }
            }}
          />
        </div>

        {/* 2. Icon select */}
        <div className="mb-5">
          <label className="block text-sm text-muted-foreground font-medium mb-2.5">{t('Icon (optional)')}</label>
          <div className="grid grid-cols-7 gap-1.5">
            {/* None option first */}
            <button
              onClick={() => setNewSpaceIcon('' as SpaceIconId)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                newSpaceIcon === ''
                  ? 'bg-foreground/10 ring-2 ring-foreground/30'
                  : 'bg-secondary/40 hover:bg-secondary/60'
              }`}
              title={t('None')}
            >
              <span className="text-xs text-muted-foreground">{t('None')}</span>
            </button>
            {SPACE_ICONS.map((iconId) => {
              const colorConfig = SPACE_ICON_COLORS.find(c => c.id === newSpaceIconColor)
              const iconColorValue = colorConfig?.value || undefined
              return (
                <button
                  key={iconId}
                  onClick={() => setNewSpaceIcon(iconId)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    newSpaceIcon === iconId
                      ? 'bg-foreground/10 ring-2 ring-foreground/30'
                      : 'bg-secondary/40 hover:bg-secondary/60'
                  }`}
                >
                  <SpaceIcon iconId={iconId} size={16} iconColor={iconColorValue} className={iconColorValue ? '' : 'text-foreground/70'} />
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. Color picker */}
        <div className="mb-6">
          <label className="block text-sm text-muted-foreground font-medium mb-2.5">{t('Color')}</label>
          <div className="flex gap-2">
            {SPACE_ICON_COLORS.map((color) => (
              <button
                key={color.id}
                onClick={() => setNewSpaceIconColor(color.id as SpaceIconColorId)}
                className={`w-7 h-7 rounded-full transition-all ${
                  newSpaceIconColor === color.id
                    ? 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-card scale-110'
                    : 'hover:scale-110'
                }`}
                style={{
                  backgroundColor: color.value || 'transparent',
                  border: color.id === 'none' ? '2px dashed var(--border)' : 'none'
                }}
                title={color.label}
              />
            ))}
          </div>
        </div>

        {/* 3. Advanced settings - Collapsible, lowest priority */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? '' : '-rotate-90'}`} />
            <span>{t('Advanced Settings')}</span>
            {useCustomPath && customPath && (
              <span className="text-xs text-muted-foreground ml-auto">{t('Custom path set')}</span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-2 pl-6">
              <label className="block text-xs text-muted-foreground mb-2 text-left">{t('Storage Location')}</label>
              {/* Default location */}
              <label
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  !useCustomPath
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <input
                  type="radio"
                  name="pathType"
                  checked={!useCustomPath}
                  onChange={() => {
                    setUseCustomPath(false)
                    setTimeout(() => {
                      spaceNameInputRef.current?.focus()
                    }, 100)
                  }}
                  className="w-3.5 h-3.5 text-primary"
                />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm">{t('Default Location')}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {shortenPath(defaultPath)}/{newSpaceName || '...'}
                  </div>
                </div>
              </label>

              {/* Custom location */}
              <label
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  isWebMode
                    ? 'cursor-not-allowed opacity-60 border-border'
                    : useCustomPath
                      ? 'cursor-pointer border-primary bg-primary/5'
                      : 'cursor-pointer border-border hover:border-muted-foreground/50'
                }`}
              >
                <input
                  type="radio"
                  name="pathType"
                  checked={useCustomPath}
                  onChange={() => !isWebMode && setUseCustomPath(true)}
                  disabled={isWebMode}
                  className="w-3.5 h-3.5 text-primary"
                />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm">{t('Custom Folder')}</div>
                  {isWebMode ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Monitor className="w-3 h-3" />
                      {t('Please select folder in desktop app')}
                    </div>
                  ) : customPath ? (
                    <div className="text-xs text-muted-foreground truncate">
                      {shortenPath(customPath)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t('Select an existing project or folder')}
                    </div>
                  )}
                </div>
                {!isWebMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      handleSelectFolder()
                    }}
                    className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-md flex items-center gap-1 transition-colors"
                  >
                    <FolderOpen className="w-3 h-3" />
                    {t('Browse')}
                  </button>
                )}
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleCreateSpace}
            disabled={!newSpaceName.trim() || (useCustomPath && !customPath)}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('Create')}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}
