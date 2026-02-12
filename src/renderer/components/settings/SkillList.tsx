/**
 * Skill List Component
 * Left sidebar (folder tree, native file-explorer style) + right preview layout
 * Sources: SkillsFan, Claude commands (project/global), Claude skills, Agent skills
 */

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Package,
  RefreshCw,
  FolderOpen,
  Folder,
  Plus,
  Upload,
  Trash2,
  Compass,
  FileText
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

// Source label config (used on right panel title)
const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  'skillsfan':        { label: 'SkillsFan',   icon: '\u26a1' },
  'project-commands': { label: 'Project',     icon: '\ud83d\udccc' },
  'global-commands':  { label: 'Global',      icon: '\ud83c\udf10' },
  'claude-skills':    { label: 'Claude',      icon: '\ud83e\udd16' },
  'agents-skills':    { label: 'Agent',       icon: '\ud83d\udd27' },
}

// Shorten path for display
function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

// Get the folder/file label for the left sidebar
function getFolderLabel(skill: SkillInfo): string {
  if (skill.source.kind === 'project-commands' || skill.source.kind === 'global-commands') {
    return skill.location.split('/').pop() || skill.name
  }
  return skill.baseDir.replace(/\/$/, '').split('/').pop() || skill.name
}

// Check if skill is a single-file command (no expandable folder)
function isCommandSkill(skill: SkillInfo): boolean {
  return skill.source.kind === 'project-commands' || skill.source.kind === 'global-commands'
}

