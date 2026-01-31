/**
 * Ralph Module - Public API
 *
 * This module provides the autonomous AI agent loop functionality.
 * It manages loop tasks with multiple user stories, executing them
 * sequentially using the Agent service.
 *
 * Module Structure:
 * - types.ts           - Type definitions
 * - prompts.ts         - Ralph prompt templates
 * - prd-manager.ts     - prd.json file management
 * - progress-tracker.ts - progress.txt management
 * - story-executor.ts  - Individual story execution
 * - ralph.service.ts   - Core loop management
 */

// ============================================
// Type Exports
// ============================================

export type {
  StoryStatus,
  TaskStatus,
  UserStory,
  RalphTask,
  CreateTaskConfig,
  GenerateStoriesConfig,
  PrdJson,
  PrdUserStory,
  ProgressEntry,
  TaskUpdateEvent,
  StoryLogEvent,
  RalphAgentRequest,
  CompletionSignal
} from './types'

// ============================================
// Service Functions
// ============================================

export {
  // Task management
  createTask,
  startTask,
  stopTask,
  getTask,
  getCurrentTask,
  setCurrentTask,
  setMainWindow,

  // Story generation and import
  generateStories,
  importFromPrd,

  // Story manipulation
  addStoryToTask,
  updateStoryInTask,
  removeStoryFromTask,
  reorderStoriesInTask,

  // Testing
  resetState
} from './ralph.service'

// ============================================
// PRD Management
// ============================================

export {
  prdExists,
  readPrdJson,
  writePrdJson,
  importPrdJson,
  createPrdJson,
  syncTaskToPrd,
  generateBranchName,
  generateNextStoryId
} from './prd-manager'

// ============================================
// Progress Tracking
// ============================================

export {
  progressExists,
  readProgress,
  initializeProgress,
  appendProgress,
  appendError,
  parseProgress,
  getCodebasePatterns
} from './progress-tracker'

// ============================================
// Story Execution
// ============================================

export {
  executeStory,
  stopStoryExecution,
  isStoryExecuting,
  getStoryOutput,
  extractCommitHash
} from './story-executor'

// ============================================
// Prompts
// ============================================

export { RALPH_SYSTEM_PROMPT, buildIterationPrompt, buildStoryGenerationPrompt } from './prompts'
