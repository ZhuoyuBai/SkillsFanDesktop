/**
 * SpaceManagementSection - Settings section for managing spaces
 */

import { useState } from 'react'
import { FolderOpen, Pencil, Trash2, Star, Plus, StarOff } from 'lucide-react'
import { useSpaceStore } from '../../stores/space.store'
import { useAppStore } from '../../stores/app.store'
import { SpaceIcon } from '../icons/ToolIcons'
import { HaloLogo } from '../brand/HaloLogo'
import { CreateSpaceDialog } from '../space/CreateSpaceDialog'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import type { Space, HaloConfig, SpaceIconId, SpaceIconColorId } from '../../types'
import { SPACE_ICONS, SPACE_ICON_COLORS, DEFAULT_SPACE_ICON, DEFAULT_SPACE_ICON_COLOR } from '../../types'

export function SpaceManagementSection() {
  const { t } = useTranslation()
  const { haloSpace, spaces, updateSpace, deleteSpace, openSpaceFolder, setCurrentSpace, currentSpace } = useSpaceStore()
  const { config, setConfig } = useAppStore()

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Edit dialog state
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [editSpaceName, setEditSpaceName] = useState('')
  const [editSpaceIcon, setEditSpaceIcon] = useState<SpaceIconId>(DEFAULT_SPACE_ICON)
  const [editSpaceIconColor, setEditSpaceIconColor] = useState<SpaceIconColorId>(DEFAULT_SPACE_ICON_COLOR)

  // Delete confirmation state
  const [deletingSpace, setDeletingSpace] = useState<Space | null>(null)

  const defaultSpaceId = config?.spaces?.defaultSpaceId

  // Set as default space
  const handleSetDefault = async (spaceId: string | null) => {
    const updates = {
      spaces: {
        defaultSpaceId: spaceId
      }
    }
    await api.setConfig(updates)
    setConfig({ ...config, ...updates } as HaloConfig)
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

  // Handle edit space
  const handleEditSpace = (space: Space) => {
    setEditingSpace(space)
    setEditSpaceName(space.name)
    setEditSpaceIcon(space.icon as SpaceIconId)
    const colorConfig = SPACE_ICON_COLORS.find(c => c.value === space.iconColor)
    setEditSpaceIconColor((colorConfig?.id || DEFAULT_SPACE_ICON_COLOR) as SpaceIconColorId)
  }

  // Handle save space edit
  const handleSaveEdit = async () => {
    if (!editingSpace || !editSpaceName.trim()) return

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

  // Handle delete space
  const handleDeleteSpace = async (space: Space) => {
    setDeletingSpace(space)
  }

  // Confirm delete
  const confirmDelete = async () => {
    if (!deletingSpace) return

    // If deleting the current space, switch to Halo first
    if (currentSpace?.id === deletingSpace.id && haloSpace) {
      setCurrentSpace(haloSpace)
    }

    await deleteSpace(deletingSpace.id)

    // If this was the default space, reset to Halo
    if (deletingSpace.id === defaultSpaceId) {
      await handleSetDefault(null)
    }

    setDeletingSpace(null)
  }

  // Render space card
  const renderSpaceCard = (space: Space, isHalo: boolean = false) => {
    const isDefault = isHalo ? !defaultSpaceId : defaultSpaceId === space.id

    return (
      <div
        key={space.id}
        className={`p-4 rounded-xl border transition-all ${
          isDefault ? 'border-primary/50 bg-primary/5' : 'border-border'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 pt-0.5">
            {isHalo ? (
              <HaloLogo size={28} hoverOnly={true} />
            ) : (
              <SpaceIcon iconId={space.icon} size={24} iconColor={space.iconColor} />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">
                {isHalo ? t('Default Space') : space.name}
              </h4>
              {isDefault && (
                <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full flex-shrink-0">
                  {t('Default')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {space.path.replace(/\/Users\/[^/]+/, '~')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('Created')} {formatTimeAgo(space.createdAt)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => openSpaceFolder(space.id)}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
              title={t('Open folder')}
            >
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
            </button>

            {!isHalo && (
              <button
                onClick={() => handleEditSpace(space)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                title={t('Edit')}
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
            )}

            {!isDefault ? (
              <button
                onClick={() => handleSetDefault(isHalo ? null : space.id)}
                className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors"
                title={t('Set as default')}
              >
                <Star className="w-4 h-4 text-muted-foreground hover:text-primary" />
              </button>
            ) : !isHalo && (
              <button
                onClick={() => handleSetDefault(null)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                title={t('Unset default')}
              >
                <StarOff className="w-4 h-4 text-primary" />
              </button>
            )}

            {!isHalo && (
              <button
                onClick={() => handleDeleteSpace(space)}
                className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                title={t('Delete')}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Default Space Section */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          {t('Default Space')}
        </h3>
        {haloSpace && renderSpaceCard(haloSpace, true)}
      </div>

      {/* Custom Spaces Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('Custom Spaces')}
          </h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('Create Space')}
          </button>
        </div>

        {spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('No custom spaces yet')}
          </p>
        ) : (
          <div className="space-y-3">
            {spaces.map(space => renderSpaceCard(space))}
          </div>
        )}
      </div>

      {/* Create Space Dialog */}
      <CreateSpaceDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      {/* Edit Space Dialog */}
      {editingSpace && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
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
                  title={t('None')}
                >
                  <span className="text-xs text-muted-foreground">{t('None')}</span>
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
              <label className="block text-sm text-muted-foreground font-medium mb-2.5">{t('Color')}</label>
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

      {/* Delete Confirmation Dialog */}
      {deletingSpace && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeletingSpace(null)}
          />
          {/* Dialog content */}
          <div className="relative bg-card border border-border/80 rounded-2xl p-6 w-full max-w-sm animate-fade-in shadow-2xl">
            <h2 className="text-lg font-semibold mb-3">{t('Delete Space')}</h2>
            <p className="text-sm text-muted-foreground mb-2">
              {t('Are you sure you want to delete')} <strong>{deletingSpace.name}</strong>?
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              {deletingSpace.path.includes('/.skillsfan/spaces/')
                ? t('All conversations and files in the space will be deleted.')
                : t('Only conversation history will be deleted, your project files will be kept.')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingSpace(null)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl transition-all"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
