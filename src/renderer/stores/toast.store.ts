/**
 * Toast Store - Lightweight notification system
 */

import { create } from 'zustand'

let toastId = 0

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (message: string, type?: ToastItem['type']) => void
  removeToast: (id: number) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, type = 'success') => {
    const id = ++toastId
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { id, message, type }]
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }))
    }, 3000)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  }
}))
