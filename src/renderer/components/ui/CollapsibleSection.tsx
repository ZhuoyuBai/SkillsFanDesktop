/**
 * CollapsibleSection - Reusable collapsible container with smooth animation
 * Used by TodoCard and InlineActivity for expand/collapse functionality
 */

import { ReactNode } from 'react'
import { ChevronDown, LucideIcon } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon: LucideIcon
  badge?: ReactNode
  isCollapsed: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  isCollapsed,
  onToggle,
  children,
  className = ''
}: CollapsibleSectionProps) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card/50 overflow-hidden ${className}`}>
      {/* Header - always visible */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 ${
              isCollapsed ? '-rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {/* Collapsible content */}
      <div
        className={`
          transition-all duration-200 ease-out overflow-hidden
          ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}
        `}
      >
        {children}
      </div>
    </div>
  )
}
