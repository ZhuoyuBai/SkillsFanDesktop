/**
 * Space Service - Manages workspaces/spaces
 */

import { shell } from 'electron'
import { join, basename, extname } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'fs'
import { atomicWriteJsonSync } from '../utils/atomic-write'
import * as fs from 'fs/promises'
import { getHaloDir, getTempSpacePath, getSpacesDir } from './config.service'
import { v4 as uuidv4 } from 'uuid'

interface Space {
  id: string
  name: string
  icon: string
  iconColor?: string  // Custom icon color (hex value)
  path: string
  isTemp: boolean
  createdAt: string
  updatedAt: string
  stats: {
    artifactCount: number
    conversationCount: number
  }
  preferences?: SpacePreferences
}

// Layout preferences for a space
interface SpaceLayoutPreferences {
  artifactRailExpanded?: boolean
  chatWidth?: number
}

// All space preferences
interface SpacePreferences {
  layout?: SpaceLayoutPreferences
}

interface SpaceMeta {
  id: string
  name: string
  icon: string
  iconColor?: string  // Custom icon color (hex value)
  createdAt: string
  updatedAt: string
  preferences?: SpacePreferences
}

// Space index for tracking custom path spaces
interface SpaceIndex {
  customPaths: string[]  // Array of paths to spaces outside ~/.skillsfan/spaces/
}

// New Space uses this directory name
const SPACE_DATA_DIR = '.skillsfan'
// Legacy directory name for backward compatibility
const LEGACY_DATA_DIR = '.halo'

// Get the metadata directory for a space (with backward compatibility)
export function getSpaceMetaDir(spacePath: string): string {
  const newDir = join(spacePath, SPACE_DATA_DIR)
  if (existsSync(newDir)) {
    return newDir
  }
  // Fallback to legacy directory
  const legacyDir = join(spacePath, LEGACY_DATA_DIR)
  if (existsSync(legacyDir)) {
    return legacyDir
  }
  // Default to new directory (for creation)
  return newDir
}

export function isExistingDirectory(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') {
    return false
  }

  try {
    return existsSync(targetPath) && statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

function getSpaceIndexPath(): string {
  return join(getHaloDir(), 'spaces-index.json')
}

function loadSpaceIndex(): SpaceIndex {
  const indexPath = getSpaceIndexPath()
  if (existsSync(indexPath)) {
    try {
      return JSON.parse(readFileSync(indexPath, 'utf-8'))
    } catch {
      return { customPaths: [] }
    }
  }
  return { customPaths: [] }
}

function saveSpaceIndex(index: SpaceIndex): void {
  const indexPath = getSpaceIndexPath()
  atomicWriteJsonSync(indexPath, index, { backup: true })
}

function addToSpaceIndex(path: string): void {
  const index = loadSpaceIndex()
  if (!index.customPaths.includes(path)) {
    index.customPaths.push(path)
    saveSpaceIndex(index)
  }
}

function removeFromSpaceIndex(path: string): void {
  const index = loadSpaceIndex()
  index.customPaths = index.customPaths.filter(p => p !== path)
  saveSpaceIndex(index)
}

const HALO_SPACE: Space = {
  id: 'skillsfan-temp',
  name: '技能范',
  icon: 'skillsfan',  // Uses SkillsFan brand logo
  path: '',
  isTemp: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    artifactCount: 0,
    conversationCount: 0
  }
}

// Get all valid space paths (for security checks)
export function getAllSpacePaths(): string[] {
  const paths: string[] = []

  // Add temp space path
  paths.push(getTempSpacePath())

  // Add default spaces directory
  const spacesDir = getSpacesDir()
  if (existsSync(spacesDir)) {
    const dirs = readdirSync(spacesDir)
    for (const dir of dirs) {
      const spacePath = join(spacesDir, dir)
      if (statSync(spacePath).isDirectory()) {
        paths.push(spacePath)
      }
    }
  }

  // Add custom path spaces from index
  const index = loadSpaceIndex()
  for (const customPath of index.customPaths) {
    if (existsSync(customPath)) {
      paths.push(customPath)
    }
  }

  return paths
}

