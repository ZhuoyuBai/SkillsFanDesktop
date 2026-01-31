/**
 * Progress Tracker
 * Handles reading and appending to progress.txt
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { ProgressEntry, RalphTask, UserStory } from './types'

const PROGRESS_FILENAME = 'progress.txt'

/**
 * Get the progress.txt file path for a project
 */
export function getProgressPath(projectDir: string): string {
  return path.join(projectDir, PROGRESS_FILENAME)
}

/**
 * Check if progress.txt exists
 */
export async function progressExists(projectDir: string): Promise<boolean> {
  try {
    await fs.access(getProgressPath(projectDir))
    return true
  } catch {
    return false
  }
}

/**
 * Read progress.txt content
 */
export async function readProgress(projectDir: string): Promise<string> {
  const progressPath = getProgressPath(projectDir)
  try {
    return await fs.readFile(progressPath, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Initialize progress.txt with header
 */
export async function initializeProgress(task: RalphTask): Promise<void> {
  const progressPath = getProgressPath(task.projectDir)
  const header = `# Progress Log - ${task.description}
Branch: ${task.branchName}
Started: ${new Date().toISOString()}

## Codebase Patterns
(Add reusable patterns discovered during implementation here)

---

`
  await fs.writeFile(progressPath, header, 'utf-8')
}

/**
 * Append a progress entry for a completed story
 */
export async function appendProgress(
  projectDir: string,
  story: UserStory,
  details?: {
    implemented?: string[]
    filesChanged?: string[]
    learnings?: string[]
  }
): Promise<void> {
  const progressPath = getProgressPath(projectDir)

  const timestamp = new Date().toISOString()
  const implemented = details?.implemented || [`Implemented ${story.title}`]
  const filesChanged = details?.filesChanged || []
  const learnings = details?.learnings || []

  let entry = `
## ${timestamp} - ${story.id}
**${story.title}**

### What was implemented
${implemented.map((item) => `- ${item}`).join('\n')}
`

  if (filesChanged.length > 0) {
    entry += `
### Files changed
${filesChanged.map((file) => `- ${file}`).join('\n')}
`
  }

  if (learnings.length > 0) {
    entry += `
### Learnings for future iterations
${learnings.map((learning) => `- ${learning}`).join('\n')}
`
  }

  if (story.duration) {
    entry += `
Duration: ${formatDuration(story.duration)}
`
  }

  if (story.commitHash) {
    entry += `Commit: ${story.commitHash}
`
  }

  entry += `
---
`

  // Append to file (create if doesn't exist)
  try {
    await fs.appendFile(progressPath, entry, 'utf-8')
  } catch {
    // If file doesn't exist, create with entry
    await fs.writeFile(progressPath, entry, 'utf-8')
  }
}

/**
 * Append an error entry for a failed story
 */
export async function appendError(
  projectDir: string,
  story: UserStory,
  error: string
): Promise<void> {
  const progressPath = getProgressPath(projectDir)
  const timestamp = new Date().toISOString()

  const entry = `
## ${timestamp} - ${story.id} (FAILED)
**${story.title}**

### Error
${error}

---
`

  try {
    await fs.appendFile(progressPath, entry, 'utf-8')
  } catch {
    await fs.writeFile(progressPath, entry, 'utf-8')
  }
}

/**
 * Parse progress.txt to extract entries
 */
export async function parseProgress(projectDir: string): Promise<ProgressEntry[]> {
  const content = await readProgress(projectDir)
  const entries: ProgressEntry[] = []

  // Split by entry separator
  const sections = content.split(/---\n?/)

  for (const section of sections) {
    // Match entry header: ## [timestamp] - [storyId]
    const headerMatch = section.match(/## (.+?) - (US-\d+)/)
    if (!headerMatch) continue

    const [, timestamp, storyId] = headerMatch

    // Extract implemented items
    const implementedMatch = section.match(/### What was implemented\n([\s\S]*?)(?=###|$)/)
    const implemented = implementedMatch
      ? implementedMatch[1]
          .split('\n')
          .filter((line) => line.startsWith('- '))
          .map((line) => line.slice(2).trim())
      : []

    // Extract files changed
    const filesMatch = section.match(/### Files changed\n([\s\S]*?)(?=###|$)/)
    const filesChanged = filesMatch
      ? filesMatch[1]
          .split('\n')
          .filter((line) => line.startsWith('- '))
          .map((line) => line.slice(2).trim())
      : []

    // Extract learnings
    const learningsMatch = section.match(/### Learnings for future iterations\n([\s\S]*?)(?=###|Duration:|Commit:|$)/)
    const learnings = learningsMatch
      ? learningsMatch[1]
          .split('\n')
          .filter((line) => line.startsWith('- '))
          .map((line) => line.slice(2).trim())
      : []

    entries.push({
      timestamp,
      storyId,
      implemented,
      filesChanged,
      learnings
    })
  }

  return entries
}

/**
 * Get codebase patterns from progress.txt
 */
export async function getCodebasePatterns(projectDir: string): Promise<string[]> {
  const content = await readProgress(projectDir)

  // Find Codebase Patterns section
  const patternsMatch = content.match(/## Codebase Patterns\n([\s\S]*?)(?=---|\n##|$)/)
  if (!patternsMatch) return []

  return patternsMatch[1]
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${remainingSeconds}s`
}
