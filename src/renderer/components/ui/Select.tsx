import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
  disabled?: boolean
}

interface SelectProps<T extends string | number = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  variant?: 'default' | 'compact' | 'mini'
  className?: string
  placeholder?: string
  disabled?: boolean
  header?: string
  showCheck?: boolean
}

const triggerStyles = {
  default: 'w-full px-3 py-2 text-sm',
  compact: 'px-2.5 py-1.5 text-sm',
  mini: 'px-1.5 py-1 text-sm text-center'
}

export function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  variant = 'default',
  className,
  placeholder,
  disabled = false,
  header,
  showCheck = true
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [dropUp, setDropUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const selectedIndex = options.findIndex((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  // Calculate drop direction
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedHeight = Math.min(options.length * 36 + 8, 248)
    setDropUp(spaceBelow < estimatedHeight && rect.top > estimatedHeight)
  }, [isOpen, options.length])

  // Scroll highlighted option into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !dropdownRef.current) return
    const item = dropdownRef.current.children[highlightedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, highlightedIndex])

  const open = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [disabled, selectedIndex])

  const select = useCallback(
    (option: SelectOption<T>) => {
      if (option.disabled) return
      onChange(option.value)
      setIsOpen(false)
      triggerRef.current?.focus()
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (!isOpen) {
            open()
          } else if (highlightedIndex >= 0) {
            const option = options[highlightedIndex]
            if (option && !option.disabled) select(option)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (!isOpen) {
            open()
          } else {
            setHighlightedIndex((prev) => {
              let next = prev + 1
              while (next < options.length && options[next].disabled) next++
              return next < options.length ? next : prev
            })
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (!isOpen) {
            open()
          } else {
            setHighlightedIndex((prev) => {
              let next = prev - 1
              while (next >= 0 && options[next].disabled) next--
              return next >= 0 ? next : prev
            })
          }
          break
        case 'Home':
          if (isOpen) {
            e.preventDefault()
            const first = options.findIndex((o) => !o.disabled)
            if (first >= 0) setHighlightedIndex(first)
          }
          break
        case 'End':
          if (isOpen) {
            e.preventDefault()
            for (let i = options.length - 1; i >= 0; i--) {
              if (!options[i].disabled) {
                setHighlightedIndex(i)
                break
              }
            }
          }
          break
        case 'Escape':
          if (isOpen) {
            e.preventDefault()
            setIsOpen(false)
            triggerRef.current?.focus()
          }
          break
        case 'Tab':
          if (isOpen) setIsOpen(false)
          break
      }
    },
    [disabled, isOpen, highlightedIndex, options, open, select]
  )

  return (
    <div ref={containerRef} className={cn('relative', variant === 'default' && 'w-full')}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center justify-between gap-1 rounded-lg border',
          'focus:outline-none transition-all duration-200 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variant === 'compact'
            ? isOpen
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'text-muted-foreground border-border/60 hover:bg-muted hover:border-border hover:text-foreground'
            : 'bg-input border-border focus:ring-1 focus:ring-ring',
          triggerStyles[variant],
          className
        )}
      >
        <span className={cn('truncate font-normal', !selectedOption && 'text-muted-foreground')}>
          {selectedOption?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown
          className={cn(
            'flex-shrink-0 w-3.5 h-3.5 text-muted-foreground transition-transform ml-auto',
            isOpen && 'rotate-180',
            variant === 'mini' && 'w-3 h-3'
          )}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          className={cn(
            'absolute z-50 min-w-full py-1 bg-popover border border-border rounded-lg shadow-lg',
            'max-h-60 overflow-y-auto',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
            variant === 'mini' ? 'min-w-[5rem]' : ''
          )}
        >
          {header && (
            <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground/70 select-none">
              {header}
            </div>
          )}
          {options.map((option, index) => (
            <div
              key={String(option.value)}
              role="option"
              aria-selected={option.value === value}
              onClick={() => select(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors',
                option.value === value && 'text-primary font-medium',
                highlightedIndex === index && 'bg-accent text-accent-foreground',
                option.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {showCheck && (
                <Check
                  className={cn(
                    'flex-shrink-0 w-3.5 h-3.5',
                    option.value === value ? 'opacity-100' : 'opacity-0'
                  )}
                />
              )}
              <span className="truncate">{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