// Get space stats
function getSpaceStats(spacePath: string): { artifactCount: number; conversationCount: number } {
  const artifactsDir = join(spacePath, 'artifacts')
  const conversationsDir = join(getSpaceMetaDir(spacePath), 'conversations')

  let artifactCount = 0
  let conversationCount = 0

  // Count artifacts (all files in artifacts folder)
  if (existsSync(artifactsDir)) {
    const countFiles = (dir: string): number => {
      let count = 0
      const items = readdirSync(dir)
      for (const item of items) {
        const itemPath = join(dir, item)
        const stat = statSync(itemPath)
        if (stat.isFile() && !item.startsWith('.')) {
          count++
        } else if (stat.isDirectory()) {
          count += countFiles(itemPath)
        }
      }
      return count
    }
    artifactCount = countFiles(artifactsDir)
  }

  // For temp space, artifacts are directly in the folder
  if (spacePath === getTempSpacePath()) {
    const tempArtifactsDir = join(spacePath, 'artifacts')
    if (existsSync(tempArtifactsDir)) {
      artifactCount = readdirSync(tempArtifactsDir).filter(f => !f.startsWith('.')).length
    }
  }

  // Count conversations
  if (existsSync(conversationsDir)) {
    conversationCount = readdirSync(conversationsDir).filter(f => f.endsWith('.json')).length
  } else {
    // For temp space
    const tempConvDir = join(spacePath, 'conversations')
    if (existsSync(tempConvDir)) {
      conversationCount = readdirSync(tempConvDir).filter(f => f.endsWith('.json')).length
    }
  }

  return { artifactCount, conversationCount }
}

// Get Halo temp space
export function getHaloSpace(): Space {
  const tempPath = getTempSpacePath()
  const stats = getSpaceStats(tempPath)

  // Load preferences if they exist
  const metaPath = join(getSpaceMetaDir(tempPath), 'meta.json')
  let preferences: SpacePreferences | undefined

  if (existsSync(metaPath)) {
    try {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      preferences = meta.preferences
    } catch {
      // Ignore parse errors
    }
  }

  return {
    ...HALO_SPACE,
    path: tempPath,
    stats,
    preferences
  }
}

// Helper to load a space from a path
function loadSpaceFromPath(spacePath: string): Space | null {
  const metaPath = join(getSpaceMetaDir(spacePath), 'meta.json')

  if (existsSync(metaPath)) {
    try {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      const stats = getSpaceStats(spacePath)

      return {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        iconColor: meta.iconColor,
        path: spacePath,
        isTemp: false,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        stats,
        preferences: meta.preferences
      }
    } catch (error) {
      console.error(`Failed to read space meta for ${spacePath}:`, error)
    }
  }
  return null
}

// List all spaces (including custom path spaces)
export function listSpaces(): Space[] {
  const spacesDir = getSpacesDir()
  const spaces: Space[] = []
  const loadedPaths = new Set<string>()

  // Load spaces from default directory
  if (existsSync(spacesDir)) {
    const dirs = readdirSync(spacesDir)

    for (const dir of dirs) {
      const spacePath = join(spacesDir, dir)
      const space = loadSpaceFromPath(spacePath)
      if (space) {
        spaces.push(space)
        loadedPaths.add(spacePath)
      }
    }
  }

  // Load spaces from custom paths (indexed)
  const index = loadSpaceIndex()
  for (const customPath of index.customPaths) {
    if (!loadedPaths.has(customPath) && existsSync(customPath)) {
      const space = loadSpaceFromPath(customPath)
      if (space) {
        spaces.push(space)
        loadedPaths.add(customPath)
      }
    }
  }

  // Sort by updatedAt (most recent first)
  spaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return spaces
}

// Create a new space
export function createSpace(input: { name: string; icon: string; iconColor?: string; customPath?: string }): Space {
  const id = uuidv4()
  const now = new Date().toISOString()
  const isCustomPath = !!input.customPath

  // Determine space path
  let spacePath: string
  if (input.customPath) {
    spacePath = input.customPath
  } else {
    spacePath = join(getSpacesDir(), input.name)
  }

  // Create directories
  mkdirSync(spacePath, { recursive: true })
  mkdirSync(join(spacePath, SPACE_DATA_DIR), { recursive: true })
  mkdirSync(join(spacePath, SPACE_DATA_DIR, 'conversations'), { recursive: true })

  // Create meta file
  const meta: SpaceMeta = {
    id,
    name: input.name,
    icon: input.icon,
    iconColor: input.iconColor,
    createdAt: now,
    updatedAt: now
  }

  atomicWriteJsonSync(join(spacePath, SPACE_DATA_DIR, 'meta.json'), meta, { backup: true })

  // Register custom path in index
  if (isCustomPath) {
    addToSpaceIndex(spacePath)
  }

  return {
    id,
    name: input.name,
    icon: input.icon,
    iconColor: input.iconColor,
    path: spacePath,
    isTemp: false,
    createdAt: now,
    updatedAt: now,
    stats: {
      artifactCount: 0,
      conversationCount: 0
    }
  }
}

