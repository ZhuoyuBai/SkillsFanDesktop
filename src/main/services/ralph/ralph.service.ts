/**
 * Ralph Service
 * Core loop task management for autonomous AI agent execution
 */

import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type {
  RalphTask,
  UserStory,
  CreateTaskConfig,
  GenerateStoriesConfig,
  TaskUpdateEvent,
  StoryLogEvent
} from './types'
import {
  importPrdJson,
  createPrdJson,
  syncTaskToPrd,
  generateBranchName,
  generateNextStoryId
} from './prd-manager'
import { initializeProgress, appendProgress, appendError } from './progress-tracker'
import { executeStory, stopStoryExecution, extractCommitHash } from './story-executor'
import { buildStoryGenerationPrompt } from './prompts'

// ============================================
// State Management
// ============================================

// Current active task (only one task can run at a time)
let currentTask: RalphTask | null = null

// Main window reference for IPC
let mainWindow: BrowserWindow | null = null

// Task abort controller
let taskAbortController: AbortController | null = null

/**
 * Set the main window reference for IPC events
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

// ============================================
// Event Broadcasting
// ============================================

/**
 * Broadcast task update to renderer
 * Uses deep copy to ensure React detects changes when stories array is mutated
 */
function broadcastTaskUpdate(task: RalphTask): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Deep copy to ensure each broadcast creates a new object reference
    // This fixes the issue where rapid updates with the same object reference
    // would not trigger React re-renders
    const taskCopy = JSON.parse(JSON.stringify(task)) as RalphTask
    const event: TaskUpdateEvent = { task: taskCopy }
    mainWindow.webContents.send('ralph:task-update', event)
  }
}

/**
 * Broadcast story log to renderer
 */
function broadcastStoryLog(taskId: string, storyId: string, log: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const event: StoryLogEvent = { taskId, storyId, log }
    mainWindow.webContents.send('ralph:story-log', event)
  }
}

// ============================================
// Task Management
// ============================================

/**
 * Create a new Ralph task
 */
export async function createTask(config: CreateTaskConfig): Promise<RalphTask> {
  const {
    projectDir,
    description,
    stories,
    maxIterations,
    branchName
  } = config

  // Generate branch name if not provided
  const finalBranchName = branchName || generateBranchName(description)

  // Create task object
  const task: RalphTask = {
    id: uuidv4(),
    projectDir,
    branchName: finalBranchName,
    description,
    stories: stories.map((s, index) => ({
      ...s,
      status: 'pending' as const,
      priority: s.priority || index + 1
    })),
    status: 'idle',
    currentStoryIndex: -1,
    iteration: 0,
    maxIterations,
    createdAt: new Date().toISOString()
  }

  // Create prd.json in project directory
  await createPrdJson(task)

  // Initialize progress.txt
  await initializeProgress(task)

  console.log(`[Ralph] Task created: ${task.id}, ${task.stories.length} stories`)

  return task
}

/**
 * Start executing a Ralph task
 */
export async function startTask(taskId: string): Promise<void> {
  if (currentTask && currentTask.status === 'running') {
    throw new Error('Another task is already running')
  }

  // For now, we need the task to be created first
  // In a full implementation, we might load from storage
  if (!currentTask || currentTask.id !== taskId) {
    throw new Error(`Task ${taskId} not found`)
  }

  currentTask.status = 'running'
  currentTask.startedAt = new Date().toISOString()
  taskAbortController = new AbortController()

  broadcastTaskUpdate(currentTask)

  // Start the loop in the background
  runLoop(currentTask).catch((error) => {
    console.error(`[Ralph] Loop error:`, error)
    if (currentTask) {
      currentTask.status = 'failed'
      broadcastTaskUpdate(currentTask)
    }
  })
}

/**
 * Stop the current running task
 */
