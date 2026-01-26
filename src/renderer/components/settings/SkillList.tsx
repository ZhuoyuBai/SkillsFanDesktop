/**
 * Skill List Component
 * Displays list of installed skills from ~/.skillsfan/skills directory
 */

import { useState, useEffect } from 'react'
import {
  Sparkles,
  RefreshCw,
  FolderOpen,
  FileText,
  Wand2,
  Wrench,
  BookOpen,
  Code,
  Zap
} from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

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
    return <Wand2 className="w-5 h-5" />
  }
  if (lowerName.includes('optimize') || lowerName.includes('optimizer')) {
    return <Wrench className="w-5 h-5" />
  }
  if (lowerName.includes('evaluate') || lowerName.includes('evaluator') || lowerName.includes('test')) {
    return <FileText className="w-5 h-5" />
  }
  if (lowerName.includes('doc') || lowerName.includes('guide') || lowerName.includes('write')) {
    return <BookOpen className="w-5 h-5" />
  }
  if (lowerName.includes('code') || lowerName.includes('dev')) {
    return <Code className="w-5 h-5" />
  }
  return <Zap className="w-5 h-5" />
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
function SkillCard({ skill }: { skill: SkillInfo }) {
  // Shorten the path for display
  const shortPath = skill.baseDir.replace(/^.*[/\\]\.skillsfan(-dev)?[/\\]skills[/\\]/, '~/.../skills/')

  return (
    <div className="bg-secondary/30 hover:bg-secondary/50 rounded-lg p-4 transition-colors">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          {getSkillIcon(skill.name)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Display Name (Chinese) */}
          <h4 className="font-medium text-foreground">
            {skill.displayName}
          </h4>

          {/* Technical Name (English) */}
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
            {skill.name}
          </p>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {formatDescription(skill.description)}
          </p>

          {/* Path */}
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground/50">
            <FolderOpen className="w-3 h-3" />
            <span className="truncate font-mono">{shortPath}</span>
          </div>
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load skills on mount
  useEffect(() => {
    loadSkills()
    loadSkillsDir()
  }, [])

  const loadSkills = async () => {
    try {
      const result = await api.listSkills()
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

  // Shorten skills dir for display
  const shortSkillsDir = skillsDir.replace(/^\/Users\/[^/]+/, '~')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-medium text-foreground">
            {t('Skills')}
          </h3>
          {skills.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {skills.length}
            </span>
          )}
        </div>

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
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">
            {t('No skills installed')}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            {t('Add skills to the skills directory to see them here')}
          </p>
        </div>
      ) : (
        /* Skills list */
        <div className="space-y-3">
          {skills.map((skill) => (
            <SkillCard key={skill.name} skill={skill} />
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
    </div>
  )
}
