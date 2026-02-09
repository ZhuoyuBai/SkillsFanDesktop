/**
 * Loop Task Types
 * Shared types for loop task management across main and renderer processes
 */

// Story status
export type StoryStatus = 'pending' | 'running' | 'completed' | 'failed'

// Task status
export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

// Task source
export type TaskSource = 'import' | 'generate' | 'manual'

// Wizard step for task creation flow
export type WizardStep = 1 | 2 | 3 | 4

// Creation method for wizard step 1
export type CreateMethod = 'ai' | 'manual' | 'import'

/**
 * A single user story in the task
 */
export interface UserStory {
  id: string // US-001 format
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  status: StoryStatus
  notes: string
  startedAt?: string
  completedAt?: string
  duration?: number // milliseconds
  commitHash?: string
  error?: string
  // Quality gate toggles (default: false)
  requireTypecheck?: boolean
  requireTests?: boolean
  // Per-story model override (falls back to task-level model)
  model?: string
  modelSource?: string
}

/**
 * Lightweight metadata for task list display
 */
export interface LoopTaskMeta {
  id: string
  spaceId: string
  name: string // task name (editable)
  projectDir: string
  status: TaskStatus
  storyCount: number
  completedCount: number
  createdAt: string
  updatedAt: string
  model?: string // AI model override for this task (e.g. 'claude-sonnet-4-5-20250929')
  modelSource?: string // AI source/provider for this task (e.g. 'skillsfan-credits', 'deepseek')
}

/**
 * Full loop task with all details
 */
export interface LoopTask extends LoopTaskMeta {
  branchName: string
  description: string
  source: TaskSource
  stories: UserStory[]
  currentStoryIndex: number
  iteration: number
  maxIterations: number
  startedAt?: string
  completedAt?: string
}

/**
 * Configuration for creating a new loop task
 */
export interface CreateLoopTaskConfig {
  name?: string
  projectDir: string
  description: string
  source: TaskSource
  stories: UserStory[]
  maxIterations: number
  branchName?: string
  model?: string // AI model override for this task
  modelSource?: string // AI source/provider for this task
}

/**
 * Index file structure for task list
 */
export interface LoopTaskIndex {
  version: number
  updatedAt: string
  tasks: LoopTaskMeta[]
}

/**
 * Event data for task update broadcasts
 */
export interface TaskUpdateEvent {
  task: LoopTask
}

/**
 * Event data for story log broadcasts
 */
export interface StoryLogEvent {
  taskId: string
  storyId: string
  log: string
}