export async function stopTask(taskId: string): Promise<void> {
  if (!currentTask || currentTask.id !== taskId) {
    throw new Error(`Task ${taskId} not found or not running`)
  }

  if (taskAbortController) {
    taskAbortController.abort()
  }

  // Stop any executing story
  const runningStory = currentTask.stories.find((s) => s.status === 'running')
  if (runningStory) {
    await stopStoryExecution(runningStory.id)
    runningStory.status = 'pending' // Reset to pending, not failed
  }

  currentTask.status = 'paused'
  broadcastTaskUpdate(currentTask)

  console.log(`[Ralph] Task stopped: ${taskId}`)
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string): Promise<RalphTask | null> {
  if (currentTask && currentTask.id === taskId) {
    return currentTask
  }
  return null
}

/**
 * Get the current task (if any)
 */
export function getCurrentTask(): RalphTask | null {
  return currentTask
}

/**
 * Set the current task (used after creation)
 */
export function setCurrentTask(task: RalphTask): void {
  currentTask = task
}

// ============================================
// Loop Execution
// ============================================

/**
 * Main execution loop
 */
async function runLoop(task: RalphTask): Promise<void> {
  console.log(`[Ralph] Starting loop for task ${task.id}`)

  while (task.iteration < task.maxIterations) {
    // Check for abort
    if (taskAbortController?.signal.aborted) {
      console.log(`[Ralph] Task aborted`)
      break
    }

    // Find next pending story
    const story = findNextPendingStory(task)
    if (!story) {
      console.log(`[Ralph] All stories completed`)
      task.status = 'completed'
      task.completedAt = new Date().toISOString()
      broadcastTaskUpdate(task)
      break
    }

    // Update story status
    const storyIndex = task.stories.findIndex((s) => s.id === story.id)
    task.currentStoryIndex = storyIndex
    story.status = 'running'
    story.startedAt = new Date().toISOString()
    broadcastTaskUpdate(task)

    console.log(`[Ralph] Executing story ${story.id}: ${story.title}`)

    try {
      // Execute the story
      const startTime = Date.now()
      const signal = await executeStory(
        mainWindow,
        task,
        story,
        (log) => {
          broadcastStoryLog(task.id, story.id, log)
        }
      )

      // Calculate duration
      story.duration = Date.now() - startTime

      if (signal === 'STORY_FAILED') {
        story.status = 'failed'
        story.error = 'Story execution reported failure'
        await appendError(task.projectDir, story, story.error)
      } else {
        story.status = 'completed'
        story.completedAt = new Date().toISOString()

        // Try to extract commit hash from output
        // This would need access to the actual output
        // story.commitHash = extractCommitHash(output)

        await appendProgress(task.projectDir, story, {
          implemented: [`Completed ${story.title}`],
          learnings: []
        })
      }

      // Sync to prd.json
      await syncTaskToPrd(task)

      broadcastTaskUpdate(task)

      // Log COMPLETE signal but don't break - let findNextPendingStory decide when loop ends
      // This prevents Agent misreporting COMPLETE from skipping remaining stories
      if (signal === 'COMPLETE') {
        console.log(`[Ralph] Agent returned COMPLETE signal (ignored, using findNextPendingStory)`)
      }
    } catch (error) {
      const err = error as Error
      console.error(`[Ralph] Story ${story.id} failed:`, err.message)

      story.status = 'failed'
      story.error = err.message
      story.completedAt = new Date().toISOString()

      await appendError(task.projectDir, story, err.message)
      await syncTaskToPrd(task)

      broadcastTaskUpdate(task)

      // Continue to next story on error (don't abort entire task)
    }

    task.iteration++
    broadcastTaskUpdate(task)
  }

  // Check if we hit max iterations
  if (task.iteration >= task.maxIterations && task.status === 'running') {
    console.log(`[Ralph] Max iterations reached`)
    task.status = 'paused'
    broadcastTaskUpdate(task)
  }

  console.log(`[Ralph] Loop ended for task ${task.id}, status: ${task.status}`)
}

/**
 * Find the next pending story with highest priority
 */
function findNextPendingStory(task: RalphTask): UserStory | null {
  const pendingStories = task.stories
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.priority - b.priority)

  return pendingStories[0] || null
}

// ============================================
// Story Generation
// ============================================

