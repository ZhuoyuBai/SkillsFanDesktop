/**
 * ConfirmDialog - Shared confirmation dialog component
 *
 * Replaces native window.confirm() with an in-app styled dialog.
 * Supports danger/warning/info variants, keyboard shortcuts (ESC/Enter),
 * and click-outside-to-close.
 */

import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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

  const confirmButtonClass = {
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    info: 'bg-primary text-primary-foreground hover:bg-primary/90'
  }[variant]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-background border border-border rounded-lg w-full max-w-sm shadow-lg">
        <div className="p-4 space-y-3">
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {cancelLabel || t('Cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={cn('px-4 py-2 rounded-md transition-colors', confirmButtonClass)}
          >
            {confirmLabel || t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
