import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  getConversation: vi.fn(),
  saveSkillContent: vi.fn(),
  reloadSkills: vi.fn(),
  deleteConversation: vi.fn()
}))

vi.mock('../../../../src/renderer/api', () => ({
  api: apiMock
}))

import { useSkillCreationStore } from '../../../../src/renderer/stores/skill-creation.store'

function resetSkillCreationStore(): void {
  useSkillCreationStore.setState({
    wizardStep: 1,
    spaceId: null,
    formData: { skillName: '', whatItDoes: '', whenToTrigger: '' },
    generatedContent: null,
    isGenerating: false,
    generateError: null,
    tempConversationId: null,
    savedSkillName: null
  })
}

describe('skill creation store', () => {
  beforeEach(() => {
    resetSkillCreationStore()
    Object.values(apiMock).forEach((mockFn) => mockFn.mockReset())
  })

  it('loads the generated skill from the completed conversation after sendMessage resolves', async () => {
    apiMock.createConversation.mockResolvedValue({
      success: true,
      data: { id: 'conv-1' }
    })
    apiMock.sendMessage.mockResolvedValue({
      success: true
    })
    apiMock.getConversation.mockResolvedValue({
      success: true,
      data: {
        id: 'conv-1',
        spaceId: 'space-1',
        title: 'Please generate a skill based on my description.',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:10.000Z',
        messageCount: 2,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Please generate a skill based on my description.',
            timestamp: '2026-03-19T00:00:00.000Z'
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: `\`\`\`markdown
---
name: xiaohongshu-writer
description: Helps write Xiaohongshu-style posts.
---

## Output
- Write clear sections
\`\`\``,
            timestamp: '2026-03-19T00:00:10.000Z'
          }
        ]
      }
    })

    useSkillCreationStore.setState({
      spaceId: 'space-1',
      formData: {
        skillName: '小红书写手',
        whatItDoes: 'Write Xiaohongshu posts.',
        whenToTrigger: 'When the user asks for Xiaohongshu copy.'
      }
    })

    await useSkillCreationStore.getState().generateSkill()

    const state = useSkillCreationStore.getState()
    expect(apiMock.sendMessage).toHaveBeenCalledTimes(1)
    expect(apiMock.getConversation).toHaveBeenCalledWith('space-1', 'conv-1')
    expect(state.tempConversationId).toBe('conv-1')
    expect(state.isGenerating).toBe(false)
    expect(state.generateError).toBeNull()
    expect(state.generatedContent).toEqual({
      name: 'xiaohongshu-writer',
      description: 'Helps write Xiaohongshu-style posts.',
      body: '## Output\n- Write clear sections'
    })
  })
})
