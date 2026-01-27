/**
 * Skill List Component
 * Displays list of installed skills from ~/.skillsfan/skills directory
 */

import { useState, useEffect } from 'react'
import {
  Package,
  RefreshCw,
  FolderOpen,
  FileText,
  Wand2,
  Wrench,
  BookOpen,
  Code,
  Zap,
  Plus,
  Upload,
  Trash2
} from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { SkillConflictDialog } from './SkillConflictDialog'
import { SkillDeleteDialog } from './SkillDeleteDialog'

// Skill info type from backend
interface SkillInfo {
  name: string
  displayName: string
  description: string
  location: string
  baseDir: string
}

// Get icon based on skill name (simple heuristic)
function getSkillIcon(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('create') || lowerName.includes('creator')) {
    return <Wand2 className="w-4 h-4" />
  }
  if (lowerName.includes('optimize') || lowerName.includes('optimizer')) {
    return <Wrench className="w-4 h-4" />
  }
  if (lowerName.includes('evaluate') || lowerName.includes('evaluator') || lowerName.includes('test')) {
    return <FileText className="w-4 h-4" />
  }
  if (lowerName.includes('doc') || lowerName.includes('guide') || lowerName.includes('write')) {
    return <BookOpen className="w-4 h-4" />
  }
  if (lowerName.includes('code') || lowerName.includes('dev')) {
    return <Code className="w-4 h-4" />
  }
  return <Zap className="w-4 h-4" />
}

// Format description - extract key points from the description
function formatDescription(description: string): string {
  // Remove "适用于：" prefix if present
  let formatted = description.replace(/^适用于[：:]\s*/i, '')
  // Remove numbered prefixes like "(1)", "(2)" etc
  formatted = formatted.replace(/\(\d+\)\s*/g, '')
  // Truncate if too long
  if (formatted.length > 120) {
    formatted = formatted.slice(0, 117) + '...'
  }
  return formatted
}

