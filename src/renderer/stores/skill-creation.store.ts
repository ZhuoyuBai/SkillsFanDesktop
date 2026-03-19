/**
 * Skill Creation Store - Wizard state machine for creating skills
 *
 * Flow: Step 1 (Form) → Step 2 (AI Generate + Preview/Edit) → Step 3 (Save + Complete)
 */

import { create } from 'zustand'
import { api } from '../api'
import { createLogger } from '../lib/logger'
import type { Conversation } from '../types'

const logger = createLogger('SkillCreationStore')

export interface SkillFormData {
  skillName: string
  whatItDoes: string
  whenToTrigger: string
}

export interface GeneratedContent {
  name: string
  description: string
  body: string
}

export interface SkillCreationState {
  // Wizard step
  wizardStep: 1 | 2 | 3

  // Space context
  spaceId: string | null

  // Step 1: Form data
  formData: SkillFormData

  // Step 2: Generated content
  generatedContent: GeneratedContent | null
  isGenerating: boolean
  generateError: string | null

  // Temp conversation for AI generation
  tempConversationId: string | null

  // Step 3: Save result
  savedSkillName: string | null

  // Actions
  startCreation: (spaceId: string) => void
  setWizardStep: (step: 1 | 2 | 3) => void
  updateFormData: (updates: Partial<SkillFormData>) => void
  updateGeneratedContent: (updates: Partial<GeneratedContent>) => void
  generateSkill: () => Promise<void>
  saveSkill: () => Promise<boolean>
  reset: () => void
  cleanup: () => Promise<void>
}

/**
 * Parse SKILL.md content from a markdown code block in streaming output.
 * Looks for ```markdown ... ``` and extracts frontmatter + body.
 */
export function parseSkillContent(rawOutput: string): GeneratedContent | null {
  // Match ```markdown ... ``` code block
  const codeBlockMatch = rawOutput.match(/```markdown\s*\n([\s\S]*?)```/)
  if (!codeBlockMatch) return null

  const content = codeBlockMatch[1].trim()

  // Parse frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!fmMatch) return null

  const frontmatter = fmMatch[1]
  const body = fmMatch[2].trim()

  // Extract name and description from frontmatter
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

  if (!nameMatch) return null

  return {
    name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    body
  }
}

/**
 * Assemble final SKILL.md content from structured parts.
 */
export function assembleSkillMd(content: GeneratedContent): string {
  const parts: string[] = []
  parts.push('---')
  parts.push(`name: ${content.name}`)
  parts.push(`description: ${content.description}`)
  parts.push('---')
  parts.push('')
  parts.push(content.body)
  return parts.join('\n')
}

/**
 * Build the skill-creator prompt from form data.
 */
function buildPromptFromForm(formData: SkillFormData): string {
  const parts: string[] = []
  parts.push('<skill-creator-mode>')
  parts.push('Generate a complete SKILL.md file based on the user\'s input below.')
  parts.push('')
  parts.push('## User Input')
  parts.push(`- **What it does**: ${formData.whatItDoes}`)
  parts.push(`- **When to trigger**: ${formData.whenToTrigger}`)
  if (formData.skillName) {
    parts.push(`- **Preferred name**: ${formData.skillName}`)
  }
  parts.push('')
  parts.push('## Output Requirements')
  parts.push('')
  parts.push('Output the COMPLETE SKILL.md content inside a single markdown code block:')
  parts.push('')
  parts.push('```markdown')
  parts.push('---')
  parts.push('name: skill-name-here')
  parts.push('description: Trigger description here')
  parts.push('---')
  parts.push('')
  parts.push('# Skill Title')
  parts.push('(instructions here)')
  parts.push('```')
  parts.push('')
  parts.push('## Rules')
  parts.push('- **name**: MUST be lowercase English with hyphens (e.g., "code-review"). If the user provided a non-English name, translate it to an appropriate English identifier.')
  parts.push('- **description**: Primary triggering mechanism. Be specific and action-oriented.')
  parts.push('- **body**: Practical, actionable instructions. Use imperative form. Keep under 500 lines.')
  parts.push('- Output ONLY the markdown code block. No additional text.')
  parts.push('</skill-creator-mode>')
  return parts.join('\n')
}