// Main component
export function SkillList() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsDir, setSkillsDir] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Folder tree state
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set())

  // Selection & preview state
  const [selectedFile, setSelectedFile] = useState<{ skillName: string; fileName: string } | null>(null)
  const [fileContent, setFileContent] = useState<string>('')

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

  // Derived state
  const selectedSkill = selectedFile
    ? skills.find(s => s.name === selectedFile.skillName) || null
    : null

  // Load skills on mount
  useEffect(() => {
    loadSkills()
    loadSkillsDir()
  }, [])

  // Auto-expand first skill when list loads
  useEffect(() => {
    if (skills.length > 0 && !selectedFile) {
      const first = skills[0]
      if (isCommandSkill(first)) {
        const fileName = first.location.split('/').pop() || first.name
        selectFile(first.name, fileName)
      } else {
        handleFolderClick(first)
      }
    }
  }, [skills])

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const selectFile = useCallback((skillName: string, fileName: string) => {
    setSelectedFile({ skillName, fileName })
    const skill = skills.find(s => s.name === skillName)
    setFileContent(skill?.fileContents?.[fileName] ?? '')
  }, [skills])

  const handleFolderClick = useCallback((skill: SkillInfo) => {
    if (isCommandSkill(skill)) {
      // Command: directly select and preview
      const fileName = skill.location.split('/').pop() || skill.name
      selectFile(skill.name, fileName)
      return
    }

    // Toggle expand
    setExpandedSkills(prev => {
      const next = new Set(prev)
      if (next.has(skill.name)) {
        next.delete(skill.name)
      } else {
        next.add(skill.name)
      }
      return next
    })

    // Auto-select SKILL.md or first file if not already in this skill
    const files = skill.files ?? []
    const defaultFile = files.includes('SKILL.md') ? 'SKILL.md' : files[0]
    if (defaultFile && (!selectedFile || selectedFile.skillName !== skill.name)) {
      selectFile(skill.name, defaultFile)
    }
  }, [selectedFile, selectFile])

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
    setExpandedSkills(new Set())
    try {
      const result = await api.reloadSkills()
      if (result.success && result.data) {
        const newSkills = result.data as SkillInfo[]
        setSkills(newSkills)
        if (selectedFile && !newSkills.find(s => s.name === selectedFile.skillName)) {
          setSelectedFile(null)
          setFileContent('')
        }
      } else {
        setError(result.error || 'Failed to reload skills')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleAddSkill = async () => {
    setIsInstalling(true)
    setError(null)

    try {
      const selectResult = await api.selectSkillArchive()
      if (!selectResult.success) {
        throw new Error(selectResult.error || 'Failed to open file picker')
      }

      if (!selectResult.data) {
        setIsInstalling(false)
        return
      }

      const archivePath = selectResult.data
      const installResult = await api.installSkill(archivePath)

      if (installResult.success) {
        setIsInstalling(false)
        setExpandedSkills(new Set())
        await loadSkills()
        if (installResult.data?.skillName) {
          // Will auto-select via useEffect
        }
        setToast({ message: t('Skill installed successfully'), type: 'success' })
      } else if (installResult.conflict) {
        setConflictInfo({
          skillName: installResult.conflict.skillName,
          archivePath
        })
      } else {
        throw new Error(installResult.error || 'Installation failed')
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
        setExpandedSkills(new Set())
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
        setExpandedSkills(prev => {
          const next = new Set(prev)
          next.delete(skillName)
          return next
        })

        const remaining = skills.filter(s => s.name !== skillName)
        if (remaining.length > 0) {
          const first = remaining[0]
          if (isCommandSkill(first)) {
            const fileName = first.location.split('/').pop() || first.name
            selectFile(first.name, fileName)
          } else {
            const files = first.files ?? []
            const defaultFile = files.includes('SKILL.md') ? 'SKILL.md' : files[0]
            if (defaultFile) selectFile(first.name, defaultFile)
            setExpandedSkills(new Set([first.name]))
          }
        } else {
          setSelectedFile(null)
          setFileContent('')
        }

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
  const isMarkdownFile = (fileName: string) => fileName.endsWith('.md')

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
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            title={t('Discover Skills')}
          >
            <Compass className="w-4 h-4" />
            {t('Discover Skills')}
          </button>

          <button
            onClick={handleAddSkill}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
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
        /* Left-right split layout */
        <div className="flex border border-border rounded-lg overflow-hidden h-[420px]">
          {/* Left sidebar - folder tree (native file explorer style) */}
          <div className="w-[220px] border-r border-border overflow-y-auto flex-shrink-0">
            {skills.map((skill) => {
              const folderLabel = getFolderLabel(skill)
              const isCommand = isCommandSkill(skill)
              const isExpanded = expandedSkills.has(skill.name)
              const isSkillSelected = selectedFile?.skillName === skill.name

              return (
                <div key={`${skill.source?.kind || 'unknown'}-${skill.name}`}>
                  {/* Folder / file row */}
                  <button
                    onClick={() => handleFolderClick(skill)}
                    className={`
                      w-full text-left flex items-center gap-2 px-3 py-2
                      transition-colors text-sm
                      ${isSkillSelected && isCommand
                        ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-secondary/60 text-muted-foreground'
                      }
                    `}
                  >
                    {isCommand ? (
                      <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground/70" />
                    ) : isExpanded ? (
                      <FolderOpen className="w-4 h-4 flex-shrink-0 text-yellow-500/80" />
                    ) : (
                      <Folder className="w-4 h-4 flex-shrink-0 text-yellow-500/80" />
                    )}
                    <span className="truncate">{folderLabel}</span>
                  </button>

                  {/* Expanded file list */}
                  {!isCommand && isExpanded && (skill.files ?? []).length > 0 && (
                    <div>
                      {(skill.files ?? []).map((fileName) => {
                        const isFileSelected =
                          selectedFile?.skillName === skill.name &&
                          selectedFile?.fileName === fileName
                        return (
                          <button
                            key={fileName}
                            onClick={() => selectFile(skill.name, fileName)}
                            className={`
                              w-full text-left flex items-center gap-2 pl-7 pr-3 py-1.5
                              transition-colors text-xs
                              ${isFileSelected
                                ? 'bg-primary/10 text-foreground'
                                : 'hover:bg-secondary/60 text-muted-foreground'
                              }
                            `}
                          >
                            <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50" />
                            <span className="truncate">{fileName}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right panel - preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedSkill && selectedFile ? (
              <>
                {/* Title bar with source icon */}
                <div className="px-5 pt-4 pb-2 flex-shrink-0">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <span>{SOURCE_CONFIG[selectedSkill.source?.kind]?.icon || '\u26a1'}</span>
                    {getFolderLabel(selectedSkill)}
                  </h4>
                  {selectedFile.fileName !== 'SKILL.md' && !isCommandSkill(selectedSkill) && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {selectedFile.fileName}
                    </p>
                  )}
                </div>

                {/* File content */}
                <div className="flex-1 overflow-y-auto px-5 pb-4">
                  {isMarkdownFile(selectedFile.fileName) ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-code:text-foreground prose-code:bg-secondary/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {fileContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
                      {fileContent}
                    </pre>
                  )}
                </div>

                {/* Bottom bar - path + actions */}
                <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-card/50 flex-shrink-0">
                  <span className="text-xs text-muted-foreground/70 font-mono truncate mr-4">
                    {shortenPath(selectedSkill.baseDir)}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenFolder(selectedSkill.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors"
                      title={t('Open Folder')}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t('Open Folder')}
                    </button>
                    {selectedSkill.source?.kind === 'skillsfan' && (
                      <button
                        onClick={() => handleDeleteClick(selectedSkill)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title={t('Delete skill')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('Delete')}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">{t('Select a skill to view details')}</p>
              </div>
            )}
          </div>
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
