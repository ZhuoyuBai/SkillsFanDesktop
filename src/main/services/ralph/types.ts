/**
 * Ralph Loop Task Types
 * Defines all types for the autonomous AI agent loop system
 */

// User Story status
export type StoryStatus = 'pending' | 'running' | 'completed' | 'failed'

// Ralph Task status
export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

/**
 * A single user story in the PRD
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
  commitHash?: string // commit hash after completion
  error?: string // error message if failed
  // Quality gate toggles (default: false)
  requireTypecheck?: boolean
  requireTests?: boolean
}

/**
 * A Ralph loop task containing multiple user stories
 */
export interface RalphTask {
  id: string
  projectDir: string // project directory path
  branchName: string // git branch name (ralph/feature-name)
  description: string // feature description
  stories: UserStory[]
  status: TaskStatus
  currentStoryIndex: number // index of currently executing story
  iteration: number // current iteration count
  maxIterations: number // maximum iterations allowed
  createdAt: string
  startedAt?: string
  completedAt?: string
}

/**
 * Configuration for creating a new Ralph task
 */
export interface CreateTaskConfig {
  projectDir: string
  description: string
  stories: UserStory[]
  maxIterations: number
  branchName?: string // optional, auto-generated if not provided
}

/**
 * Configuration for AI story generation
 */
export interface GenerateStoriesConfig {
  projectDir: string
  description: string
}

/**
 * prd.json file format (compatible with original Ralph)
 */
export interface PrdJson {
  project: string
  branchName: string
  description: string
  userStories: PrdUserStory[]
}

/**
 * User story format in prd.json
 */
export interface PrdUserStory {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  passes: boolean // true = completed
  notes: string
  // Quality gate toggles (optional, for backwards compatibility with old prd.json)
  requireTypecheck?: boolean
  requireTests?: boolean
}

/**
 * Progress entry for progress.txt
 */
export interface ProgressEntry {
  timestamp: string
  storyId: string
  implemented: string[]
  filesChanged: string[]
  learnings: string[]
}

/**
 * Event data for task update broadcasts
 */
export interface TaskUpdateEvent {
  task: RalphTask
}

/**
 * Event data for story log broadcasts
 */
export interface StoryLogEvent {
  taskId: string
  storyId: string
  log: string
}

/**
 * Agent request for Ralph mode
 */
export interface RalphAgentRequest {
  spaceId: string // '__ralph__' for Ralph tasks
  conversationId: string // 'ralph-{taskId}-{storyId}'
  message: string
  workingDirectory: string
  isRalphMode: true
  systemPromptAppend?: string
}

/**
 * Completion signal types from agent output
 */
export type CompletionSignal = 'STORY_DONE' | 'COMPLETE' | 'STORY_FAILED'
