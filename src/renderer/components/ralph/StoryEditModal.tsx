/**
 * Story Edit Modal - Edit a single user story (sub-task step)
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
    const pendingCriterion = newCriterion.trim()
    const normalizedCriteria = acceptanceCriteria
      .map((criterion) => criterion.trim())
      .filter(Boolean)
    if (pendingCriterion) {
      normalizedCriteria.push(pendingCriterion)
    }

    onSave({
      ...story,
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: normalizedCriteria,
      notes: '',
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
      <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isNew ? t('Add Sub-task') : t('Edit Sub-task')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Title */}
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-foreground">
              {t('What should this step do?')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('e.g. Implement user login page')}
              autoFocus
              className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-primary/50"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-foreground">
              {t('Specific requirements')} <span className="text-muted-foreground font-normal">({t('Optional')})</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Describe the detailed requirements...')}
              rows={4}
              className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-primary/50 resize-none"
            />
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-foreground">
              {t("How to know it's done?")} <span className="text-muted-foreground font-normal">({t('Optional')})</span>
            </label>
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Existing criteria */}
              {acceptanceCriteria.length > 0 && (
                <div className="divide-y divide-border">
                  {acceptanceCriteria.map((criterion, index) => (
                    <div key={index} className="flex items-center gap-2 px-3 py-2 group">
                      <span className="text-primary/60 text-xs shrink-0">&#10003;</span>
                      <input
                        type="text"
                        value={criterion}
                        onChange={(e) => {
                          const newCriteria = [...acceptanceCriteria]
                          newCriteria[index] = e.target.value
                          setAcceptanceCriteria(newCriteria)
                        }}
                        className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveCriterion(index)}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new criterion input */}
              <div className={cn(
                'flex items-center gap-2 px-3 py-2',
                acceptanceCriteria.length > 0 && 'border-t border-border'
              )}>
                <input
                  type="text"
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('Type a criterion, press Enter to add...')}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleAddCriterion}
                  disabled={!newCriterion.trim()}
                  className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                size={15}
                className={cn('transition-transform', showAdvanced && 'rotate-180')}
              />
              {t('Quality Gates')}
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
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
                  {t('Enable when writing code to ensure quality')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isNew ? t('Confirm Add') : t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
