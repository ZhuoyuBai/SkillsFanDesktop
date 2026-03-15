/**
 * Skill Manager - Handles installation and deletion of skills
 */

import { dialog, shell } from 'electron'
import { join, dirname } from 'path'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  readdirSync,
  statSync
} from 'fs'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { getClaudeSkillsDir, getSkillsDir, getSkill } from './skill-registry'
import { parseFrontmatter } from './frontmatter'

const CLAUDE_SYNC_METADATA_FILE = '.skillsfan-sync.json'

interface ClaudeSyncMetadata {
  managedBy: 'skillsfan'
  skillName: string
}

// Validation errors
export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillValidationError'
  }
}

/**
 * Validate skill structure
 * Checks for SKILL.md with required frontmatter fields
 */
function validateSkillStructure(
  extractedPath: string
): {
  valid: boolean
  error?: string
  skillName?: string
} {
  const skillMdPath = join(extractedPath, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    return { valid: false, error: 'SKILL.md file not found' }
  }

  try {
    const content = readFileSync(skillMdPath, 'utf-8')
    const parsed = parseFrontmatter(content)
    if (!parsed) {
      return { valid: false, error: 'SKILL.md missing frontmatter (--- ... ---)' }
    }
    const data = parsed.data

    // Required fields
    if (!data.name) {
      return { valid: false, error: 'SKILL.md missing required field: name' }
    }
    if (!data.description) {
      return { valid: false, error: 'SKILL.md missing required field: description' }
    }

    return { valid: true, skillName: data.name }
  } catch (err) {
    return { valid: false, error: `Failed to parse SKILL.md: ${(err as Error).message}` }
  }
}

/**
 * Generate unique skill name if conflict exists
 */
function generateUniqueSkillName(baseName: string, ...skillDirs: string[]): string {
  let counter = 1
  let newName = baseName

  while (skillDirs.some((dir) => existsSync(join(dir, newName)))) {
    newName = `${baseName}-${counter}`
    counter++
  }

  return newName
}

/**
 * Extract zip/skill file to temporary directory
 */
function extractArchive(archivePath: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'skillsfan-skill-'))

  try {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(tempDir, true)

    // Check if extraction created a single top-level directory
    // Filter out macOS metadata folder and hidden files
    const entries = readdirSync(tempDir).filter(
      (name) => name !== '__MACOSX' && !name.startsWith('.')
    )
    if (entries.length === 1 && statSync(join(tempDir, entries[0])).isDirectory()) {
      // Return the inner directory path
      return join(tempDir, entries[0])
    }

    return tempDir
  } catch (err) {
    // Cleanup on error
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error(`Failed to extract archive: ${(err as Error).message}`)
  }
}

/**
 * Copy directory recursively
 */
function copyDirectory(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }

  const entries = readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

function ensureDirectory(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getClaudeSkillPath(skillName: string): string {
  return join(getClaudeSkillsDir(), skillName)
}

function getClaudeSyncMetadataPath(skillPath: string): string {
  return join(skillPath, CLAUDE_SYNC_METADATA_FILE)
}

function readClaudeSyncMetadata(skillPath: string): ClaudeSyncMetadata | null {
  const metadataPath = getClaudeSyncMetadataPath(skillPath)
  if (!existsSync(metadataPath)) {
    return null
  }

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ClaudeSyncMetadata
    if (metadata.managedBy === 'skillsfan' && typeof metadata.skillName === 'string') {
      return metadata
    }
  } catch {
    // Ignore invalid metadata and treat as unmanaged.
  }

  return null
}

function isSkillsFanManagedClaudeSkill(skillPath: string, skillName: string): boolean {
  const metadata = readClaudeSyncMetadata(skillPath)
  return metadata?.managedBy === 'skillsfan' && metadata.skillName === skillName
}

function writeClaudeSyncMetadata(skillPath: string, skillName: string): void {
  writeFileSync(
    getClaudeSyncMetadataPath(skillPath),
    JSON.stringify({ managedBy: 'skillsfan', skillName } satisfies ClaudeSyncMetadata, null, 2),
    'utf-8'
  )
}

function resolveInstallConflict(
  skillName: string,
  conflictResolution: 'replace' | 'rename' | 'cancel' | undefined
): {
  finalSkillName?: string
  conflict?: { skillName: string; existingPath: string }
  error?: string
} {
  const skillsDir = getSkillsDir()
  const claudeSkillsDir = getClaudeSkillsDir()
  const skillsFanPath = join(skillsDir, skillName)
  const claudePath = join(claudeSkillsDir, skillName)
  const hasSkillsFanConflict = existsSync(skillsFanPath)
  const hasUnmanagedClaudeConflict = existsSync(claudePath) && !isSkillsFanManagedClaudeSkill(claudePath, skillName)

  if (!hasSkillsFanConflict && !hasUnmanagedClaudeConflict) {
    return { finalSkillName: skillName }
  }

  if (!conflictResolution) {
    return {
      conflict: {
        skillName,
        existingPath: hasSkillsFanConflict ? skillsFanPath : claudePath
      }
    }
  }

  if (conflictResolution === 'cancel') {
    return { error: 'Installation cancelled by user' }
  }

  if (conflictResolution === 'rename') {
    return {
      finalSkillName: generateUniqueSkillName(skillName, skillsDir, claudeSkillsDir)
    }
  }

  return { finalSkillName: skillName }
}