// Delete a space
export function deleteSpace(spaceId: string): boolean {
  // Find the space first
  const space = getSpace(spaceId)
  if (!space || space.isTemp) {
    return false
  }

  const spacePath = space.path
  const spacesDir = getSpacesDir()
  const isCustomPath = !spacePath.startsWith(spacesDir)

  try {
    if (isCustomPath) {
      // For custom path spaces, only delete the data folder (preserve user's files)
      // Check both new and legacy directory names
      const newDataDir = join(spacePath, SPACE_DATA_DIR)
      const legacyDataDir = join(spacePath, LEGACY_DATA_DIR)
      if (existsSync(newDataDir)) {
        rmSync(newDataDir, { recursive: true, force: true })
      }
      if (existsSync(legacyDataDir)) {
        rmSync(legacyDataDir, { recursive: true, force: true })
      }
      // Remove from index
      removeFromSpaceIndex(spacePath)
    } else {
      // For default path spaces, delete the entire folder
      rmSync(spacePath, { recursive: true, force: true })
    }
    return true
  } catch (error) {
    console.error(`Failed to delete space ${spaceId}:`, error)
    return false
  }
}

// Get a specific space by ID
export function getSpace(spaceId: string): Space | null {
  if (spaceId === 'skillsfan-temp') {
    return getHaloSpace()
  }

  const spaces = listSpaces()
  return spaces.find(s => s.id === spaceId) || null
}

// Open space folder in file explorer
export function openSpaceFolder(spaceId: string): boolean {
  const space = getSpace(spaceId)

  if (space) {
    // For temp space, open artifacts folder
    if (space.isTemp) {
      const artifactsPath = join(space.path, 'artifacts')
      if (existsSync(artifactsPath)) {
        shell.openPath(artifactsPath)
        return true
      }
    } else {
      shell.openPath(space.path)
      return true
    }
  }

  return false
}

// Update space metadata
export function updateSpace(spaceId: string, updates: { name?: string; icon?: string; iconColor?: string }): Space | null {
  const space = getSpace(spaceId)

  if (!space || space.isTemp) {
    return null
  }

  const metaPath = join(getSpaceMetaDir(space.path), 'meta.json')

  try {
    const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))

    if (updates.name) meta.name = updates.name
    if (updates.icon) meta.icon = updates.icon
    // Allow setting iconColor to undefined to remove it
    if (updates.iconColor !== undefined) {
      meta.iconColor = updates.iconColor || undefined
    }
    meta.updatedAt = new Date().toISOString()

    atomicWriteJsonSync(metaPath, meta, { backup: true })

    return getSpace(spaceId)
  } catch (error) {
    console.error('Failed to update space:', error)
    return null
  }
}

// Update space preferences (layout settings, etc.)
export function updateSpacePreferences(
  spaceId: string,
  preferences: Partial<SpacePreferences>
): Space | null {
  const space = getSpace(spaceId)

  if (!space) {
    return null
  }

  // For temp space, store preferences in a special location
  const metaDir = getSpaceMetaDir(space.path)
  const metaPath = join(metaDir, 'meta.json')

  try {
    // Ensure data directory exists for temp space
    if (!existsSync(metaDir)) {
      mkdirSync(metaDir, { recursive: true })
    }

    // Load or create meta
    let meta: SpaceMeta
    if (existsSync(metaPath)) {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    } else {
      // Create new meta for temp space
      meta = {
        id: space.id,
        name: space.name,
        icon: space.icon,
        createdAt: space.createdAt,
        updatedAt: new Date().toISOString()
      }
    }

    // Deep merge preferences
    meta.preferences = meta.preferences || {}

    if (preferences.layout) {
      meta.preferences.layout = {
        ...meta.preferences.layout,
        ...preferences.layout
      }
    }

    meta.updatedAt = new Date().toISOString()

    atomicWriteJsonSync(metaPath, meta, { backup: true })

    console.log(`[Space] Updated preferences for ${spaceId}:`, preferences)

    return getSpace(spaceId)
  } catch (error) {
    console.error('Failed to update space preferences:', error)
    return null
  }
}

// Get space preferences only (lightweight, without full space load)
export function getSpacePreferences(spaceId: string): SpacePreferences | null {
  const space = getSpace(spaceId)

  if (!space) {
    return null
  }

  const metaPath = join(getSpaceMetaDir(space.path), 'meta.json')

  try {
    if (existsSync(metaPath)) {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      return meta.preferences || null
    }
    return null
  } catch (error) {
    console.error('Failed to get space preferences:', error)
    return null
  }
}

