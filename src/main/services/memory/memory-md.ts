/**
 * Memory MD Service - Read/write MEMORY.md files for spaces
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getSpace } from '../space.service'

export function readMemoryMd(spaceId: string): { content: string; exists: boolean } {
  const space = getSpace(spaceId)
  if (!space || space.isTemp) {
    return { content: '', exists: false }
  }
  const memoryPath = join(space.path, 'MEMORY.md')
  if (!existsSync(memoryPath)) {
    return { content: '', exists: false }
  }
  const content = readFileSync(memoryPath, 'utf-8')
  return { content, exists: true }
}

export function saveMemoryMd(spaceId: string, content: string): { saved: boolean } {
  const space = getSpace(spaceId)
  if (!space || space.isTemp) {
    throw new Error('Cannot save memory for temporary space')
  }
  const memoryPath = join(space.path, 'MEMORY.md')
  writeFileSync(memoryPath, content, 'utf-8')
  return { saved: true }
}