/**
 * Generate user stories using AI
 * Calls the agent service with Ralph PRD format prompt
 */
export async function generateStories(config: GenerateStoriesConfig): Promise<UserStory[]> {
  const { projectDir, description } = config

  console.log(`[Ralph] Generating stories for: ${description}`)

  // Build the generation prompt with Ralph PRD rules
  const prompt = buildStoryGenerationPrompt(description, `Project: ${projectDir}`)

  // Dynamic import to avoid circular dependencies
  const { sendMessage } = await import('../agent')

  let fullOutput = ''
  const sessionId = `ralph-generate-${Date.now()}`

  // Promise to wait for completion
  let resolveGeneration: ((output: string) => void) | null = null
  let rejectGeneration: ((error: Error) => void) | null = null
  let timeoutId: NodeJS.Timeout | null = null

  const generationPromise = new Promise<string>((resolve, reject) => {
    resolveGeneration = resolve
    rejectGeneration = reject

    // 5 minute timeout for story generation
    timeoutId = setTimeout(() => {
      reject(new Error('Story generation timed out after 5 minutes'))
    }, 5 * 60 * 1000)
  })

  console.log(`[Ralph] Calling AI for story generation...`)

  // Call agent service with ralphMode for callbacks
  await sendMessage(mainWindow, {
    spaceId: '__ralph__',
    conversationId: sessionId,
    message: prompt,
    ralphMode: {
      enabled: true,
      projectDir: projectDir,
      onOutput: (content) => {
        fullOutput = content
      },
      onComplete: () => {
        if (timeoutId) clearTimeout(timeoutId)
        resolveGeneration?.(fullOutput)
      },
      onError: (error) => {
        if (timeoutId) clearTimeout(timeoutId)
        rejectGeneration?.(new Error(error))
      }
    }
  })

  // Wait for generation to complete
  const output = await generationPromise
  console.log(`[Ralph] AI output received, parsing stories...`)

  // Parse stories from AI output
  return parseStoriesFromOutput(output)
}

/**
 * Normalize JSON string by replacing smart/Chinese quotes with ASCII quotes
 * and cleaning up common formatting issues
 */
function normalizeJsonString(str: string): string {
  return str
    // Replace Chinese/smart double quotes with ASCII double quotes
    .replace(/[""「」『』]/g, '"')
    // Replace Chinese/smart single quotes with ASCII single quotes
    .replace(/['']/g, "'")
    // Remove any BOM or zero-width characters
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

/**
 * Extract JSON array from output using bracket matching
 * More robust than regex for nested structures
 */
function extractJsonArray(text: string): string | null {
  // Find the first '[' that starts an array
  const startIdx = text.indexOf('[')
  if (startIdx === -1) return null

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '[') {
      depth++
    } else if (char === ']') {
      depth--
      if (depth === 0) {
        return text.substring(startIdx, i + 1)
      }
    }
  }

  return null
}

/**
 * Parse user stories from AI output
 * Handles both raw JSON and JSON wrapped in markdown code blocks
 */
