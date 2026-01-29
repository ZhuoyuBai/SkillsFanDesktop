/**
 * Home Page - Space list view
 */

import React, { useEffect, useState } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { SPACE_ICONS, DEFAULT_SPACE_ICON, SPACE_ICON_COLORS, DEFAULT_SPACE_ICON_COLOR } from '../types'
import type { Space, SpaceIconId, SpaceIconColorId } from '../types'
import {
  SpaceIcon,
  Settings,
  Plus,
  Trash2,
  Pencil
} from '../components/icons/ToolIcons'
import { Header } from '../components/layout/Header'
import { SpaceGuide } from '../components/space/SpaceGuide'
import { CreateSpaceDialog } from '../components/space/CreateSpaceDialog'
import { HaloLogo } from '../components/brand/HaloLogo'
import { useTranslation } from '../i18n'

export function HomePage() {
  const { t } = useTranslation()
  const { setView } = useAppStore()
  const { haloSpace, spaces, loadSpaces, setCurrentSpace, updateSpace, deleteSpace } = useSpaceStore()

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Edit dialog state
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [editSpaceName, setEditSpaceName] = useState('')
  const [editSpaceIcon, setEditSpaceIcon] = useState<SpaceIconId>(DEFAULT_SPACE_ICON)
  const [editSpaceIconColor, setEditSpaceIconColor] = useState<SpaceIconColorId>(DEFAULT_SPACE_ICON_COLOR)

  // Load spaces on mount
  useEffect(() => {
    loadSpaces()
  }, [loadSpaces])

  // Handle space click - no reset needed, SpacePage handles its own state
  const handleSpaceClick = (space: Space) => {
    setCurrentSpace(space)
    setView('space')
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
    // Find matching color ID from the space's iconColor value
    const colorConfig = SPACE_ICON_COLORS.find(c => c.value === space.iconColor)
    setEditSpaceIconColor((colorConfig?.id || DEFAULT_SPACE_ICON_COLOR) as SpaceIconColorId)
  }

  // Handle save space edit
  const handleSaveEdit = async () => {
    if (!editingSpace || !editSpaceName.trim()) return

    // Get the color value from the color ID
    const colorConfig = SPACE_ICON_COLORS.find(c => c.id === editSpaceIconColor)
    const iconColorValue = colorConfig?.value || ''

    await updateSpace(editingSpace.id, {
      name: editSpaceName.trim(),
      icon: editSpaceIcon,
      iconColor: iconColorValue || undefined
    })

    setEditingSpace(null)
    setEditSpaceName('')
    setEditSpaceIcon(DEFAULT_SPACE_ICON)
    setEditSpaceIconColor(DEFAULT_SPACE_ICON_COLOR)
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingSpace(null)
    setEditSpaceName('')
    setEditSpaceIcon(DEFAULT_SPACE_ICON)
    setEditSpaceIconColor(DEFAULT_SPACE_ICON_COLOR)
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
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center px-8 pt-16 pb-8 animate-fade-in">
          {/* Logo with subtle glow */}
          <div className="relative mb-8">
            <div className="absolute inset-0 blur-3xl bg-muted/20 rounded-full scale-150" />
            <HaloLogo size={64} hoverOnly={true} className="relative" />
          </div>

          {/* Brand name */}
          <h1 className="text-3xl font-semibold mb-4 tracking-tight text-foreground/95 [letter-spacing:-0.02em]">技能范</h1>

          {/* Tagline */}
          <p className="text-muted-foreground text-center text-sm mb-8 max-w-md leading-relaxed">
            {t('Aimless time, ideas will crystallize here')}
          </p>

          {/* CTA Button - Claude Code style: subtle, not flashy */}
          <button
            data-onboarding="halo-space"
            onClick={() => haloSpace && handleSpaceClick(haloSpace)}
            disabled={!haloSpace}
            className="px-8 py-3.5 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('Enter Halo')}
          </button>
        </section>

        {/* Gradient Divider */}
        <div className="h-px mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Spaces Section */}
        <section className="p-8">
          <div className="max-w-5xl mx-auto">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground/80 tracking-wide">自定义空间</h3>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground/80 hover:text-foreground rounded-lg transition-all hover:bg-secondary/50"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
                {spaces.map((space, index) => (
                  <div
                    key={space.id}
                    onClick={() => handleSpaceClick(space)}
                    className={`space-card p-5 group animate-fade-in ${
                      index === 0 ? 'border-foreground/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SpaceIcon iconId={space.icon} size={20} iconColor={space.iconColor} className={`flex-shrink-0 ${space.iconColor ? '' : 'text-foreground/70'}`} />
                        <span className="font-medium truncate text-foreground/90">{space.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={(e) => handleEditSpace(e, space)}
                          className="p-1.5 hover:bg-secondary/80 rounded-lg transition-all"
                          title={t('Edit Space')}
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSpace(e, space.id)}
                          className="p-1.5 hover:bg-destructive/15 rounded-lg transition-all"
                          title={t('Delete space')}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive/80 hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground/70 mt-3">
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
      <CreateSpaceDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      {/* Edit Space Dialog */}
      {editingSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
          {/* Backdrop - click to close */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCancelEdit}
          />
          {/* Dialog content */}
          <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-md max-h-[85vh] overflow-y-auto animate-fade-in shadow-2xl">
            <h2 className="text-lg font-semibold mb-6 text-foreground/95 tracking-tight">{t('Edit Space')}</h2>

            {/* Space name */}
            <div className="mb-6">
              <label className="block text-sm text-muted-foreground mb-2.5 font-medium">{t('Space Name')}</label>
              <input
                type="text"
                value={editSpaceName}
                onChange={(e) => setEditSpaceName(e.target.value)}
                placeholder={t('My Project')}
                className="w-full px-4 py-3 bg-input/50 focus:bg-input rounded-xl border border-border/60 focus:border-foreground/30 focus:outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>

            {/* Icon select */}
            <div className="mb-5">
              <label className="block text-sm text-muted-foreground font-medium mb-2.5">{t('Icon (optional)')}</label>
              <div className="grid grid-cols-7 gap-1.5">
                {/* None option first */}
                <button
                  onClick={() => setEditSpaceIcon('' as SpaceIconId)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    editSpaceIcon === ''
                      ? 'bg-foreground/10 ring-2 ring-foreground/30'
                      : 'bg-secondary/40 hover:bg-secondary/60'
                  }`}
                  title="无"
                >
                  <span className="text-xs text-muted-foreground">无</span>
                </button>
                {SPACE_ICONS.map((iconId) => {
                  const colorConfig = SPACE_ICON_COLORS.find(c => c.id === editSpaceIconColor)
                  const iconColorValue = colorConfig?.value || undefined
                  return (
                    <button
                      key={iconId}
                      onClick={() => setEditSpaceIcon(iconId)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                        editSpaceIcon === iconId
                          ? 'bg-foreground/10 ring-2 ring-foreground/30'
                          : 'bg-secondary/40 hover:bg-secondary/60'
                      }`}
                    >
                      <SpaceIcon iconId={iconId} size={16} iconColor={iconColorValue} className={iconColorValue ? '' : 'text-foreground/70'} />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Color picker */}
            <div className="mb-6">
              <label className="block text-sm text-muted-foreground font-medium mb-2.5">颜色</label>
              <div className="flex gap-2">
                {SPACE_ICON_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setEditSpaceIconColor(color.id as SpaceIconColorId)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      editSpaceIconColor === color.id
                        ? 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-card scale-110'
                        : 'hover:scale-110'
                    }`}
                    style={{
                      backgroundColor: color.value || 'transparent',
                      border: color.id === 'none' ? '2px dashed var(--border)' : 'none'
                    }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCancelEdit}
                className="px-5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editSpaceName.trim()}
                className="px-5 py-2.5 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
