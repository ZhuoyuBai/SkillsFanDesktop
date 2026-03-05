/**
 * Feishu Card Builder - Interactive Card Templates
 *
 * Builds Feishu interactive card JSON for various scenarios:
 * tool approval, user questions, status notifications.
 */

/**
 * Build a "thinking" status card.
 */
export function buildThinkingCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Agent' },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: '正在思考...' }
      }
    ]
  }
}

/**
 * Build a tool approval card with Approve/Reject buttons.
 */
export function buildToolApprovalCard(
  toolName: string,
  toolInput: string,
  conversationId: string,
  toolCallId: string
): Record<string, unknown> {
  // Truncate long tool input for display
  const displayInput = toolInput.length > 500 ? toolInput.slice(0, 500) + '...' : toolInput

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '工具执行审批' },
      template: 'orange'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**工具**: ${toolName}\n**参数**:\n\`\`\`\n${displayInput}\n\`\`\``
        }
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '批准' },
            type: 'primary',
            value: JSON.stringify({
              action: 'tool_approve',
              conversationId,
              toolCallId
            })
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '拒绝' },
            type: 'danger',
            value: JSON.stringify({
              action: 'tool_reject',
              conversationId,
              toolCallId
            })
          }
        ]
      }
    ]
  }
}

/**
 * Build a card showing tool approval result (replaces the approval card).
 */
export function buildToolApprovalResultCard(
  toolName: string,
  approved: boolean
): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '工具执行审批' },
      template: approved ? 'green' : 'red'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: approved
            ? `**${toolName}** - 已批准 ✓`
            : `**${toolName}** - 已拒绝 ✗`
        }
      }
    ]
  }
}

/**
 * Build a user question card with option buttons.
 */
export function buildUserQuestionCard(
  question: string,
  options: string[],
  conversationId: string,
  questionId: string
): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Agent 提问' },
      template: 'purple'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: question }
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: options.map((option, index) => ({
          tag: 'button',
          text: { tag: 'plain_text', content: option },
          type: index === 0 ? 'primary' : 'default',
          value: JSON.stringify({
            action: 'user_answer',
            conversationId,
            questionId,
            answer: option
          })
        }))
      }
    ]
  }
}

/**
 * Build a completion card showing final agent response.
 */
export function buildCompleteCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Agent' },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: '任务完成 ✓' }
      }
    ]
  }
}

/**
 * Build a failed status card.
 */
export function buildFailedCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Agent' },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: '执行失败 ✗' }
      }
    ]
  }
}

/**
 * Build an error card.
 */
export function buildErrorCard(errorMessage: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '错误' },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: errorMessage }
      }
    ]
  }
}

/**
 * Build a pairing prompt card.
 */
export function buildPairingPromptCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'SkillsFan' },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '请输入 **6 位配对码** 以授权此会话。\n\n配对码可在 SkillsFan 设置页面中找到。'
        }
      }
    ]
  }
}

/**
 * Build a pairing success card.
 */
export function buildPairingSuccessCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'SkillsFan' },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '配对成功！现在你可以通过飞书与 Agent 对话了。\n\n发送任何消息开始使用。'
        }
      }
    ]
  }
}

/**
 * Build a rate limit card.
 */
export function buildRateLimitCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'SkillsFan' },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: '配对尝试次数过多，请 1 小时后再试。'
        }
      }
    ]
  }
}
