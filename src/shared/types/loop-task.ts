/**
 * Loop Task Types
 * Shared types for loop task management across main and renderer processes
 */

// Story status
export type StoryStatus = 'pending' | 'running' | 'completed' | 'failed'

// Task status
export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

// Schedule type for automated execution
export type ScheduleType = 'manual' | 'cron' | 'interval'

/**
 * Task schedule configuration
 */
export interface TaskSchedule {
  type: ScheduleType
  cronExpression?: string    // type='cron': e.g. '0 9 * * 1-5' = weekdays 9am
  intervalMs?: number        // type='interval': minimum 60000 (1 minute)
  timezone?: string          // Default: system timezone
  enabled: boolean
  lastScheduledAt?: string
  nextScheduledAt?: string
}

/**
 * Retry configuration with exponential backoff
 */
export interface RetryConfig {
  enabled: boolean
  maxRetries: number                       // Default 3
  initialBackoffMs: number                 // Default 30000 (30s)
  maxBackoffMs: number                     // Default 3600000 (1h)
  backoffMultiplier: number                // Default 2
  pauseAfterConsecutiveFailures: number    // Default 3
}

// Task source
export type TaskSource = 'import' | 'generate' | 'manual'

// Wizard step for task creation flow (3-step: Create → Plan → Execute)
export type WizardStep = 1 | 2 | 3

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
  retryCount?: number
  lastRetryAt?: string
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
  failedCount?: number
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
  // Scheduling (optional, backward compatible)
  schedule?: TaskSchedule
  retryConfig?: RetryConfig
  consecutiveFailures?: number
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
