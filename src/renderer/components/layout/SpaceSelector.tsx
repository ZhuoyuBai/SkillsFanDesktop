/**
 * SpaceSelector - Dropdown for selecting workspace in input toolbar
 * Shows current space and allows switching between spaces
 *
 * Design: Follows ModelSelector compact variant style
 * Position: Right of ModelSelector, Left of Browser button
 */

import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useSpaceStore } from '../../stores/space.store'
import { useAppStore } from '../../stores/app.store'
import type { Space } from '../../types'
import { SpaceIcon } from '../icons/ToolIcons'
import { HaloLogo } from '../brand/HaloLogo'
import { CreateSpaceDialog } from '../space/CreateSpaceDialog'
import { useTranslation } from '../../i18n'

interface SpaceSelectorProps {
  iconOnly?: boolean  // Show only icon without text (for narrow windows)
  disabled?: boolean  // Disable interaction during generation
  onDisabledClick?: () => void  // Callback when clicked while disabled
}

export function SpaceSelector({ iconOnly = false, disabled = false, onDisabledClick }: SpaceSelectorProps = {}) {
  const { t } = useTranslation()
  const { haloSpace, spaces, currentSpace, setCurrentSpace, loadSpaces } = useSpaceStore()
  const { setView } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load spaces on mount if not already loaded
  useEffect(() => {
    if (!haloSpace && spaces.length === 0) {
      loadSpaces()
    }
  }, [haloSpace, spaces.length, loadSpaces])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the click event that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  // Get display space (current or halo as fallback)
  const displaySpace = currentSpace || haloSpace

  // Handle space selection
  const handleSelectSpace = (space: Space) => {
    setCurrentSpace(space)
    setIsOpen(false)
    // Navigate to space view if not already there
    setView('space')
  }

  // Handle create space button click
  const handleCreateClick = () => {
    setIsOpen(false)
    setShowCreateDialog(true)
  }

  // Handle space created
  const handleSpaceCreated = (newSpace: Space) => {
    // Optionally switch to the new space
    setCurrentSpace(newSpace)
    setView('space')
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          onClick={() => {
            if (disabled) {
              onDisabledClick?.()
              return
            }
            setIsOpen(!isOpen)
          }}
          className={`
            h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs
            transition-all duration-200 border
            ${isOpen
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'text-muted-foreground border-border/60 hover:bg-muted hover:border-border hover:text-foreground'
            }
          `.trim().replace(/\s+/g, ' ')}
        >
          {/* Space Icon */}
          {displaySpace?.isTemp ? (
            <HaloLogo size={16} animated={false} />
          ) : displaySpace ? (
            <SpaceIcon iconId={displaySpace.icon} size={14} iconColor={displaySpace.iconColor} />
          ) : (
            <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-muted-foreground">?</span>
            </div>
          )}
          {!iconOnly && (
            <span className="max-w-[80px] truncate">
              {displaySpace?.isTemp ? t('SkillsFan') : displaySpace?.name || t('Space')}
            </span>
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            className={`
              absolute left-0 bottom-full mb-1
              w-56 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden
              animate-in fade-in-0 slide-in-from-bottom-2 duration-200
            `.trim().replace(/\s+/g, ' ')}
          >
            {/* Halo Space (default) */}
            {haloSpace && (
              <button
                onClick={() => handleSelectSpace(haloSpace)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2.5 ${
                  currentSpace?.id === haloSpace.id ? 'text-primary' : 'text-foreground'
                }`}
              >
                <HaloLogo size={18} animated={false} />
                <span className="flex-1 truncate">{t('SkillsFan')}</span>
                {currentSpace?.id === haloSpace.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            )}

            {/* Divider if has user spaces */}
            {spaces.length > 0 && (
              <div className="border-t border-border/60 my-1" />
            )}

            {/* User Spaces */}
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => handleSelectSpace(space)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2.5 ${
                  currentSpace?.id === space.id ? 'text-primary' : 'text-foreground'
                }`}
              >
                <SpaceIcon iconId={space.icon} size={18} iconColor={space.iconColor} className="flex-shrink-0" />
                <span className="flex-1 truncate">{space.name}</span>
                {currentSpace?.id === space.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            ))}

            {/* Divider before create button */}
            <div className="border-t border-border/60 my-1" />

            {/* Create Space Button */}
            <button
              onClick={handleCreateClick}
              className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t('Create Space')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Create Space Dialog */}
      <CreateSpaceDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleSpaceCreated}
      />
    </>
  )
}