function parseStoriesFromOutput(output: string): UserStory[] {
  // First normalize the output
  let normalizedOutput = normalizeJsonString(output)

  // Try to find JSON array in output
  // First, try to find JSON wrapped in ```json ... ```
  let jsonMatch = normalizedOutput.match(/```json\s*([\s\S]*?)\s*```/)
  let jsonStr = jsonMatch ? jsonMatch[1] : null

  // If not found, try to find JSON wrapped in ``` ... ```
  if (!jsonStr) {
    jsonMatch = normalizedOutput.match(/```\s*([\s\S]*?)\s*```/)
    if (jsonMatch && jsonMatch[1].trim().startsWith('[')) {
      jsonStr = jsonMatch[1]
    }
  }

  // If still not found, use bracket matching to extract JSON array
  if (!jsonStr) {
    jsonStr = extractJsonArray(normalizedOutput)
  }

  if (!jsonStr) {
    console.error('[Ralph] Could not find JSON in output:', output.substring(0, 500))
    throw new Error('Failed to parse stories from AI output - no JSON array found')
  }

  // Normalize the extracted JSON string as well
  jsonStr = normalizeJsonString(jsonStr.trim())

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      throw new Error('Parsed result is not an array')
    }

    // Validate and transform to UserStory format
    const stories: UserStory[] = parsed.map((s: Record<string, unknown>, i: number) => ({
      id: (s.id as string) || `US-${String(i + 1).padStart(3, '0')}`,
      title: (s.title as string) || 'Untitled Story',
      description: (s.description as string) || '',
      acceptanceCriteria: ensureTypecheckCriteria((s.acceptanceCriteria as string[]) || []),
      priority: (s.priority as number) || i + 1,
      status: 'pending' as const,
      notes: (s.notes as string) || ''
    }))

    console.log(`[Ralph] Parsed ${stories.length} stories from AI output`)
    return stories
  } catch (error) {
    const err = error as Error
    console.error('[Ralph] Failed to parse JSON:', err.message)
    console.error('[Ralph] JSON string (first 500 chars):', jsonStr?.substring(0, 500))
    throw new Error(`Failed to parse stories JSON: ${err.message}`)
  }
}

/**
 * Ensure "Typecheck passes" criterion is present
 */
function ensureTypecheckCriteria(criteria: string[]): string[] {
  const hasTypecheck = criteria.some(
    (c) => c.toLowerCase().includes('typecheck') || c.toLowerCase().includes('type check')
  )
  if (!hasTypecheck) {
    return [...criteria, 'Typecheck passes']
  }
  return criteria
}

// ============================================
// PRD Import
// ============================================

/**
 * Import stories from existing prd.json
 */
export async function importFromPrd(projectDir: string): Promise<{
  description: string
  branchName: string
  stories: UserStory[]
}> {
  const { prd, stories } = await importPrdJson(projectDir)

  return {
    description: prd.description,
    branchName: prd.branchName,
    stories
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Add a story to the current task
 */
export function addStoryToTask(story: Omit<UserStory, 'id' | 'status'>): UserStory | null {
  if (!currentTask) return null

  const newStory: UserStory = {
    ...story,
    id: generateNextStoryId(currentTask.stories),
    status: 'pending'
  }

  currentTask.stories.push(newStory)
  broadcastTaskUpdate(currentTask)

  return newStory
}

/**
 * Update a story in the current task
 */
export function updateStoryInTask(storyId: string, updates: Partial<UserStory>): boolean {
  if (!currentTask) return false

  const storyIndex = currentTask.stories.findIndex((s) => s.id === storyId)
  if (storyIndex === -1) return false

  currentTask.stories[storyIndex] = {
    ...currentTask.stories[storyIndex],
    ...updates
  }

  broadcastTaskUpdate(currentTask)
  return true
}

/**
 * Remove a story from the current task
 */
export function removeStoryFromTask(storyId: string): boolean {
  if (!currentTask) return false

  const storyIndex = currentTask.stories.findIndex((s) => s.id === storyId)
  if (storyIndex === -1) return false

  currentTask.stories.splice(storyIndex, 1)

  // Re-prioritize remaining stories
  currentTask.stories.forEach((s, i) => {
    s.priority = i + 1
  })

  broadcastTaskUpdate(currentTask)
  return true
}

/**
 * Reorder stories in the current task
 */
export function reorderStoriesInTask(fromIndex: number, toIndex: number): boolean {
  if (!currentTask) return false
  if (fromIndex < 0 || fromIndex >= currentTask.stories.length) return false
  if (toIndex < 0 || toIndex >= currentTask.stories.length) return false

  const [story] = currentTask.stories.splice(fromIndex, 1)
  currentTask.stories.splice(toIndex, 0, story)

  // Re-prioritize
  currentTask.stories.forEach((s, i) => {
    s.priority = i + 1
  })

  broadcastTaskUpdate(currentTask)
  return true
}

/**
 * Reset the service state (for testing)
 */
export function resetState(): void {
  if (taskAbortController) {
    taskAbortController.abort()
  }
  currentTask = null
  taskAbortController = null
}
