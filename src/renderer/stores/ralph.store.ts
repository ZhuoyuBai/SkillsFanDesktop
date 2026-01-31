/**
 * Ralph Store - Loop task state management
 */

import { create } from 'zustand'

// ============================================
// Types (mirror of backend types for frontend)
// ============================================

export type StoryStatus = 'pending' | 'running' | 'completed' | 'failed'
export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type RalphView = 'setup' | 'stories' | 'progress'
export type TaskSource = 'import' | 'generate' | 'manual'

export interface UserStory {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  status: StoryStatus
  notes: string
  startedAt?: string
  completedAt?: string
  duration?: number
  commitHash?: string
  error?: string
}

export interface RalphTask {
  id: string
  projectDir: string
  branchName: string
  description: string
  stories: UserStory[]
  status: TaskStatus
  currentStoryIndex: number
  iteration: number
  maxIterations: number
  createdAt: string
  startedAt?: string
  completedAt?: string
}

// ============================================
// Store State
// ============================================

interface RalphState {
  // View state (internal to Ralph page)
  view: RalphView
  setView: (view: RalphView) => void

  // Task configuration (setup phase)
  projectDir: string
  setProjectDir: (dir: string) => void
  description: string
  setDescription: (desc: string) => void
  source: TaskSource
  setSource: (source: TaskSource) => void
  maxIterations: number
  setMaxIterations: (n: number) => void
  branchName: string
  setBranchName: (name: string) => void

  // Stories list (edit phase)
  stories: UserStory[]
  setStories: (stories: UserStory[]) => void
  addStory: (story: Omit<UserStory, 'id' | 'status'>) => void
  updateStory: (id: string, updates: Partial<UserStory>) => void
  removeStory: (id: string) => void
  reorderStories: (fromIndex: number, toIndex: number) => void

  // Execution state
  currentTask: RalphTask | null
  setCurrentTask: (task: RalphTask | null) => void
  currentLog: string
  appendLog: (log: string) => void
  clearLog: () => void

  // Loading states
  isGenerating: boolean
  setIsGenerating: (generating: boolean) => void
  isImporting: boolean
  setIsImporting: (importing: boolean) => void

  // Error state
  error: string | null
  setError: (error: string | null) => void

  // Reset all state
  reset: () => void
}

// ============================================
// Initial State
// ============================================

const initialState = {
  view: 'setup' as RalphView,
  projectDir: '',
  description: '',
  source: 'generate' as TaskSource,
  maxIterations: 10,
  branchName: '',
  stories: [] as UserStory[],
  currentTask: null as RalphTask | null,
  currentLog: '',
  isGenerating: false,
  isImporting: false,
  error: null as string | null
}

// ============================================
// Store
// ============================================

export const useRalphStore = create<RalphState>((set, get) => ({
  ...initialState,

  // View
  setView: (view) => set({ view }),

  // Configuration
  setProjectDir: (projectDir) => set({ projectDir }),
  setDescription: (description) => set({ description }),
  setSource: (source) => set({ source }),
  setMaxIterations: (maxIterations) => set({ maxIterations }),
  setBranchName: (branchName) => set({ branchName }),

  // Stories
  setStories: (stories) => set({ stories }),

  addStory: (storyData) => {
    const stories = get().stories
    const maxId = stories.reduce((max, s) => {
      const match = s.id.match(/US-(\d+)/)
      return match ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)

    const newStory: UserStory = {
      ...storyData,
      id: `US-${String(maxId + 1).padStart(3, '0')}`,
      status: 'pending',
      priority: stories.length + 1
    }

    set({ stories: [...stories, newStory] })
  },

  updateStory: (id, updates) => {
    set((state) => ({
      stories: state.stories.map((s) => (s.id === id ? { ...s, ...updates } : s))
    }))
  },

  removeStory: (id) => {
    set((state) => {
      const newStories = state.stories.filter((s) => s.id !== id)
      // Re-prioritize
      return {
        stories: newStories.map((s, i) => ({ ...s, priority: i + 1 }))
      }
    })
  },

  reorderStories: (fromIndex, toIndex) => {
    set((state) => {
      const newStories = [...state.stories]
      const [moved] = newStories.splice(fromIndex, 1)
      newStories.splice(toIndex, 0, moved)
      // Re-prioritize
      return {
        stories: newStories.map((s, i) => ({ ...s, priority: i + 1 }))
      }
    })
  },

  // Execution
  setCurrentTask: (currentTask) => set({ currentTask }),

  appendLog: (log) => {
    set((state) => ({
      currentLog: state.currentLog + log + '\n'
    }))
  },

  clearLog: () => set({ currentLog: '' }),

  // Loading
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsImporting: (isImporting) => set({ isImporting }),

  // Error
  setError: (error) => set({ error }),

  // Reset
  reset: () => set(initialState)
}))

// ============================================
// Selectors
// ============================================

/**
 * Get completed story count
 */
export function getCompletedCount(task: RalphTask | null): number {
  if (!task) return 0
  return task.stories.filter((s) => s.status === 'completed').length
}

/**
 * Get progress percentage
 */
export function getProgressPercent(task: RalphTask | null): number {
  if (!task || task.stories.length === 0) return 0
  return Math.round((getCompletedCount(task) / task.stories.length) * 100)
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${remainingSeconds}s`
}