// Skill card component
function SkillCard({
  skill,
  onOpenFolder,
  onDelete
}: {
  skill: SkillInfo
  onOpenFolder: (skillName: string) => void
  onDelete: (skill: SkillInfo) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all">
      {/* First row: Icon + Chinese Name */}
      <div className="flex items-center gap-2 mb-2">
        <div className="text-primary flex-shrink-0">{getSkillIcon(skill.name)}</div>
        <h4 className="font-semibold text-foreground truncate">{skill.displayName}</h4>
      </div>

      {/* Second row: English Name */}
      <p className="text-xs text-muted-foreground/70 font-mono mb-3">{skill.name}</p>

      {/* Description Area */}
      <p className="text-sm text-muted-foreground line-clamp-4 mb-4">
        {formatDescription(skill.description)}
      </p>

      {/* Bottom Action Buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
        <button
          onClick={() => onOpenFolder(skill.name)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors"
          title={t('Open in file manager')}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          文件
        </button>

        <button
          onClick={() => onDelete(skill)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors ml-auto"
          title={t('Delete skill')}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('Delete')}
        </button>
      </div>
    </div>
  )
}

// Main component
export function SkillList() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsDir, setSkillsDir] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Installation flow state
  const [isInstalling, setIsInstalling] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<{
    skillName: string
    archivePath: string
  } | null>(null)

  // Deletion flow state
  const [deleteDialogInfo, setDeleteDialogInfo] = useState<{
    skillName: string
    skillDisplayName: string
    skillPath: string
  } | null>(null)

  // Toast notifications
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // Load skills on mount
  useEffect(() => {
    loadSkills()
    loadSkillsDir()
  }, [])

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadSkills = async () => {
    try {
      const result = await api.reloadSkills()
      if (result.success && result.data) {
        setSkills(result.data as SkillInfo[])
        setError(null)
      } else {
        setError(result.error || 'Failed to load skills')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadSkillsDir = async () => {
    try {
      const result = await api.getSkillsDir()
      if (result.success && result.data) {
        setSkillsDir(result.data as string)
      }
    } catch (err) {
      console.error('Failed to get skills dir:', err)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const result = await api.reloadSkills()
      if (result.success && result.data) {
        setSkills(result.data as SkillInfo[])
      } else {
        setError(result.error || 'Failed to reload skills')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Handler for Add Skill button
  const handleAddSkill = async () => {
    setIsInstalling(true)
    setError(null)

    try {
      // Step 1: Show file picker
      const selectResult = await api.selectSkillArchive()
      if (!selectResult.success) {
        throw new Error(selectResult.error || 'Failed to open file picker')
      }

      // User cancelled
      if (!selectResult.data) {
        setIsInstalling(false)
        return
      }

      const archivePath = selectResult.data

      // Step 2: Attempt installation (will return conflict info if name exists)
      const installResult = await api.installSkill(archivePath)

      if (installResult.success) {
        // Success - reload skills
        await loadSkills()
        setToast({ message: t('Skill installed successfully'), type: 'success' })
      } else if (installResult.conflict) {
        // Name conflict - show resolution dialog
        setConflictInfo({
          skillName: installResult.conflict.skillName,
          archivePath
        })
      } else {
        // Installation error
        throw new Error(installResult.error || 'Installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
      setToast({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsInstalling(false)
    }
  }

  // Handler for conflict resolution
  const handleConflictResolve = async (resolution: 'replace' | 'rename' | 'cancel') => {
    if (!conflictInfo) return

    const { archivePath } = conflictInfo
    setConflictInfo(null)

    if (resolution === 'cancel') {
      return
    }

    setIsInstalling(true)
    try {
      const result = await api.installSkill(archivePath, resolution)

      if (result.success) {
        await loadSkills()
        const message =
          resolution === 'rename'
            ? t('Skill installed as {{name}}', { name: result.data?.skillName })
            : t('Skill installed successfully')
        setToast({ message, type: 'success' })
      } else {
        throw new Error(result.error || 'Installation failed')
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsInstalling(false)
    }
  }

  // Handler for Open Folder button
  const handleOpenFolder = async (skillName: string) => {
    try {
      const result = await api.openSkillFolder(skillName)
      if (!result.success) {
        setToast({ message: result.error || t('Failed to open folder'), type: 'error' })
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' })
    }
  }

  // Handler for Delete button click
  const handleDeleteClick = (skill: SkillInfo) => {
    setDeleteDialogInfo({
      skillName: skill.name,
      skillDisplayName: skill.displayName,
      skillPath: skill.baseDir
    })
  }

  // Handler for delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deleteDialogInfo) return

    const { skillName } = deleteDialogInfo
    setDeleteDialogInfo(null)

    try {
      const result = await api.deleteSkill(skillName)

      if (result.success) {
        await loadSkills()
        setToast({ message: t('Skill deleted successfully'), type: 'success' })
      } else {
        throw new Error(result.error || t('Failed to delete skill'))
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' })
    }
  }

  // Shorten skills dir for display
  const shortSkillsDir = skillsDir.replace(/^\/Users\/[^/]+/, '~')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="font-medium text-foreground">
            {t('Skills')}
          </h3>
          {skills.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {skills.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddSkill}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary/90 hover:bg-primary text-primary-foreground rounded-lg transition-colors disabled:opacity-50"
            title={t('Add Skill')}
          >
            {isInstalling ? (
              <>
                <Upload className="w-4 h-4 animate-pulse" />
                {t('Installing...')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {t('Add Skill')}
              </>
            )}
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
            title={t('Refresh skill list')}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('Refreshing...') : t('Refresh')}
          </button>
        </div>
      </div>

      {/* Skills directory info */}
      {skillsDir && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="w-3.5 h-3.5" />
          <span>{t('Skills directory')}: {shortSkillsDir}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="py-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto text-muted-foreground/30 animate-spin mb-3" />
          <p className="text-muted-foreground text-sm">{t('Loading skills...')}</p>
        </div>
      ) : skills.length === 0 ? (
        /* Empty state */
        <div className="py-8 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">
            {t('No skills installed')}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            {t('Add skills to the skills directory to see them here')}
          </p>
        </div>
      ) : (
        /* Skills list - Grid layout (2 columns) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onOpenFolder={handleOpenFolder}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {t('Each skill folder should contain a SKILL.md file')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground/70">
          {t('Skills are automatically loaded when the app starts')}
        </p>
      </div>

      {/* Conflict Resolution Dialog */}
      {conflictInfo && (
        <SkillConflictDialog skillName={conflictInfo.skillName} onResolve={handleConflictResolve} />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogInfo && (
        <SkillDeleteDialog
          skillName={deleteDialogInfo.skillName}
          skillDisplayName={deleteDialogInfo.skillDisplayName}
          skillPath={deleteDialogInfo.skillPath}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialogInfo(null)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg animate-fade-in z-50 ${
            toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
          }`}
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}
    </div>
  )
}