function getLatestAssistantContent(conversation: Conversation): string | null {
  const latestAssistantMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content.trim().length > 0)

  return latestAssistantMessage?.content ?? null
}

async function fetchGeneratedSkillContent(
  spaceId: string,
  conversationId: string
): Promise<GeneratedContent> {
  const response = await api.getConversation(spaceId, conversationId)
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load generated skill')
  }

  const assistantContent = getLatestAssistantContent(response.data as Conversation)
  if (!assistantContent) {
    throw new Error('No generated content found')
  }

  const parsed = parseSkillContent(assistantContent)
  if (!parsed) {
    throw new Error('Failed to parse generated content. Please try again.')
  }

  return parsed
}

export const useSkillCreationStore = create<SkillCreationState>((set, get) => ({
  wizardStep: 1,
  spaceId: null,
  formData: { skillName: '', whatItDoes: '', whenToTrigger: '' },
  generatedContent: null,
  isGenerating: false,
  generateError: null,
  tempConversationId: null,
  savedSkillName: null,

  startCreation: (spaceId: string) => {
    set({
      wizardStep: 1,
      spaceId,
      formData: { skillName: '', whatItDoes: '', whenToTrigger: '' },
      generatedContent: null,
      isGenerating: false,
      generateError: null,
      tempConversationId: null,
      savedSkillName: null
    })
    // Selection type is set by ConversationList directly
  },

  setWizardStep: (step) => set({ wizardStep: step }),

  updateFormData: (updates) => set((state) => ({
    formData: { ...state.formData, ...updates }
  })),

  updateGeneratedContent: (updates) => set((state) => ({
    generatedContent: state.generatedContent
      ? { ...state.generatedContent, ...updates }
      : null
  })),

  generateSkill: async () => {
    const { spaceId, formData } = get()
    if (!spaceId || !formData.whatItDoes.trim()) return

    set({ isGenerating: true, generateError: null, wizardStep: 2 })

    try {
      const messagePrefix = buildPromptFromForm(formData)

      // Create a temp conversation for AI generation
      let conversationId = get().tempConversationId
      if (!conversationId) {
        const response = await api.createConversation(spaceId)
        if (!response.success || !response.data) {
          throw new Error('Failed to create conversation')
        }
        conversationId = (response.data as { id: string }).id
        set({ tempConversationId: conversationId })
      }

      // Send message with skill-creator prompt as prefix
      const sendResponse = await api.sendMessage({
        spaceId,
        conversationId,
        message: 'Please generate a skill based on my description.',
        messagePrefix
      })
      if (!sendResponse.success) {
        throw new Error(sendResponse.error || 'Generation failed')
      }

      const generatedContent = await fetchGeneratedSkillContent(spaceId, conversationId)
      set({
        generatedContent,
        isGenerating: false,
        generateError: null
      })

    } catch (error) {
      logger.error('[SkillCreation] Generate failed:', error)
      set({
        isGenerating: false,
        generateError: error instanceof Error ? error.message : 'Generation failed'
      })
    }
  },

  saveSkill: async () => {
    const { generatedContent } = get()
    if (!generatedContent) return false

    try {
      const skillMd = assembleSkillMd(generatedContent)
      const response = await api.saveSkillContent(generatedContent.name, skillMd)

      if (response.success) {
        set({ savedSkillName: generatedContent.name, wizardStep: 3 })
        api.reloadSkills()
        return true
      } else {
        logger.error('[SkillCreation] Save failed:', response.error)
        return false
      }
    } catch (error) {
      logger.error('[SkillCreation] Save failed:', error)
      return false
    }
  },

  reset: () => {
    set({
      wizardStep: 1,
      spaceId: null,
      formData: { skillName: '', whatItDoes: '', whenToTrigger: '' },
      generatedContent: null,
      isGenerating: false,
      generateError: null,
      tempConversationId: null,
      savedSkillName: null
    })
  },

  cleanup: async () => {
    const { tempConversationId, spaceId } = get()
    if (tempConversationId && spaceId) {
      try {
        await api.deleteConversation(spaceId, tempConversationId)
      } catch {
        // Ignore cleanup errors
      }
    }
    get().reset()
  }
}))
