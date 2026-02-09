/**
 * PRD Manager
 * Handles reading and writing prd.json files
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { PrdJson, PrdUserStory, RalphTask, UserStory } from './types'

const PRD_FILENAME = 'prd.json'

/**
 * Get the prd.json file path for a project
 */
export function getPrdPath(projectDir: string): string {
  return path.join(projectDir, PRD_FILENAME)
}

/**
 * Check if prd.json exists in the project directory
 */
export async function prdExists(projectDir: string): Promise<boolean> {
  try {
    await fs.access(getPrdPath(projectDir))
    return true
  } catch {
    return false
  }
}

/**
 * Read and parse prd.json from a project directory
 */
export async function readPrdJson(projectDir: string): Promise<PrdJson> {
  const prdPath = getPrdPath(projectDir)
  const content = await fs.readFile(prdPath, 'utf-8')
  const prd = JSON.parse(content) as PrdJson

  // Validate required fields
  if (!prd.project || !prd.branchName || !prd.userStories) {
    throw new Error('Invalid prd.json: missing required fields (project, branchName, userStories)')
  }

  return prd
}

/**
 * Read and parse prd.json from an absolute file path
 */
export async function readPrdJsonFromFile(filePath: string): Promise<PrdJson> {
  const content = await fs.readFile(filePath, 'utf-8')
  const prd = JSON.parse(content) as PrdJson

  // Validate required fields
  if (!prd.project || !prd.branchName || !prd.userStories) {
    throw new Error('Invalid prd.json: missing required fields (project, branchName, userStories)')
  }

  return prd
}

/**
 * Write prd.json to a project directory
 */
export async function writePrdJson(projectDir: string, prd: PrdJson): Promise<void> {
  const prdPath = getPrdPath(projectDir)
  const content = JSON.stringify(prd, null, 2)
  await fs.writeFile(prdPath, content, 'utf-8')
}

/**
 * Convert PrdUserStory to UserStory format
 */
export function prdStoryToUserStory(prdStory: PrdUserStory): UserStory {
  return {
    id: prdStory.id,
    title: prdStory.title,
    description: prdStory.description,
    acceptanceCriteria: prdStory.acceptanceCriteria,
    priority: prdStory.priority,
    status: prdStory.passes ? 'completed' : 'pending',
    notes: prdStory.notes || '',
    // Preserve quality gate settings (undefined for old prd.json format, treated as false)
    requireTypecheck: prdStory.requireTypecheck,
    requireTests: prdStory.requireTests
  }
}

/**
 * Convert UserStory to PrdUserStory format
 */
export function userStoryToPrdStory(story: UserStory): PrdUserStory {
  return {
    id: story.id,
    title: story.title,
    description: story.description,
    acceptanceCriteria: story.acceptanceCriteria,
    priority: story.priority,
    passes: story.status === 'completed',
    notes: story.notes || '',
    // Export quality gate settings
    requireTypecheck: story.requireTypecheck,
    requireTests: story.requireTests
  }
}

/**
 * Import prd.json and convert to RalphTask-compatible format
 */
export async function importPrdJson(
  projectDir: string
): Promise<{ prd: PrdJson; stories: UserStory[] }> {
  const prd = await readPrdJson(projectDir)
  const stories = prd.userStories.map(prdStoryToUserStory)

  // Sort by priority
  stories.sort((a, b) => a.priority - b.priority)

  return { prd, stories }
}

/**
 * Create a new prd.json from task configuration
 */
export async function createPrdJson(task: RalphTask): Promise<PrdJson> {
  const prd: PrdJson = {
    project: path.basename(task.projectDir),
    branchName: task.branchName,
    description: task.description,
    userStories: task.stories.map(userStoryToPrdStory)
  }

  await writePrdJson(task.projectDir, prd)
  return prd
}

/**
 * Update a story's status in prd.json
 */
export async function updateStoryInPrd(
  projectDir: string,
  storyId: string,
  passes: boolean,
  notes?: string
): Promise<void> {
  const prd = await readPrdJson(projectDir)

  const storyIndex = prd.userStories.findIndex((s) => s.id === storyId)
  if (storyIndex === -1) {
    throw new Error(`Story ${storyId} not found in prd.json`)
  }

  prd.userStories[storyIndex].passes = passes
  if (notes !== undefined) {
    prd.userStories[storyIndex].notes = notes
  }

  await writePrdJson(projectDir, prd)
}

/**
 * Sync task stories back to prd.json
 */
export async function syncTaskToPrd(task: RalphTask): Promise<void> {
  const prd: PrdJson = {
    project: path.basename(task.projectDir),
    branchName: task.branchName,
    description: task.description,
    userStories: task.stories.map(userStoryToPrdStory)
  }

  await writePrdJson(task.projectDir, prd)
}

/**
 * Generate a branch name from description
 */
export function generateBranchName(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40)
    .replace(/-$/, '')

  return `ralph/${slug}`
}

/**
 * Generate next story ID based on existing stories
 */
export function generateNextStoryId(existingStories: UserStory[]): string {
  if (existingStories.length === 0) {
    return 'US-001'
  }

  const maxId = existingStories.reduce((max, story) => {
    const match = story.id.match(/US-(\d+)/)
    if (match) {
      const num = parseInt(match[1], 10)
      return Math.max(max, num)
    }
    return max
  }, 0)

  return `US-${String(maxId + 1).padStart(3, '0')}`
}
