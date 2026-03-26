import type { Thought } from './types'

export const SEND_MESSAGE_REPAIR_HINT_PREFIX = 'SendMessage routing hint:'

function isMissingContentSendMessageError(output: string): boolean {
  return output.includes('InputValidationError: SendMessage failed')
    && output.includes('required parameter `content` is missing')
}

export function buildSendMessageRepairHint(options: {
  recipient?: string
  recipientIsSkill?: boolean
}): string {
  const parts = [
    `${SEND_MESSAGE_REPAIR_HINT_PREFIX} SendMessage is only for messaging an existing agent team member and it requires a non-empty "content" field.`
  ]

  if (options.recipient && options.recipientIsSkill) {
    parts.push(`"${options.recipient}" is a skill, not a team member. Use the Skill tool to load that skill.`)
  } else {
    parts.push('Do not use SendMessage as the first step when you simply want to delegate work.')
  }

  parts.push('For one-off delegated work, use mcp__local-tools__subagent_spawn instead.')

  return parts.join(' ')
}

export function normalizeRepairableSendMessageResult(options: {
  thought: Thought
  toolName?: string
  toolInput?: Record<string, unknown>
  recipientIsSkill?: boolean
}): Thought {
  const { thought, toolName, toolInput, recipientIsSkill } = options
  const output = thought.toolOutput || ''

  if (toolName !== 'SendMessage' || !thought.isError || !output) {
    return thought
  }

  const hasRepairHint = output.includes(SEND_MESSAGE_REPAIR_HINT_PREFIX)
  const isSkillScopedMissingContent = Boolean(thought.parentToolId) && isMissingContentSendMessageError(output)

  if (!hasRepairHint && !isSkillScopedMissingContent) {
    return thought
  }

  const recipient = typeof toolInput?.recipient === 'string' ? toolInput.recipient : undefined
  const friendlyOutput = hasRepairHint
    ? output.replace(SEND_MESSAGE_REPAIR_HINT_PREFIX, 'System auto-corrected the tool choice:')
    : [
        'System auto-corrected an incomplete SendMessage call and continued on a better execution path.',
        recipient && recipientIsSkill
          ? `"${recipient}" is a skill, so this should use the Skill tool or a hosted subagent instead of SendMessage.`
          : 'For one-off delegated work, the model should use a hosted subagent instead of SendMessage.'
      ].join(' ')

  return {
    ...thought,
    content: 'Tool routing corrected',
    toolOutput: friendlyOutput,
    isError: false
  }
}
