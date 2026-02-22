/**
 * ConfirmDialog - Shared confirmation dialog component
 *
 * Replaces native window.confirm() with an in-app styled dialog.
 * Supports danger/warning/info variants, keyboard shortcuts (ESC/Enter),
 * and click-outside-to-close.
 */

import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        onConfirm()
      }
    },
    [isOpen, onCancel, onConfirm]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  const iconConfig = {
    danger: {
      Icon: AlertTriangle,
      bg: 'bg-destructive/10',
      color: 'text-destructive'
    },
    warning: {
      Icon: AlertTriangle,
      bg: 'bg-warning/10',
      color: 'text-warning'
    },
    info: {
      Icon: Info,
      bg: 'bg-primary/10',
      color: 'text-primary'
    }
  }[variant]

  const confirmButtonClass = {
    danger: 'bg-destructive/90 hover:bg-destructive text-destructive-foreground',
    warning: 'bg-warning/90 hover:bg-warning text-warning-foreground',
    info: 'bg-primary/90 hover:bg-primary text-primary-foreground'
  }[variant]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-sm animate-fade-in shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
              iconConfig.bg,
              iconConfig.color
            )}
          >
            <iconConfig.Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 pt-1">
            <h3 className="text-lg font-semibold text-foreground/95 tracking-tight">{title}</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-line mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
          >
            {cancelLabel || t('Cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all',
              confirmButtonClass
            )}
          >
            {confirmLabel || t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
