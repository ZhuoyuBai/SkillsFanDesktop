/**
 * Story Executor
 * Executes individual user stories using the Agent service
 */

import { BrowserWindow } from 'electron'
import type { RalphTask, UserStory, CompletionSignal } from './types'
import { RALPH_SYSTEM_PROMPT, buildIterationPrompt } from './prompts'

// Completion signal patterns to detect in agent output
const COMPLETION_PATTERNS = {
  STORY_DONE: /<promise>STORY_DONE<\/promise>/,
  COMPLETE: /<promise>COMPLETE<\/promise>/,
  STORY_FAILED: /<promise>STORY_FAILED<\/promise>/
}

// Store for tracking execution state
interface ExecutionState {
  isRunning: boolean
  currentOutput: string
  completionSignal: CompletionSignal | null
  error: string | null
  abortController: AbortController | null
}

const executionStates = new Map<string, ExecutionState>()

/**
 * Get or create execution state for a story
 */
function getExecutionState(storyId: string): ExecutionState {
  let state = executionStates.get(storyId)
  if (!state) {
    state = {
      isRunning: false,
      currentOutput: '',
      completionSignal: null,
      error: null,
      abortController: null
    }
    executionStates.set(storyId, state)
  }
  return state
}

/**
 * Clean up execution state for a story
 */
function cleanupExecutionState(storyId: string): void {
  const state = executionStates.get(storyId)
  if (state?.abortController) {
    state.abortController.abort()
  }
  executionStates.delete(storyId)
}

/**
 * Execute a single user story
 * Returns the completion signal or throws on error
 */
export async function executeStory(
  mainWindow: BrowserWindow | null,
  task: RalphTask,
  story: UserStory,
  onLog: (log: string) => void
): Promise<CompletionSignal> {
  const state = getExecutionState(story.id)

  if (state.isRunning) {
    throw new Error(`Story ${story.id} is already being executed`)
  }

  state.isRunning = true
  state.currentOutput = ''
  state.completionSignal = null
  state.error = null
  state.abortController = new AbortController()

  const sessionId = `ralph-${task.id}-${story.id}`

  try {
    // Dynamically import agent service to avoid circular dependencies
    const { sendMessage } = await import('../agent')

    // Build the iteration prompt
    const prompt = buildIterationPrompt(task, story)

    onLog(`[Ralph] Starting story ${story.id}: ${story.title}`)
    onLog(`[Ralph] Working directory: ${task.projectDir}`)
    onLog(`[Ralph] Branch: ${task.branchName}`)
    onLog('---')

    // Track if completion signal was detected
    let completionResolve: ((signal: CompletionSignal) => void) | null = null
    let completionReject: ((error: Error) => void) | null = null
    let timeoutId: NodeJS.Timeout | null = null

    // Create a promise that resolves when we detect a completion signal
    const completionPromise = new Promise<CompletionSignal>((resolve, reject) => {
      completionResolve = resolve
      completionReject = reject

      // Set a timeout for story execution (30 minutes)
      timeoutId = setTimeout(() => {
        reject(new Error('Story execution timed out after 30 minutes'))
      }, 30 * 60 * 1000)
    })

    // Check for completion signals in the output
    const checkForCompletion = (output: string) => {
      // Store full output
      state.currentOutput = output

      // Check for completion signals
      if (COMPLETION_PATTERNS.COMPLETE.test(output)) {
        state.completionSignal = 'COMPLETE'
        if (timeoutId) clearTimeout(timeoutId)
        completionResolve?.('COMPLETE')
      } else if (COMPLETION_PATTERNS.STORY_DONE.test(output)) {
        state.completionSignal = 'STORY_DONE'
        if (timeoutId) clearTimeout(timeoutId)
        completionResolve?.('STORY_DONE')
      } else if (COMPLETION_PATTERNS.STORY_FAILED.test(output)) {
        state.completionSignal = 'STORY_FAILED'
        if (timeoutId) clearTimeout(timeoutId)
        completionResolve?.('STORY_FAILED')
      }
    }

    onLog(`[Ralph] Executing story with Agent...`)

    // Call Agent service with Ralph mode
    await sendMessage(mainWindow, {
      spaceId: '__ralph__',           // Special Ralph spaceId
      conversationId: sessionId,
      message: prompt,
      ralphMode: {
        enabled: true,
        projectDir: task.projectDir,
        systemPromptAppend: RALPH_SYSTEM_PROMPT,
        onOutput: (content) => {
          // Log output (truncated for readability)
          const lastChunk = content.slice(-500)
          onLog(lastChunk)
          // Check for completion signal
          checkForCompletion(content)
        },
        onComplete: () => {
          // If no signal was detected by the time agent completes, use default
          if (!state.completionSignal) {
            onLog(`[Ralph] Agent completed without explicit signal, assuming STORY_DONE`)
            state.completionSignal = 'STORY_DONE'
            if (timeoutId) clearTimeout(timeoutId)
            completionResolve?.('STORY_DONE')
          }
        },
        onError: (error) => {
          state.error = error
          onLog(`[Ralph] Agent error: ${error}`)
          if (timeoutId) clearTimeout(timeoutId)
          completionReject?.(new Error(error))
        }
      }
    })

    // Wait for completion signal
    const signal = await completionPromise
    onLog(`[Ralph] Story ${story.id} completed with signal: ${signal}`)

    return signal
  } catch (error) {
    const err = error as Error
    state.error = err.message
    onLog(`[Ralph] Error executing story ${story.id}: ${err.message}`)
    throw error
  } finally {
    state.isRunning = false
    cleanupExecutionState(story.id)
  }
}

/**
 * Stop execution of a story
 */
export async function stopStoryExecution(storyId: string): Promise<void> {
  const state = executionStates.get(storyId)
  if (state?.abortController) {
    state.abortController.abort()
  }
  cleanupExecutionState(storyId)
}

/**
 * Check if a story is currently being executed
 */
export function isStoryExecuting(storyId: string): boolean {
  const state = executionStates.get(storyId)
  return state?.isRunning ?? false
}

/**
 * Get the current output of an executing story
 */
export function getStoryOutput(storyId: string): string {
  const state = executionStates.get(storyId)
  return state?.currentOutput ?? ''
}

/**
 * Extract commit hash from git output
 * Looks for patterns like "[main abc1234] commit message"
 */
export function extractCommitHash(output: string): string | undefined {
  // Match git commit output: [branch hash] message
  const match = output.match(/\[[\w/-]+\s+([a-f0-9]{7,40})\]/)
  if (match) {
    return match[1]
  }

  // Also try matching "commit: hash" pattern
  const commitMatch = output.match(/commit[:\s]+([a-f0-9]{7,40})/i)
  if (commitMatch) {
    return commitMatch[1]
  }

  return undefined
}

/**
 * Parse error information from agent output
 */
export function parseStoryError(output: string): string | undefined {
  // Look for common error patterns
  const errorPatterns = [
    /Error:\s*(.+?)(?:\n|$)/i,
    /FAILED:\s*(.+?)(?:\n|$)/i,
    /TypeError:\s*(.+?)(?:\n|$)/i,
    /Cannot\s+(.+?)(?:\n|$)/i
  ]

  for (const pattern of errorPatterns) {
    const match = output.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return undefined
}
