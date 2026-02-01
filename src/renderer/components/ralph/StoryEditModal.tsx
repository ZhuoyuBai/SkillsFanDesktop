/**
 * Story Edit Modal - Edit a single user story
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { UserStory } from '../../stores/ralph.store'

interface StoryEditModalProps {
  story: UserStory
  isNew: boolean
  onSave: (story: UserStory) => void
  onClose: () => void
}

export function StoryEditModal({ story, isNew, onSave, onClose }: StoryEditModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(story.title)
  const [description, setDescription] = useState(story.description)
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>(story.acceptanceCriteria)
  const [notes, setNotes] = useState(story.notes)
  const [newCriterion, setNewCriterion] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [requireTypecheck, setRequireTypecheck] = useState(story.requireTypecheck ?? false)
  const [requireTests, setRequireTests] = useState(story.requireTests ?? false)

  const handleAddCriterion = () => {
    if (newCriterion.trim()) {
      setAcceptanceCriteria([...acceptanceCriteria, newCriterion.trim()])
      setNewCriterion('')
    }
  }

  const handleRemoveCriterion = (index: number) => {
    setAcceptanceCriteria(acceptanceCriteria.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!title.trim()) return

    onSave({
      ...story,
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria,
      notes: notes.trim(),
      requireTypecheck,
      requireTests
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddCriterion()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isNew ? t('Add Story') : t('Edit Story')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">{t('Title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('Short descriptive title')}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">{t('Description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('As a [user], I want [goal] so that [benefit]')}
              rows={3}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t('Acceptance Criteria')}
            </label>
            <div className="space-y-2">
              {acceptanceCriteria.map((criterion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={criterion}
                    onChange={(e) => {
                      const newCriteria = [...acceptanceCriteria]
                      newCriteria[index] = e.target.value
                      setAcceptanceCriteria(newCriteria)
                    }}
                    className="flex-1 px-3 py-1.5 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => handleRemoveCriterion(index)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Add new criterion */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('Add criterion...')}
                  className="flex-1 px-3 py-1.5 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleAddCriterion}
                  disabled={!newCriterion.trim()}
                  className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Press Enter to add')}
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t('Notes')} <span className="text-muted-foreground font-normal">({t('Optional')})</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('Additional notes or context')}
              rows={2}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Advanced Settings */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                size={16}
                className={cn('transition-transform', showAdvanced && 'rotate-180')}
              />
              {t('Advanced Settings')}
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-md border border-border">
                <div className="text-sm font-medium text-foreground">{t('Quality Gates')}</div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireTypecheck}
                      onChange={(e) => setRequireTypecheck(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">{t('Typecheck')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireTests}
                      onChange={(e) => setRequireTests(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">{t('Tests')}</span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 {t('Enable when writing code to ensure quality')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isNew ? t('Add') : t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