// Write onboarding artifact - saves a file to the space's artifacts folder
export function writeOnboardingArtifact(spaceId: string, fileName: string, content: string): boolean {
  const space = getSpace(spaceId)
  if (!space) {
    console.error(`[Space] writeOnboardingArtifact: Space not found: ${spaceId}`)
    return false
  }

  try {
    // Determine artifacts directory based on space type
    const artifactsDir = space.isTemp
      ? join(space.path, 'artifacts')
      : space.path  // For regular spaces, save to root

    // Ensure artifacts directory exists
    mkdirSync(artifactsDir, { recursive: true })

    // Write the file
    const filePath = join(artifactsDir, fileName)
    writeFileSync(filePath, content, 'utf-8')

    console.log(`[Space] writeOnboardingArtifact: Saved ${fileName} to ${filePath}`)
    return true
  } catch (error) {
    console.error(`[Space] writeOnboardingArtifact failed:`, error)
    return false
  }
}

// Save onboarding conversation - creates a conversation with the mock messages
export function saveOnboardingConversation(
  spaceId: string,
  userMessage: string,
  aiResponse: string
): string | null {
  const space = getSpace(spaceId)
  if (!space) {
    console.error(`[Space] saveOnboardingConversation: Space not found: ${spaceId}`)
    return null
  }

  try {
    const { v4: uuidv4 } = require('uuid')
    const conversationId = uuidv4()
    const now = new Date().toISOString()

    // Determine conversations directory
    const conversationsDir = space.isTemp
      ? join(space.path, 'conversations')
      : join(getSpaceMetaDir(space.path), 'conversations')

    // Ensure directory exists
    mkdirSync(conversationsDir, { recursive: true })

    // Create conversation data
    const conversation = {
      id: conversationId,
      title: 'Welcome to Halo',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: uuidv4(),
          role: 'user',
          content: userMessage,
          timestamp: now
        },
        {
          id: uuidv4(),
          role: 'assistant',
          content: aiResponse,
          timestamp: now
        }
      ]
    }

    // Write conversation file
    const filePath = join(conversationsDir, `${conversationId}.json`)
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8')

    console.log(`[Space] saveOnboardingConversation: Saved to ${filePath}`)
    return conversationId
  } catch (error) {
    console.error(`[Space] saveOnboardingConversation failed:`, error)
    return null
  }
}

// ========== File listing for @ file reference ==========

export interface FileItem {
  name: string        // File name (e.g. "index.ts")
  path: string        // Relative path (e.g. "src/main/index.ts")
  isDirectory: boolean
  extension?: string  // File extension without dot
}

interface ListFilesOptions {
  maxDepth?: number    // Max scan depth, default 5
  maxResults?: number  // Max returned items, default 50
  query?: string       // Fuzzy search keyword
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__',
  '.cache', '.turbo', 'coverage', '.output', 'build',
  '.DS_Store', '.env', 'out', '.nuxt', '.svelte-kit',
  'target', '.skillsfan', '.halo'
])

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitkeep'
])

const ALLOWED_DOT_DIRS = new Set([
  '.claude', '.github', '.vscode', '.husky'
])

export async function listWorkspaceFiles(
  spaceId: string,
  options: ListFilesOptions = {}
): Promise<FileItem[]> {
  const { maxDepth = 5, maxResults = 50, query = '' } = options

  const space = getSpace(spaceId)
  if (!space?.path) {
    return []
  }

  // For temp space, use path; for regular spaces, use path as working directory
  const baseDir = space.path
  if (!existsSync(baseDir)) {
    return []
  }

  const results: FileItem[] = []

  async function scan(dir: string, depth: number, relativePath: string): Promise<void> {
    if (depth > maxDepth || results.length >= maxResults * 2) return

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      const name = entry.name

      // Skip hidden files (except allowed dot dirs)
      if (name.startsWith('.') && !ALLOWED_DOT_DIRS.has(name)) continue

      // Skip ignored directories
      if (entry.isDirectory() && IGNORED_DIRS.has(name)) continue

      // Skip ignored files
      if (!entry.isDirectory() && IGNORED_FILES.has(name)) continue

      const itemPath = relativePath ? `${relativePath}/${name}` : name
      const fullPath = join(dir, name)

      results.push({
        name,
        path: itemPath,
        isDirectory: entry.isDirectory(),
        extension: entry.isDirectory() ? undefined : extname(name).slice(1) || undefined
      })

      // Recurse into subdirectories
      if (entry.isDirectory()) {
        await scan(fullPath, depth + 1, itemPath)
      }
    }
  }

  await scan(baseDir, 0, '')

  // Filter by query
  let filtered = results
  if (query) {
    const lowerQuery = query.toLowerCase()
    filtered = results.filter(item =>
      item.path.toLowerCase().includes(lowerQuery) ||
      item.name.toLowerCase().includes(lowerQuery)
    )
  }

  return filtered.slice(0, maxResults)
}
