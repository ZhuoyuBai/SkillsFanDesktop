/**
 * Loop Task Store - State management for loop tasks
 *
 * Manages loop task list per space, task selection, and editing state.
 * Uses the same patterns as chat.store.ts for consistency.
 */

import { create } from 'zustand'
import { api } from '../api'
import type {
  LoopTask,
  LoopTaskMeta,
  UserStory,
  TaskSource,
  CreateLoopTaskConfig,
  WizardStep,
  CreateMethod
} from '../../shared/types/loop-task'

// Re-export types for convenience
export type { LoopTask, LoopTaskMeta, UserStory, TaskSource, WizardStep, CreateMethod }

// ============================================
// Types
// ============================================

interface SpaceTaskState {
  tasks: LoopTaskMeta[]
  currentTaskId: string | null
}

interface LoopTaskState {
  // Per-space task states
  spaceStates: Map<string, SpaceTaskState>

  // Task cache (full tasks loaded on demand)
  taskCache: Map<string, LoopTask>

  // Current space ID (synced with chat store)
  currentSpaceId: string | null

  // Execution log
  executionLog: string

  // Loading states
  isLoading: boolean
  isCreating: boolean

  // Editing state (for new/edit task form)
  editingTask: Partial<LoopTask> | null
  isEditing: boolean

  // Wizard state (for new task creation flow)
  wizardStep: WizardStep
  createMethod: CreateMethod | null
  aiDescription: string
  generatedPrdPath: string | null

  // Error state
  error: string | null

  // Actions - Space
  setCurrentSpace: (spaceId: string) => void

  // Actions - Task list
  loadTasks: (spaceId: string) => Promise<void>
  getTasks: () => LoopTaskMeta[]
  getCurrentTaskId: () => string | null

  // Actions - Task selection
  selectTask: (taskId: string | null) => Promise<void>
  getCurrentTask: () => LoopTask | null

  // Actions - Task CRUD
  createTask: (spaceId: string, config: CreateLoopTaskConfig) => Promise<LoopTask>
  updateTask: (spaceId: string, taskId: string, updates: Partial<LoopTask>) => Promise<void>
  renameTask: (spaceId: string, taskId: string, name: string) => Promise<void>
  deleteTask: (spaceId: string, taskId: string) => Promise<void>

  // Actions - Story management
  addStory: (
    spaceId: string,
    taskId: string,
    story: Omit<UserStory, 'id' | 'status'>
  ) => Promise<UserStory | null>
  updateStory: (
    spaceId: string,
    taskId: string,
    storyId: string,
    updates: Partial<UserStory>
  ) => Promise<void>
  removeStory: (spaceId: string, taskId: string, storyId: string) => Promise<void>
  reorderStories: (spaceId: string, taskId: string, fromIndex: number, toIndex: number) => Promise<void>

  // Actions - Editing
  startEditing: (task?: Partial<LoopTask>) => void
  updateEditing: (updates: Partial<LoopTask>) => void
  cancelEditing: () => void

  // Actions - Wizard
  setWizardStep: (step: WizardStep) => void
  setCreateMethod: (method: CreateMethod | null) => void
  setAiDescription: (desc: string) => void
  setGeneratedPrdPath: (path: string | null) => void
  resetWizard: () => void

  // Actions - Execution log
  appendLog: (log: string) => void
  clearLog: () => void

  // Actions - Error
  setError: (error: string | null) => void
  clearError: () => void

  // Actions - Task update from backend
  handleTaskUpdate: (task: LoopTask) => void
}

// ============================================
// Store
// ============================================

