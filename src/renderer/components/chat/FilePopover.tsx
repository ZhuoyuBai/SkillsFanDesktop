/**
 * FilePopover - File search popup for @ file reference
 *
 * Shows a list of files from the workspace when user types @ in the input area.
 * Supports keyboard navigation and fuzzy filtering.
 */

import { useEffect, useRef } from 'react'
import { File, Folder } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  extension?: string
}

interface FilePopoverProps {
  visible: boolean
  filter: string
  items: FileItem[]
  selectedIndex: number
  onSelect: (item: FileItem) => void
  onClose: () => void
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerQuery)

  if (matchIndex === -1) return text

  return (
    <>
      {text.slice(0, matchIndex)}
      <span className="text-primary font-medium">{text.slice(matchIndex, matchIndex + query.length)}</span>
      {text.slice(matchIndex + query.length)}
    </>
  )
}

export function FilePopover({
  visible, filter, items, selectedIndex, onSelect, onClose
}: FilePopoverProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!visible || items.length === 0) return null

  // Limit display to 20 items
  const displayItems = items.slice(0, 20)

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 z-50
                 w-80 max-h-60 overflow-hidden
                 rounded-lg border border-border bg-popover shadow-lg
                 flex flex-col"
    >
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
        {t('Files in workspace')}
        {filter && <span className="ml-2 text-primary">@{filter}</span>}
      </div>
      <div ref={listRef} className="overflow-y-auto py-1">
        {displayItems.map((item, index) => (
          <button
            key={item.path}
            ref={index === selectedIndex ? selectedRef : undefined}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left
              hover:bg-accent/50 transition-colors
              ${index === selectedIndex ? 'bg-accent' : ''}`}
            onClick={() => onSelect(item)}
            onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur
          >
            {item.isDirectory ? (
              <Folder size={14} className="text-muted-foreground shrink-0" />
            ) : (
              <File size={14} className="text-muted-foreground shrink-0" />
            )}
            <span className="font-mono text-xs truncate">
              {highlightMatch(item.path, filter)}
            </span>
          </button>
        ))}
        {items.length > 20 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground text-center">
            {t('{{count}} more files...', { count: items.length - 20 })}
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex gap-3">
        <span>↑↓ {t('Navigate')}</span>
        <span>↵ {t('Select')}</span>
        <span>esc {t('Close')}</span>
      </div>
    </div>
  )
}
