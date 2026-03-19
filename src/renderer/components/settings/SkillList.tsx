/**
 * Skill List Component
 * Grid layout with colorful icons for each skill card
 * Sources: SkillsFan, Claude commands (project/global), Claude skills, Agent skills
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Package,
  RefreshCw,
  FolderOpen,
  Plus,
  Upload,
  Trash2,
  Compass,
  Sparkles,
  Zap,
  Flame,
  Star,
  Heart,
  Gem,
  Rocket,
  Wand2,
  Palette,
  Crown,
  type LucideIcon
} from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { getSkillsFanBaseUrl } from '../../utils/region'
import { SkillConflictDialog } from './SkillConflictDialog'
import { SkillDeleteDialog } from './SkillDeleteDialog'

// Skill info type from backend
interface SkillSource {
  kind: 'skillsfan' | 'project-commands' | 'global-commands' | 'claude-skills' | 'agents-skills'
  projectDir?: string
}

interface SkillInfo {
  name: string
  displayName: string
  description: string
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

// Icon pool and color palette for skill cards
const SKILL_ICONS: LucideIcon[] = [
  Sparkles, Zap, Flame, Star, Heart, Gem, Rocket, Wand2, Palette, Crown
]

const SKILL_ICON_COLORS = [
  'from-orange-400 to-rose-500',
  'from-violet-500 to-purple-600',
  'from-sky-400 to-blue-500',
  'from-emerald-400 to-teal-500',
  'from-pink-400 to-rose-500',
  'from-amber-400 to-orange-500',
  'from-indigo-400 to-violet-500',
  'from-cyan-400 to-sky-500',
  'from-fuchsia-400 to-pink-500',
  'from-lime-400 to-emerald-500',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function getSkillIcon(name: string): { Icon: LucideIcon; gradient: string } {
  const hash = hashString(name)
  return {
    Icon: SKILL_ICONS[hash % SKILL_ICONS.length],
    gradient: SKILL_ICON_COLORS[hash % SKILL_ICON_COLORS.length],
  }
}

function SkillCard({ skill, onOpenFolder, onDelete, t }: {
  skill: SkillInfo
  onOpenFolder: (name: string) => void
  onDelete: (skill: SkillInfo) => void
  t: (key: string) => string
}) {
  const { Icon, gradient } = getSkillIcon(skill.name)

  return (
    <div className="border border-border/60 rounded-xl p-5 hover:bg-secondary/30 hover:shadow-sm transition-all flex flex-col justify-between group">
      <div>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          </div>
          <h4 className="text-base font-semibold text-foreground truncate" title={skill.displayName || skill.name}>
            {skill.displayName || skill.name}
          </h4>
        </div>
        {skill.description ? (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-3" title={skill.description}>
            {skill.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50 mt-2 italic">
            {t('No description')}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end mt-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="grid grid-cols-3 gap-4 max-h-[420px] overflow-y-auto">
          {skills.map((skill) => (
            <SkillCard
              key={`${skill.source?.kind || 'unknown'}-${skill.name}`}
              skill={skill}
              onOpenFolder={handleOpenFolder}
              onDelete={handleDeleteClick}
              t={t}
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
