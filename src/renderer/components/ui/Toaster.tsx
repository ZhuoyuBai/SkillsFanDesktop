/**
 * Toaster - Global toast notification component
 *
 * Renders toast notifications in the bottom-right corner.
 * Auto-dismisses after 3 seconds.
 */

import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../../stores/toast.store'
import { cn } from '../../lib/utils'

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-lg shadow-lg border backdrop-blur-sm min-w-[240px] max-w-[360px] animate-slide-in-right',
            'bg-background/95',
            toast.type === 'success' && 'border-l-[3px] border-l-success border-y-border border-r-border',
            toast.type === 'error' && 'border-l-[3px] border-l-destructive border-y-border border-r-border',
            toast.type === 'info' && 'border-l-[3px] border-l-primary border-y-border border-r-border'
          )}
        >
          {toast.type === 'success' && <CheckCircle2 size={16} className="text-success shrink-0" />}
          {toast.type === 'error' && <XCircle size={16} className="text-destructive shrink-0" />}
          {toast.type === 'info' && <Info size={16} className="text-primary shrink-0" />}
          <span className="text-sm text-foreground flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
