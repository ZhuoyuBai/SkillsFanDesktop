/**
 * Ralph Story Editor - Edit and manage user stories
 *
 * Allows users to:
 * - View and reorder stories (drag and drop)
 * - Edit individual stories
 * - Add new stories
 * - Remove stories
 * - Start execution
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Play,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { useRalphStore, type UserStory } from '../../stores/ralph.store'
import { api } from '../../api'
import { StoryEditModal } from './StoryEditModal'

export function RalphStoryEditor() {
  const { t } = useTranslation()
  const {
    stories,
    setStories,
    addStory,
    updateStory,
    removeStory,
    reorderStories,
    projectDir,
    description,
    maxIterations,
    branchName,
    setView,
    setCurrentTask,
    setError,
    isGenerating
  } = useRalphStore()

  const [editingStory, setEditingStory] = useState<UserStory | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [isStarting, setIsStarting] = useState(false)

  const toggleExpand = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev)
      if (next.has(storyId)) {
        next.delete(storyId)
      } else {
        next.add(storyId)
      }
      return next
    })
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      reorderStories(index, index - 1)
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < stories.length - 1) {
      reorderStories(index, index + 1)
    }
  }

  const handleStartExecution = async () => {
    if (stories.length === 0) {
      setError(t('Please add at least one story'))
      return
    }

    setIsStarting(true)
    try {
      // Create task
      const createResult = await api.ralphCreateTask({
        projectDir,
        description,
        stories,
        maxIterations,
        branchName: branchName || undefined
      })

      if (!createResult.success || !createResult.data) {
        setError(createResult.error || t('Failed to create task'))
        setIsStarting(false)
        return
      }

      setCurrentTask(createResult.data)

      // Start task
      const startResult = await api.ralphStart(createResult.data.id)
      if (!startResult.success) {
        setError(startResult.error || t('Failed to start task'))
        setIsStarting(false)
        return
      }

      // Navigate to progress view
      setView('progress')
    } catch (err) {
      setError(t('Failed to start task'))
    } finally {
      setIsStarting(false)
    }
  }

  const handleSaveStory = (story: UserStory) => {
    if (isCreating) {
      // Add new story
      addStory({
        title: story.title,
        description: story.description,
        acceptanceCriteria: story.acceptanceCriteria,
        priority: story.priority,
        notes: story.notes
      })
    } else {
      // Update existing
      updateStory(story.id, story)
    }
    setEditingStory(null)
    setIsCreating(false)
  }

  const handleAddStory = () => {
    setIsCreating(true)
    setEditingStory({
      id: '', // Will be generated
      title: '',
      description: '',
      acceptanceCriteria: ['Typecheck passes'],
      priority: stories.length + 1,
      status: 'pending',
      notes: ''
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-lg font-medium text-foreground">{t('User Stories')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('stories_count', { count: stories.length })} · {t('Click to expand, drag to reorder')}
        </p>
      </div>

      {/* Story List */}
      <div className="flex-1 overflow-auto p-4">
        {stories.length === 0 ? (
          isGenerating ? (
            // Loading state when AI is generating stories
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-muted-foreground">{t('Generating stories...')}</p>
            </div>
          ) : (
            // Empty state when no stories
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="mb-4">{t('No stories yet')}</p>
              <button
                onClick={handleAddStory}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                {t('Add Story')}
              </button>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {stories.map((story, index) => (
              <div
                key={story.id}
                className="border border-border rounded-lg bg-card overflow-hidden"
              >
                {/* Story Header */}
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => toggleExpand(story.id)}
                >
                  {/* Drag handle (placeholder - would use dnd-kit for real drag) */}
                  <div className="text-muted-foreground cursor-grab">
                    <GripVertical size={16} />
                  </div>

                  {/* Priority badge */}
                  <span className="w-6 h-6 flex items-center justify-center bg-muted rounded text-xs font-medium text-muted-foreground">
                    {story.priority}
                  </span>

                  {/* Story ID */}
                  <span className="font-mono text-xs text-muted-foreground">{story.id}</span>

                  {/* Title */}
                  <span className="flex-1 font-medium text-foreground truncate">
                    {story.title}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t('Move up')}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === stories.length - 1}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t('Move down')}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false)
                        setEditingStory(story)
                      }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title={t('Edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => removeStory(story.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title={t('Remove')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Expand indicator */}
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${
                      expandedStories.has(story.id) ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {/* Story Details (expanded) */}
                {expandedStories.has(story.id) && (
                  <div className="px-4 pb-4 pt-0 border-t border-border bg-muted/30">
                    <div className="pt-3 space-y-3">
                      {/* Description */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {t('Description')}
                        </div>
                        <p className="text-sm text-foreground">{story.description}</p>
                      </div>

                      {/* Acceptance Criteria */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {t('Acceptance Criteria')}
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          {story.acceptanceCriteria.map((criterion, i) => (
                            <li key={i} className="text-sm text-foreground">
                              {criterion}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Notes */}
                      {story.notes && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            {t('Notes')}
                          </div>
                          <p className="text-sm text-muted-foreground">{story.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add Story Button */}
            <button
              onClick={handleAddStory}
              className="w-full p-4 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              {t('Add Story')}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setView('setup')}
          disabled={isGenerating}
          className="px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={16} />
          {t('Back')}
        </button>
        <button
          onClick={handleStartExecution}
          disabled={stories.length === 0 || isStarting || isGenerating}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isStarting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              {t('Starting...')}
            </>
          ) : (
            <>
              <Play size={16} />
              {t('Start Execution')}
            </>
          )}
        </button>
      </div>

      {/* Edit Modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory}
          isNew={isCreating}
          onSave={handleSaveStory}
          onClose={() => {
            setEditingStory(null)
            setIsCreating(false)
          }}
        />
      )}
    </div>
  )
}
