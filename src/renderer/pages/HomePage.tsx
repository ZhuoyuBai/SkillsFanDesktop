/**
 * Home Page - Space list view
 */

import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { SPACE_ICONS, DEFAULT_SPACE_ICON } from '../types'
import type { Space, CreateSpaceInput, SpaceIconId } from '../types'
import {
  SpaceIcon,
  Settings,
  Plus,
  Trash2,
  FolderOpen,
  Pencil,
  ChevronDown
} from '../components/icons/ToolIcons'
import { Header } from '../components/layout/Header'
import { SpaceGuide } from '../components/space/SpaceGuide'
import { HaloLogo } from '../components/brand/HaloLogo'
import { Monitor } from 'lucide-react'
import { api } from '../api'
import { useTranslation } from '../i18n'

// Check if running in web mode
const isWebMode = api.isRemoteMode()

export function HomePage() {
  const { t } = useTranslation()
  const { setView } = useAppStore()
  const { haloSpace, spaces, loadSpaces, setCurrentSpace, createSpace, updateSpace, deleteSpace } = useSpaceStore()

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [newSpaceIcon, setNewSpaceIcon] = useState<SpaceIconId>(DEFAULT_SPACE_ICON)

  // Edit dialog state
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [editSpaceName, setEditSpaceName] = useState('')
  const [editSpaceIcon, setEditSpaceIcon] = useState<SpaceIconId>(DEFAULT_SPACE_ICON)

  // Path selection state
  const [useCustomPath, setUseCustomPath] = useState(false)
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [defaultPath, setDefaultPath] = useState<string>('~/.skillsfan/spaces')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Load spaces on mount
  useEffect(() => {
    loadSpaces()
  }, [loadSpaces])

  // Load default path when dialog opens
  useEffect(() => {
    if (showCreateDialog) {
      api.getDefaultSpacePath().then((res) => {
        if (res.success && res.data) {
          setDefaultPath(res.data as string)
        }
      })
      // Focus the space name input when dialog opens
      setTimeout(() => {
        spaceNameInputRef.current?.focus()
      }, 100)
    }
  }, [showCreateDialog])

  // Ref for space name input
  const spaceNameInputRef = useRef<HTMLInputElement>(null)

  // Handle folder selection
  const handleSelectFolder = async () => {
    if (isWebMode) return // Disabled in web mode
    const res = await api.selectFolder()
    if (res.success && res.data) {
      const path = res.data as string
      setCustomPath(path)
      setUseCustomPath(true)
      // Extract directory name as suggested space name
      const dirName = path.split('/').pop() || ''
      if (dirName && !newSpaceName.trim()) {
        setNewSpaceName(dirName)
      }
      // Focus the space name input
      setTimeout(() => {
        spaceNameInputRef.current?.focus()
        spaceNameInputRef.current?.select()
      }, 100)
    }
  }

  // Reset dialog state
  const resetDialog = () => {
    setShowCreateDialog(false)
    setNewSpaceName('')
    setNewSpaceIcon(DEFAULT_SPACE_ICON)
    setUseCustomPath(false)
    setCustomPath(null)
    setShowAdvanced(false)
  }

  // Handle space click - no reset needed, SpacePage handles its own state
  const handleSpaceClick = (space: Space) => {
    setCurrentSpace(space)
    setView('space')
  }

  // Handle create space
  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return

    const input: CreateSpaceInput = {
      name: newSpaceName.trim(),
      icon: newSpaceIcon,
      customPath: useCustomPath && customPath ? customPath : undefined
    }

    const newSpace = await createSpace(input)

    if (newSpace) {
      resetDialog()
    }
  }

  // Shorten path for display
  const shortenPath = (path: string) => {
    const home = path.includes('/Users/') ? path.replace(/\/Users\/[^/]+/, '~') : path
    return home
  }

  // Handle delete space
  const handleDeleteSpace = async (e: React.MouseEvent, spaceId: string) => {
    e.stopPropagation()

    // Find the space to check if it's a custom path
    const space = spaces.find(s => s.id === spaceId)
    if (!space) return

    // Check if it's a custom path (not under default spaces directory)
    const isCustomPath = !space.path.includes('/.skillsfan/spaces/')

    const message = isCustomPath
      ? t('Are you sure you want to delete this space?\n\nOnly Halo data (conversation history) will be deleted, your project files will be kept.')
      : t('Are you sure you want to delete this space?\n\nAll conversations and files in the space will be deleted.')

    if (confirm(message)) {
      await deleteSpace(spaceId)
    }
  }

  // Handle edit space - open dialog
  const handleEditSpace = (e: React.MouseEvent, space: Space) => {
    e.stopPropagation()
    setEditingSpace(space)
    setEditSpaceName(space.name)
    setEditSpaceIcon(space.icon as SpaceIconId)
  }

  // Handle save space edit
  const handleSaveEdit = async () => {
    if (!editingSpace || !editSpaceName.trim()) return

    await updateSpace(editingSpace.id, {
      name: editSpaceName.trim(),
      icon: editSpaceIcon
    })

    setEditingSpace(null)
    setEditSpaceName('')
    setEditSpaceIcon(DEFAULT_SPACE_ICON)
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingSpace(null)
    setEditSpaceName('')
    setEditSpaceIcon(DEFAULT_SPACE_ICON)
  }

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return t('Today')
    if (diffDays === 1) return t('Yesterday')
    if (diffDays < 7) return t('{{count}} days ago', { count: diffDays })
    if (diffDays < 30) return t('{{count}} weeks ago', { count: Math.floor(diffDays / 7) })
    return t('{{count}} months ago', { count: Math.floor(diffDays / 30) })
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header - simplified, only settings button */}
      <Header
        right={
          <button
            onClick={() => setView('settings')}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        }
      />

      {/* Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Hero Section - Visual Focus Area (2:1 ratio with spaces section) */}
        <section className="flex-[2] flex flex-col items-center justify-center px-6 animate-fade-in">
          {/* Logo with subtle glow */}
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-3xl bg-primary/10 rounded-full scale-150" />
            <HaloLogo size={56} hoverOnly={true} className="relative" />
          </div>

          {/* Brand name */}
          <h1 className="text-2xl font-semibold mb-3 tracking-tight text-foreground/90">技能范</h1>

          {/* Tagline */}
          <p className="text-muted-foreground text-center text-sm mb-10">
            {t('Aimless time, ideas will crystallize here')}
          </p>

          {/* CTA Button - Claude Code style: subtle, not flashy */}
          <button
            data-onboarding="halo-space"
            onClick={() => haloSpace && handleSpaceClick(haloSpace)}
            disabled={!haloSpace}
            className="px-6 py-3 bg-primary/80 hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('Enter Halo')}
          </button>
        </section>

        {/* Gradient Divider */}
        <div className="h-px mx-6 bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Spaces Section */}
        <section className="flex-[1] overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">自定义空间</h3>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建空间
              </button>
            </div>

            {/* Space Guide - always visible */}
            <SpaceGuide />

            {spaces.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">暂无自定义空间</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
                {spaces.map((space, index) => (
                  <div
                    key={space.id}
                    onClick={() => handleSpaceClick(space)}
                    className={`space-card p-4 group animate-fade-in ${
                      index === 0 ? 'border-primary/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <SpaceIcon iconId={space.icon} size={20} className="flex-shrink-0" />
                        <span className="font-medium truncate">{space.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={(e) => handleEditSpace(e, space)}
                          className="p-1.5 hover:bg-secondary rounded-lg transition-all"
                          title={t('Edit Space')}
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSpace(e, space.id)}
                          className="p-1.5 hover:bg-destructive/20 rounded-lg transition-all"
                          title={t('Delete space')}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('{{count}} artifacts · {{conversations}} conversations', {
                        count: space.stats.artifactCount,
                        conversations: space.stats.conversationCount
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTimeAgo(space.updatedAt)}{t('active')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Create Space Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-drag">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-lg font-medium mb-5">{t('Create Dedicated Space')}</h2>

            {/* 1. Space name - Primary input, most important */}
            <div className="mb-5">
              <label className="block text-sm text-muted-foreground mb-2">{t('Name this space')}</label>
              <input
                ref={spaceNameInputRef}
                type="text"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder={t('My Project')}
                className="w-full px-4 py-2.5 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSpaceName.trim() && !(useCustomPath && !customPath)) {
                    handleCreateSpace()
                  }
                }}
              />
            </div>

            {/* 2. Icon select - Compact, secondary importance */}
            <div className="mb-5">
              <label className="block text-sm text-muted-foreground mb-2">{t('Icon (optional)')}</label>
              <div className="flex flex-wrap gap-1.5">
                {SPACE_ICONS.map((iconId) => (
                  <button
                    key={iconId}
                    onClick={() => setNewSpaceIcon(iconId)}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                      newSpaceIcon === iconId
                        ? 'bg-primary/20 ring-2 ring-primary ring-offset-1 ring-offset-card'
                        : 'bg-secondary/60 hover:bg-secondary'
                    }`}
                  >
                    <SpaceIcon iconId={iconId} size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Advanced settings - Collapsible, lowest priority */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? '' : '-rotate-90'}`} />
                <span>{t('Advanced Settings')}</span>
                {useCustomPath && customPath && (
                  <span className="text-xs text-primary ml-auto">{t('Custom path set')}</span>
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-2 pl-6">
                  <label className="block text-xs text-muted-foreground mb-2">{t('Storage Location')}</label>
                  {/* Default location */}
                  <label
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      !useCustomPath
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pathType"
                      checked={!useCustomPath}
                      onChange={() => {
                        setUseCustomPath(false)
                        setTimeout(() => {
                          spaceNameInputRef.current?.focus()
                        }, 100)
                      }}
                      className="w-3.5 h-3.5 text-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{t('Default Location')}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {shortenPath(defaultPath)}/{newSpaceName || '...'}
                      </div>
                    </div>
                  </label>

                  {/* Custom location */}
                  <label
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                      isWebMode
                        ? 'cursor-not-allowed opacity-60 border-border'
                        : useCustomPath
                          ? 'cursor-pointer border-primary bg-primary/5'
                          : 'cursor-pointer border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pathType"
                      checked={useCustomPath}
                      onChange={() => !isWebMode && setUseCustomPath(true)}
                      disabled={isWebMode}
                      className="w-3.5 h-3.5 text-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{t('Custom Folder')}</div>
                      {isWebMode ? (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          {t('Please select folder in desktop app')}
                        </div>
                      ) : customPath ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {shortenPath(customPath)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {t('Select an existing project or folder')}
                        </div>
                      )}
                    </div>
                    {!isWebMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          handleSelectFolder()
                        }}
                        className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-md flex items-center gap-1 transition-colors"
                      >
                        <FolderOpen className="w-3 h-3" />
                        {t('Browse')}
                      </button>
                    )}
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={resetDialog}
                className="px-4 py-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleCreateSpace}
                disabled={!newSpaceName.trim() || (useCustomPath && !customPath)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Space Dialog */}
      {editingSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-drag">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-lg font-medium mb-4">{t('Edit Space')}</h2>

            {/* Space name */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">{t('Space Name')}</label>
              <input
                type="text"
                value={editSpaceName}
                onChange={(e) => setEditSpaceName(e.target.value)}
                placeholder={t('My Project')}
                className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                autoFocus
              />
            </div>

            {/* Icon select */}
            <div className="mb-6">
              <label className="block text-sm text-muted-foreground mb-2">{t('Icon')}</label>
              <div className="flex flex-wrap gap-2">
                {SPACE_ICONS.map((iconId) => (
                  <button
                    key={iconId}
                    onClick={() => setEditSpaceIcon(iconId)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                      editSpaceIcon === iconId
                        ? 'bg-primary/20 border-2 border-primary'
                        : 'bg-secondary hover:bg-secondary/80'
                    }`}
                  >
                    <SpaceIcon iconId={iconId} size={20} />
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editSpaceName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