export const useLoopTaskStore = create<LoopTaskState>((set, get) => ({
  // Initial state
  spaceStates: new Map(),
  taskCache: new Map(),
  currentSpaceId: null,
  executionLog: '',
  isLoading: false,
  isCreating: false,
  editingTask: null,
  isEditing: false,
  wizardStep: 1 as WizardStep,
  createMethod: null,
  aiDescription: '',
  generatedPrdPath: null,
  error: null,

  // Set current space
  setCurrentSpace: (spaceId) => {
    set({ currentSpaceId: spaceId })

    // Initialize space state if not exists
    const state = get()
    if (!state.spaceStates.has(spaceId)) {
      const newStates = new Map(state.spaceStates)
      newStates.set(spaceId, { tasks: [], currentTaskId: null })
      set({ spaceStates: newStates })
    }
  },

  // Load tasks for a space
  loadTasks: async (spaceId) => {
    set({ isLoading: true, error: null })

    try {
      const result = await api.loopTaskList(spaceId)

      if (result.success && result.data) {
        const tasks = result.data as LoopTaskMeta[]
        const newStates = new Map(get().spaceStates)
        const currentState = newStates.get(spaceId) || { tasks: [], currentTaskId: null }
        newStates.set(spaceId, { ...currentState, tasks })
        set({ spaceStates: newStates, isLoading: false })
      } else {
        set({ error: result.error || 'Failed to load tasks', isLoading: false })
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  // Get tasks for current space
  getTasks: () => {
    const state = get()
    if (!state.currentSpaceId) return []
    const spaceState = state.spaceStates.get(state.currentSpaceId)
    return spaceState?.tasks || []
  },

  // Get current task ID
  getCurrentTaskId: () => {
    const state = get()
    if (!state.currentSpaceId) return null
    const spaceState = state.spaceStates.get(state.currentSpaceId)
    return spaceState?.currentTaskId || null
  },

  // Select a task
  selectTask: async (taskId) => {
    const state = get()
    if (!state.currentSpaceId) return

    // Update selection
    const newStates = new Map(state.spaceStates)
    const currentState = newStates.get(state.currentSpaceId)
    if (currentState) {
      newStates.set(state.currentSpaceId, { ...currentState, currentTaskId: taskId })
      set({ spaceStates: newStates })
    }

    // Load full task if not in cache
    if (taskId && !state.taskCache.has(taskId)) {
      try {
        const result = await api.loopTaskGet(state.currentSpaceId, taskId)
        if (result.success && result.data) {
          const newCache = new Map(get().taskCache)
          newCache.set(taskId, result.data as LoopTask)
          set({ taskCache: newCache })
        }
      } catch (error) {
        console.error('[LoopTaskStore] Failed to load task:', error)
      }
    }
  },

  // Get current task (full)
  getCurrentTask: () => {
    const state = get()
    const taskId = state.getCurrentTaskId()
    if (!taskId) return null
    return state.taskCache.get(taskId) || null
  },

  // Create a new task
  createTask: async (spaceId, config) => {
    set({ isCreating: true, error: null })

    try {
      const result = await api.loopTaskCreate(spaceId, config)

      if (result.success && result.data) {
        const task = result.data as LoopTask

        // Add to list
        const newStates = new Map(get().spaceStates)
        const currentState = newStates.get(spaceId) || { tasks: [], currentTaskId: null }
        const meta: LoopTaskMeta = {
          id: task.id,
          spaceId: task.spaceId,
          name: task.name,
          projectDir: task.projectDir,
          status: task.status,
          storyCount: task.storyCount,
          completedCount: task.completedCount,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          ...(task.model && { model: task.model }),
          ...(task.modelSource && { modelSource: task.modelSource })
        }
        newStates.set(spaceId, {
          tasks: [meta, ...currentState.tasks],
          currentTaskId: task.id
        })

        // Add to cache
        const newCache = new Map(get().taskCache)
        newCache.set(task.id, task)

        set({
          spaceStates: newStates,
          taskCache: newCache,
          isCreating: false,
          editingTask: null,
          isEditing: false
        })

        return task
      } else {
        throw new Error(result.error || 'Failed to create task')
      }
    } catch (error) {
      set({ error: (error as Error).message, isCreating: false })
      throw error
    }
  },

  // Update a task
  updateTask: async (spaceId, taskId, updates) => {
    try {
      const result = await api.loopTaskUpdate(spaceId, taskId, updates)

      if (result.success && result.data) {
        const task = result.data as LoopTask

        // Update cache
        const newCache = new Map(get().taskCache)
        newCache.set(taskId, task)

        // Update list metadata
        const newStates = new Map(get().spaceStates)
        const currentState = newStates.get(spaceId)
        if (currentState) {
          const meta: LoopTaskMeta = {
            id: task.id,
            spaceId: task.spaceId,
            name: task.name,
            projectDir: task.projectDir,
            status: task.status,
            storyCount: task.storyCount,
            completedCount: task.completedCount,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            ...(task.model && { model: task.model }),
            ...(task.modelSource && { modelSource: task.modelSource })
          }
          newStates.set(spaceId, {
            ...currentState,
            tasks: currentState.tasks.map((t) => (t.id === taskId ? meta : t))
          })
        }

        set({ spaceStates: newStates, taskCache: newCache })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  // Rename a task
  renameTask: async (spaceId, taskId, name) => {
    try {
      const result = await api.loopTaskRename(spaceId, taskId, name)

      if (result.success && result.data) {
        const task = result.data as LoopTask

        // Update cache
        const newCache = new Map(get().taskCache)
        newCache.set(taskId, task)

        // Update list
        const newStates = new Map(get().spaceStates)
        const currentState = newStates.get(spaceId)
        if (currentState) {
          newStates.set(spaceId, {
            ...currentState,
            tasks: currentState.tasks.map((t) => (t.id === taskId ? { ...t, name } : t))
          })
        }

        set({ spaceStates: newStates, taskCache: newCache })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  // Delete a task (optimistic update - immediate UI removal, background API call)
  deleteTask: async (spaceId, taskId) => {
    // Save current state for potential rollback
    const previousStates = new Map(get().spaceStates)
    const previousCache = new Map(get().taskCache)
    const currentState = previousStates.get(spaceId)
    const deletedTask = previousCache.get(taskId)
    const deletedMeta = currentState?.tasks.find((t) => t.id === taskId)

    // Optimistic update - immediately remove from UI
    const newCache = new Map(get().taskCache)
    newCache.delete(taskId)

    const newStates = new Map(get().spaceStates)
    if (currentState) {
      const newTasks = currentState.tasks.filter((t) => t.id !== taskId)
      const newCurrentId =
        currentState.currentTaskId === taskId
          ? newTasks[0]?.id || null
          : currentState.currentTaskId
      newStates.set(spaceId, {
        tasks: newTasks,
        currentTaskId: newCurrentId
      })
    }

    set({ spaceStates: newStates, taskCache: newCache })

    // Helper to rollback using the captured spaceId (not current space which may have changed)
    const rollback = (errorMsg: string) => {
      if (deletedMeta && deletedTask) {
        const rollbackStates = new Map(get().spaceStates)
        const rollbackState = rollbackStates.get(spaceId)
        if (rollbackState) {
          // Only rollback if the task isn't already back in the list
          const alreadyExists = rollbackState.tasks.some((t) => t.id === taskId)
          if (!alreadyExists) {
            rollbackStates.set(spaceId, {
              tasks: [deletedMeta, ...rollbackState.tasks],
              currentTaskId: rollbackState.currentTaskId
            })
          }
        } else {
          // Space state was removed (e.g., user switched spaces) — recreate it
          rollbackStates.set(spaceId, {
            tasks: [deletedMeta],
            currentTaskId: null
          })
        }
        const rollbackCache = new Map(get().taskCache)
        rollbackCache.set(taskId, deletedTask)
        set({
          spaceStates: rollbackStates,
          taskCache: rollbackCache,
          error: errorMsg
        })
      }
    }

    // Background API call
    try {
      const result = await api.loopTaskDelete(spaceId, taskId)

      if (!result.success) {
        console.error('[LoopTaskStore] Delete failed, rolling back:', result.error)
        rollback(result.error || 'Failed to delete task')
      }
    } catch (error) {
      console.error('[LoopTaskStore] Delete error, rolling back:', error)
      rollback((error as Error).message)
    }
  },

  // Add a story
  addStory: async (spaceId, taskId, story) => {
    try {
      const result = await api.loopTaskAddStory(spaceId, taskId, story)

      if (result.success && result.data) {
        // Reload task to get updated stories
        const taskResult = await api.loopTaskGet(spaceId, taskId)
        if (taskResult.success && taskResult.data) {
          const newCache = new Map(get().taskCache)
          newCache.set(taskId, taskResult.data as LoopTask)
          set({ taskCache: newCache })
        }
        return result.data as UserStory
      }
      return null
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  // Update a story
  updateStory: async (spaceId, taskId, storyId, updates) => {
    try {
      await api.loopTaskUpdateStory(spaceId, taskId, storyId, updates)

      // Reload task to get updated stories
      const taskResult = await api.loopTaskGet(spaceId, taskId)
      if (taskResult.success && taskResult.data) {
        const newCache = new Map(get().taskCache)
        newCache.set(taskId, taskResult.data as LoopTask)
        set({ taskCache: newCache })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  // Remove a story
  removeStory: async (spaceId, taskId, storyId) => {
    try {
      await api.loopTaskRemoveStory(spaceId, taskId, storyId)

      // Reload task
      const taskResult = await api.loopTaskGet(spaceId, taskId)
      if (taskResult.success && taskResult.data) {
        const newCache = new Map(get().taskCache)
        newCache.set(taskId, taskResult.data as LoopTask)
        set({ taskCache: newCache })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  // Reorder stories
  reorderStories: async (spaceId, taskId, fromIndex, toIndex) => {
    try {
      await api.loopTaskReorderStories(spaceId, taskId, fromIndex, toIndex)

      // Reload task
      const taskResult = await api.loopTaskGet(spaceId, taskId)
      if (taskResult.success && taskResult.data) {
        const newCache = new Map(get().taskCache)
        newCache.set(taskId, taskResult.data as LoopTask)
        set({ taskCache: newCache })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  // Start editing (new or existing)
  startEditing: (task) => {
    set({
      editingTask: task || {
        projectDir: '',
        description: '',
        source: 'generate' as TaskSource,
        stories: [],
        maxIterations: 10
      },
      isEditing: true
    })
  },

  // Update editing state
  updateEditing: (updates) => {
    const current = get().editingTask
    if (current) {
      set({ editingTask: { ...current, ...updates } })
    }
  },

  // Cancel editing
  cancelEditing: () => {
    set({
      editingTask: null,
      isEditing: false,
      wizardStep: 1 as WizardStep,
      createMethod: null,
      aiDescription: '',
      generatedPrdPath: null
    })
  },

  // Set wizard step
  setWizardStep: (step) => {
    set({ wizardStep: step })
  },

  // Set creation method
  setCreateMethod: (method) => {
    set({ createMethod: method })
  },

  // Set AI description
  setAiDescription: (desc) => {
    set({ aiDescription: desc })
  },

  // Set generated prd path
  setGeneratedPrdPath: (path) => {
    set({ generatedPrdPath: path })
  },

  // Reset wizard to initial state
  resetWizard: () => {
    set({
      wizardStep: 1 as WizardStep,
      createMethod: null,
      aiDescription: '',
      generatedPrdPath: null,
      editingTask: null,
      isEditing: false
    })
  },

  // Append to execution log (with size limit to prevent memory leak)
  appendLog: (log) => {
    const MAX_LOG_LENGTH = 500000 // ~500KB limit
    set((state) => {
      let newLog = state.executionLog + log + '\n'
      // Truncate old logs if exceeds limit
      if (newLog.length > MAX_LOG_LENGTH) {
        // Keep the last 80% of the limit
        const keepFrom = newLog.length - Math.floor(MAX_LOG_LENGTH * 0.8)
        const newlineIndex = newLog.indexOf('\n', keepFrom)
        newLog = '... (earlier logs truncated) ...\n' + newLog.slice(newlineIndex + 1)
      }
      return { executionLog: newLog }
    })
  },

  // Clear execution log
  clearLog: () => {
    set({ executionLog: '' })
  },

  // Set error
  setError: (error) => set({ error }),

  // Clear error
  clearError: () => set({ error: null }),

  // Handle task update from backend (via IPC event)
  handleTaskUpdate: (task) => {
    const state = get()

    // Update cache
    const newCache = new Map(state.taskCache)
    newCache.set(task.id, task)

    // Update list metadata
    const newStates = new Map(state.spaceStates)
    const currentState = newStates.get(task.spaceId)
    if (currentState) {
      const meta: LoopTaskMeta = {
        id: task.id,
        spaceId: task.spaceId,
        name: task.name,
        projectDir: task.projectDir,
        status: task.status,
        storyCount: task.storyCount,
        completedCount: task.completedCount,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(task.model && { model: task.model }),
        ...(task.modelSource && { modelSource: task.modelSource })
      }
      const taskExists = currentState.tasks.some((t) => t.id === task.id)
      if (taskExists) {
        newStates.set(task.spaceId, {
          ...currentState,
          tasks: currentState.tasks.map((t) => (t.id === task.id ? meta : t))
        })
      }
    }

    set({ spaceStates: newStates, taskCache: newCache })
  }
}))

// ============================================
// Selectors
// ============================================

/**
 * Get completed story count
 */
export function getCompletedCount(task: LoopTask | null): number {
  if (!task) return 0
  return task.stories.filter((s) => s.status === 'completed').length
}

/**
 * Get progress percentage
 */
export function getProgressPercent(task: LoopTask | null): number {
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
