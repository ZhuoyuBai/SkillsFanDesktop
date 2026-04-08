import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  subValue?: string
  className?: string
}

export function StatCard({ icon: Icon, label, value, subValue, className }: StatCardProps) {
  return (
    <div className={cn('w-full rounded-lg border border-border/50 bg-accent/30 p-4', className)}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
      {subValue && (
        <div className="text-xs text-muted-foreground mt-1">{subValue}</div>
      )}
    </div>
  )
}
