/**
 * CommandPopover - Slash command popup for / trigger
 *
 * Shows built-in commands and user skills when user types / in the input area.
 * Groups items into Commands (builtin) and Skills (external sources).
 * Supports keyboard navigation and fuzzy filtering.
 */

import { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from '../../i18n'

// Matches the backend SlashCommand type
interface CommandSource {
  kind: 'builtin' | 'project' | 'global' | 'skillsfan' | 'claude-skills' | 'agents-skills'
  dir?: string
}

export interface SlashCommand {
  name: string
  description: string
  type: 'immediate' | 'prompt' | 'skill'
  source: CommandSource
  content?: string
  filePath?: string
}

interface CommandPopoverProps {
  visible: boolean
  filter: string
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
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

function sourceIcon(source: CommandSource): string | null {
  switch (source.kind) {
    case 'builtin': return null
    case 'project': return '\ud83d\udccc'
    case 'global': return '\ud83c\udf10'
    case 'skillsfan': return '\u26a1'
    case 'claude-skills': return '\ud83e\udd16'
    case 'agents-skills': return '\ud83d\udd27'
  }
}

export function CommandPopover({
  visible, filter, commands, selectedIndex, onSelect, onClose
}: CommandPopoverProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Filter commands by name and description
  const { filteredBuiltin, filteredSkills, allFiltered } = useMemo(() => {
    const filterLower = filter.toLowerCase()

    const builtinCmds = commands.filter(c => c.source.kind === 'builtin')
    const skillCmds = commands.filter(c => c.source.kind !== 'builtin')

    const fb = filterLower
      ? builtinCmds.filter(c =>
          c.name.toLowerCase().includes(filterLower) ||
          c.description.toLowerCase().includes(filterLower)
        )
      : builtinCmds

    const fs = filterLower
      ? skillCmds.filter(c =>
          c.name.toLowerCase().includes(filterLower) ||
          c.description.toLowerCase().includes(filterLower)
        )
      : skillCmds

    return {
      filteredBuiltin: fb,
      filteredSkills: fs,
      allFiltered: [...fb, ...fs]
    }
  }, [commands, filter])

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!visible || allFiltered.length === 0) return null

  let flatIndex = 0

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 z-50
                 rounded-lg border border-border bg-popover shadow-lg
                 max-h-72 overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
        {filter
          ? <>{t('Commands')} <span className="ml-1 text-primary">/{filter}</span></>
          : t('Type to filter commands...')
        }
      </div>

      {/* Command list */}
      <div ref={listRef} className="overflow-y-auto py-1">
        {/* Commands group */}
        {filteredBuiltin.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('Commands')}
            </div>
            {filteredBuiltin.map(cmd => {
              const idx = flatIndex++
              return (
                <button
                  key={cmd.name}
                  ref={idx === selectedIndex ? selectedRef : undefined}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left
                    hover:bg-accent/50 transition-colors
                    ${idx === selectedIndex ? 'bg-accent' : ''}`}
                  onClick={() => onSelect(cmd)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className="font-mono text-xs text-primary font-medium w-28 shrink-0 truncate">
                    /{highlightMatch(cmd.name, filter)}
                  </span>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {t(cmd.description)}
                  </span>
                </button>
              )
            })}
          </>
        )}

        {/* Skills group */}
        {filteredSkills.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">
              {t('Skills')}
            </div>
            {filteredSkills.map(cmd => {
              const idx = flatIndex++
              const icon = sourceIcon(cmd.source)
              return (
                <button
                  key={`${cmd.source.kind}-${cmd.name}`}
                  ref={idx === selectedIndex ? selectedRef : undefined}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left
                    hover:bg-accent/50 transition-colors
                    ${idx === selectedIndex ? 'bg-accent' : ''}`}
                  onClick={() => onSelect(cmd)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className="font-mono text-xs text-primary font-medium w-28 shrink-0 truncate">
                    /{highlightMatch(cmd.name, filter)}
                  </span>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {t(cmd.description)}
                  </span>
                  {icon && (
                    <span className="text-xs shrink-0">{icon}</span>
                  )}
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Footer hints */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex gap-3">
        <span>&uarr;&darr; {t('Navigate')}</span>
        <span>&crarr; {t('Select')}</span>
        <span>esc {t('Close')}</span>
      </div>
    </div>
  )
}
