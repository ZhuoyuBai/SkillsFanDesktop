/**
 * SpaceSwitcher - Dropdown for switching between spaces
 * Replaces the logo/back button area in ConversationList header
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Settings } from 'lucide-react'
import { useSpaceStore } from '../../stores/space.store'
import { useAppStore } from '../../stores/app.store'
import { SpaceIcon } from '../icons/ToolIcons'
import { HaloLogo } from '../brand/HaloLogo'
import { useTranslation } from '../../i18n'
import type { Space } from '../../types'

interface SpaceSwitcherProps {
  collapsed?: boolean
}

export function SpaceSwitcher({ collapsed = false }: SpaceSwitcherProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { haloSpace, spaces, currentSpace, setCurrentSpace } = useSpaceStore()
  const { openSettingsWithSection } = useAppStore()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectSpace = (space: Space) => {
    setCurrentSpace(space)
    setIsOpen(false)
  }

  const handleManageSpaces = () => {
    setIsOpen(false)
    openSettingsWithSection('spaces')
  }

  // Collapsed view - just show current space icon
  if (collapsed) {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={currentSpace?.name || t('Switch space')}
        >
          {currentSpace?.isTemp ? (
            <HaloLogo size={20} hoverOnly={true} />
          ) : (
            <SpaceIcon iconId={currentSpace?.icon} size={20} iconColor={currentSpace?.iconColor} />
          )}
        </button>

        {/* Dropdown menu for collapsed state */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-xl shadow-lg py-2 z-50 animate-fade-in">
            {renderDropdownContent()}
          </div>
        )}
      </div>
    )
  }

  // Render dropdown menu content (shared between collapsed and expanded states)
  function renderDropdownContent() {
    return (
      <>
        {/* Halo Space */}
        {haloSpace && (
          <button
            onClick={() => handleSelectSpace(haloSpace)}
            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors ${
              currentSpace?.id === haloSpace.id ? 'bg-muted/50' : ''
            }`}
          >
            <HaloLogo size={18} hoverOnly={true} />
            <span className="text-sm flex-1 text-left">{t('Default Space')}</span>
            {currentSpace?.id === haloSpace.id && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </button>
        )}

        {/* Divider */}
        {spaces.length > 0 && (
          <div className="h-px bg-border my-2" />
        )}

        {/* Custom Spaces */}
        {spaces.map(space => (
          <button
            key={space.id}
            onClick={() => handleSelectSpace(space)}
            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors ${
              currentSpace?.id === space.id ? 'bg-muted/50' : ''
            }`}
          >
            <SpaceIcon iconId={space.icon} size={18} iconColor={space.iconColor} />
            <span className="text-sm flex-1 text-left truncate">{space.name}</span>
            {currentSpace?.id === space.id && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </button>
        ))}

        {/* Manage Spaces link */}
        <div className="h-px bg-border my-2" />
        <button
          onClick={handleManageSpaces}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-muted-foreground"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">{t('Manage spaces...')}</span>
        </button>
      </>
    )
  }

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-0">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 pl-0 pr-2 py-1.5 hover:bg-muted rounded-lg transition-colors w-full"
      >
        {currentSpace?.isTemp ? (
          <HaloLogo size={22} hoverOnly={true} />
        ) : (
          <SpaceIcon iconId={currentSpace?.icon} size={20} iconColor={currentSpace?.iconColor} />
        )}
        <span className="text-sm font-medium truncate flex-1 text-left">
          {currentSpace?.isTemp ? t('Default Space') : currentSpace?.name}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-xl shadow-lg py-2 z-50 animate-fade-in">
          {renderDropdownContent()}
        </div>
      )}
    </div>
  )
}
