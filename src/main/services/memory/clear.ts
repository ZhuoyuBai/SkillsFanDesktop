/**
 * Memory Clear Service - Handles clearing SQLite fragments + MEMORY.md files
 */

import { existsSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getMemoryIndexManager } from './index'
import { getSpace, listSpaces } from '../space.service'

const MEMORY_MD_TEMPLATE = `# Project Memory

> This file is automatically loaded into every conversation.
> AI will update it with important decisions, patterns, and context.
> Keep it concise (under 200 lines). Use memory/*.md for detailed notes.
`

/**
 * Clear memory for a specific space:
 * 1. Clear SQLite fragments for the space
 * 2. Reset MEMORY.md in the space's working directory
 * 3. Clear memory/*.md files
 */
export function clearMemoryForSpace(spaceId: string): {
  deletedFragments: number
  deletedConversations: number
  memoryMdReset: boolean
} {
  const manager = getMemoryIndexManager()
  const { deletedFragments, deletedConversations } = manager.clearBySpace(spaceId)

  // Reset MEMORY.md in the space's working directory
  let memoryMdReset = false
  const space = getSpace(spaceId)
  if (space && !space.isTemp) {
    memoryMdReset = resetMemoryFiles(space.path)
  }

  console.log(`[Memory] Cleared space ${spaceId}: ${deletedFragments} fragments, ${deletedConversations} conversations, memoryMdReset=${memoryMdReset}`)
  return { deletedFragments, deletedConversations, memoryMdReset }
}

/**
 * Clear memory for ALL spaces:
 * 1. Clear all SQLite fragments
 * 2. Reset MEMORY.md in all spaces
 */
export function clearAllMemory(): {
  deletedFragments: number
  deletedConversations: number
  spacesReset: number
} {
  const manager = getMemoryIndexManager()
  const { deletedFragments, deletedConversations } = manager.clearAll()

  let spacesReset = 0

  // Reset all user spaces
  const spaces = listSpaces()
  for (const space of spaces) {
    if (!space.isTemp && resetMemoryFiles(space.path)) {
      spacesReset++
    }
  }

  console.log(`[Memory] Cleared all: ${deletedFragments} fragments, ${deletedConversations} conversations, ${spacesReset} spaces reset`)
  return { deletedFragments, deletedConversations, spacesReset }
}

/**
 * Reset MEMORY.md and memory/*.md files in a directory
 */
function resetMemoryFiles(workDir: string): boolean {
  let reset = false

  // Reset MEMORY.md
  const memoryPath = join(workDir, 'MEMORY.md')
  if (existsSync(memoryPath)) {
    try {
      writeFileSync(memoryPath, MEMORY_MD_TEMPLATE, 'utf-8')
      reset = true
    } catch (e) {
      console.error(`[Memory] Failed to reset ${memoryPath}:`, e)
    }
  }

  // Clear memory/*.md files
  const memoryDir = join(workDir, 'memory')
  if (existsSync(memoryDir)) {
    try {
      for (const file of readdirSync(memoryDir)) {
        if (file.endsWith('.md')) {
          writeFileSync(join(memoryDir, file), '', 'utf-8')
          reset = true
        }
      }
    } catch (e) {
      console.error(`[Memory] Failed to clear memory/ dir in ${workDir}:`, e)
    }
  }

  return reset
}
