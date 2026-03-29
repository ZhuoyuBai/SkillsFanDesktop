/**
 * Skill List Component
 * Grid layout with custom PNG icons for each skill card
 * Sources: SkillsFan, Claude commands (project/global), Claude skills, Agent skills
 */

import { useState, useEffect } from 'react'
import {
  Package,
  RefreshCw,
  FolderOpen,
  Plus,
  Upload,
  Trash2,
  Compass,
  Pencil
} from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { getSkillsFanBaseUrl } from '../../utils/region'
import { getSkillIconUrl } from '../../assets/skill-icons'
import { matchSkillIcon } from '../../assets/skill-icons/match'
import { SkillConflictDialog } from './SkillConflictDialog'
import { SkillDeleteDialog } from './SkillDeleteDialog'
import { SkillIconPicker } from './SkillIconPicker'

// Skill info type from backend
interface SkillSource {
  kind: 'skillsfan' | 'project-commands' | 'global-commands' | 'claude-skills' | 'agents-skills'
  projectDir?: string
}

interface SkillInfo {
  name: string
  displayName: string
  description: string
  icon?: string
  location: string
  baseDir: string
  source: SkillSource
  readonly: boolean
  files: string[]
  fileContents: Record<string, string>
}

// Shorten path for display
function shortenPath(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  return normalized
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/^\/home\/[^/]+/, '~')
    .replace(/^[A-Za-z]:\/Users\/[^/]+/, '~')
}

function SkillCard({ skill, onOpenFolder, onDelete, onIconClick, t }: {
  skill: SkillInfo
  onOpenFolder: (name: string) => void
  onDelete: (skill: SkillInfo) => void
  onIconClick: (skill: SkillInfo) => void
  t: (key: string) => string
}) {
  const iconName = skill.icon || matchSkillIcon(skill.name, skill.description)
  const iconUrl = getSkillIconUrl(iconName)

  return (
    <div className="relative bg-card border border-border/40 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-border/60 transition-all group">
      {/* Action buttons - top right, hover visible */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onOpenFolder(skill.name)}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded transition-colors"
          title={t('Open Folder')}
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        {skill.source?.kind === 'skillsfan' && (
          <button
            onClick={() => onDelete(skill)}
            className="p-1 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
            title={t('Delete skill')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => !skill.readonly && onIconClick(skill)}
          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all relative group/icon ${
            !skill.readonly ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
          }`}
          title={!skill.readonly ? t('Change icon') : undefined}
        >
          <img src={iconUrl} alt="" className="w-5 h-5 rounded" />
          {!skill.readonly && (
            <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity flex items-center justify-center">
              <Pencil className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </button>
        <h4 className="text-base font-semibold text-foreground truncate" title={skill.displayName || skill.name}>
          {skill.displayName || skill.name}
        </h4>
      </div>
      {skill.description ? (
        <p className="text-[13px] text-foreground/80 mt-2 line-clamp-3" title={skill.description}>
          {skill.description}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground/50 mt-2 italic">
          {t('No description')}
        </p>
      )}
    </div>
  )
}

// Main component
export function SkillList() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsDir, setSkillsDir] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
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

  // Icon picker state
  const [iconPickerSkill, setIconPickerSkill] = useState<SkillInfo | null>(null)

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
        setError(result.error || t('Failed to load skills'))
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

  const handleAddSkill = async () => {
    setIsInstalling(true)
    setError(null)

    try {
      const selectResult = await api.selectSkillArchive()
      if (!selectResult.success) {
        throw new Error(selectResult.error || t('Failed to open file picker'))
      }

      if (!selectResult.data) {
        setIsInstalling(false)
        return
      }

      const archivePath = selectResult.data
      const installResult = await api.installSkill(archivePath)

      if (installResult.success) {
        setIsInstalling(false)
        await loadSkills()
        setToast({ message: t('Skill installed successfully'), type: 'success' })
      } else if (installResult.conflict) {
        setConflictInfo({
          skillName: installResult.conflict.skillName,
          archivePath
        })
      } else {
        throw new Error(installResult.error || t('Installation failed'))
      }
    } catch (err) {
      setError((err as Error).message)
      setToast({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsInstalling(false)
    }
  }

  const handleConflictResolve = async (resolution: 'replace' | 'rename' | 'cancel') => {
    if (!conflictInfo) return

    const { archivePath } = conflictInfo
    setConflictInfo(null)

    if (resolution === 'cancel') return

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
        throw new Error(result.error || t('Installation failed'))
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsInstalling(false)
    }
  }

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

  const handleDeleteClick = (skill: SkillInfo) => {
    setDeleteDialogInfo({
      skillName: skill.name,
      skillDisplayName: skill.displayName,
      skillPath: skill.baseDir
    })
  }

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

  const handleIconClick = (skill: SkillInfo) => {
    if (!skill.readonly) {
      setIconPickerSkill(skill)
    }
  }

  const handleIconSelect = async (iconName: string) => {
    if (!iconPickerSkill) return

    try {
      const result = await api.updateSkillIcon(iconPickerSkill.name, iconName)
      if (result.success) {
        await loadSkills()
        setToast({ message: t('Icon updated'), type: 'success' })
      } else {
        setToast({ message: result.error || t('Failed to update icon'), type: 'error' })
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' })
    }

    setIconPickerSkill(null)
  }

  const shortSkillsDir = skillsDir ? shortenPath(skillsDir) : ''

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
            onClick={() => {
              api.openExternal(`${getSkillsFanBaseUrl()}/market`)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background text-foreground border border-border hover:bg-secondary/60 rounded-md transition-colors"
            title={t('Discover Skills')}
          >
            <Compass className="w-4 h-4" />
            {t('Discover Skills')}
          </button>

          <button
            onClick={handleAddSkill}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background text-foreground border border-border hover:bg-secondary/60 rounded-md transition-colors disabled:opacity-50"
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
        </div>
      </div>

      {/* Skills directory info */}
      {skillsDir && (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{t('Install directory')}: {shortSkillsDir}</span>
          </div>
          <div className="ml-[22px] text-muted-foreground/60">
            {t('Also loads from')}: ~/.claude/commands · ~/.claude/skills · ~/.agents/skills
          </div>
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
        <div className="grid grid-cols-3 gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={`${skill.source?.kind || 'unknown'}-${skill.name}`}
              skill={skill}
              onOpenFolder={handleOpenFolder}
              onDelete={handleDeleteClick}
              onIconClick={handleIconClick}
              t={t}
            />
          ))}
        </div>
      )}

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

      {/* Icon Picker Dialog */}
      {iconPickerSkill && (
        <SkillIconPicker
          currentIcon={iconPickerSkill.icon || matchSkillIcon(iconPickerSkill.name, iconPickerSkill.description)}
          onSelect={handleIconSelect}
          onClose={() => setIconPickerSkill(null)}
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