function removeClaudeSyncedSkillIfManaged(skillName: string): void {
  const claudePath = getClaudeSkillPath(skillName)
  if (!existsSync(claudePath)) {
    return
  }

  if (isSkillsFanManagedClaudeSkill(claudePath, skillName)) {
    rmSync(claudePath, { recursive: true, force: true })
  }
}

function syncSkillToClaude(skillName: string, sourcePath: string): void {
  const claudeSkillsDir = getClaudeSkillsDir()
  const targetPath = getClaudeSkillPath(skillName)

  ensureDirectory(claudeSkillsDir)

  if (existsSync(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true })
  }

  copyDirectory(sourcePath, targetPath)
  writeClaudeSyncMetadata(targetPath, skillName)
}

/**
 * Install skill from archive file
 *
 * @param archivePath - Path to .zip or .skill file
 * @param conflictResolution - How to handle name conflicts: 'replace' | 'rename' | 'cancel'
 * @returns Installation result
 */
export async function installSkill(
  archivePath: string,
  conflictResolution?: 'replace' | 'rename' | 'cancel'
): Promise<{
  success: boolean
  data?: { skillName: string; path: string }
  error?: string
  conflict?: { skillName: string; existingPath: string }
}> {
  let tempDir: string | null = null
  let originalTempDir: string | null = null

  try {
    // Step 1: Extract to temp directory
    tempDir = extractArchive(archivePath)
    originalTempDir = dirname(tempDir) === tmpdir() ? tempDir : dirname(tempDir)

    // Step 2: Validate structure
    const validation = validateSkillStructure(tempDir)
    if (!validation.valid) {
      throw new SkillValidationError(validation.error || 'Invalid skill structure')
    }

    const skillName = validation.skillName!
    const skillsDir = getSkillsDir()
    const conflictResult = resolveInstallConflict(skillName, conflictResolution)
    if (conflictResult.conflict) {
      return {
        success: false,
        conflict: conflictResult.conflict
      }
    }
    if (conflictResult.error) {
      return { success: false, error: conflictResult.error }
    }
    const finalSkillName = conflictResult.finalSkillName || skillName
    const targetPath = join(skillsDir, finalSkillName)
    const claudeTargetPath = getClaudeSkillPath(finalSkillName)

    // Step 4: Ensure skills directory exists
    ensureDirectory(skillsDir)

    // Replace any prior managed Claude sync for this name before copying.
    removeClaudeSyncedSkillIfManaged(finalSkillName)
    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true })
    }
    if (existsSync(claudeTargetPath)) {
      rmSync(claudeTargetPath, { recursive: true, force: true })
    }

    // Step 5: Copy to final destination
    copyDirectory(tempDir, targetPath)
    syncSkillToClaude(finalSkillName, targetPath)

    return {
      success: true,
      data: { skillName: finalSkillName, path: targetPath }
    }
  } catch (err) {
    const error = err as Error
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Cleanup temp directory
    const dirToCleanup = originalTempDir || tempDir
    if (dirToCleanup && existsSync(dirToCleanup)) {
      try {
        rmSync(dirToCleanup, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
        console.warn(`[Skill] Failed to cleanup temp directory: ${dirToCleanup}`)
      }
    }
  }
}

/**
 * Delete a skill
 */
export function deleteSkill(skillName: string): {
  success: boolean
  error?: string
} {
  try {
    const skillsDir = getSkillsDir()
    const skillPath = join(skillsDir, skillName)
    const claudeSkillPath = getClaudeSkillPath(skillName)
    const hasSkillsFanSkill = existsSync(skillPath)
    const hasManagedClaudeCopy = isSkillsFanManagedClaudeSkill(claudeSkillPath, skillName)

    if (!hasSkillsFanSkill && !hasManagedClaudeCopy) {
      return { success: false, error: 'Skill not found' }
    }

    if (hasSkillsFanSkill) {
      rmSync(skillPath, { recursive: true, force: true })
    }
    if (hasManagedClaudeCopy) {
      rmSync(claudeSkillPath, { recursive: true, force: true })
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete skill: ${(err as Error).message}`
    }
  }
}

/**
 * Open skill folder in file manager
 * Supports skills from all sources (SkillsFan, Claude, Agents)
 */
export async function openSkillFolder(skillName: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // First, try to find the skill in the registry to get its baseDir
    const skill = getSkill(skillName)

    if (skill) {
      // Use the skill's actual baseDir (works for all sources)
      const skillPath = skill.baseDir
      if (existsSync(skillPath)) {
        const error = await shell.openPath(skillPath)
        if (error) {
          return { success: false, error }
        }
        return { success: true }
      }
    }

    // Fallback: look in SkillsFan skills directory
    const skillsDir = getSkillsDir()
    const skillPath = join(skillsDir, skillName)

    if (!existsSync(skillPath)) {
      return { success: false, error: 'Skill folder not found' }
    }

    const error = await shell.openPath(skillPath)
    if (error) {
      return { success: false, error }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Failed to open folder: ${(err as Error).message}`
    }
  }
}

/**
 * Show file picker for skill archive
 */
export async function selectSkillArchive(): Promise<{
  success: boolean
  data?: string
  error?: string
}> {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Skill Archive',
      properties: ['openFile'],
      filters: [
        { name: 'Skill Archives', extensions: ['zip', 'skill'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: undefined }
    }

    return { success: true, data: result.filePaths[0] }
  } catch (err) {
    return {
      success: false,
      error: `Failed to open file picker: ${(err as Error).message}`
    }
  }
}
