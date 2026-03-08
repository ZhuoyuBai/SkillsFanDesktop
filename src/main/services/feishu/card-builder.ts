/**
 * Feishu Card Builder - Interactive Card Templates
 *
 * Builds Feishu interactive card JSON for various scenarios:
 * tool approval, user questions, status notifications.
 */

export type FeishuCardLocale = 'zh-CN' | 'zh-TW' | 'en'

const CARD_COPY: Record<FeishuCardLocale, Record<string, string>> = {
  'zh-CN': {
    statusTitle: '任务状态',
    thinking: '正在处理你的请求…',
    working: '正在处理你的请求：',
    toolApprovalTitle: '工具执行审批',
    toolLabel: '工具',
    toolInputLabel: '参数',
    approve: '批准',
    reject: '拒绝',
    approved: '已批准 ✓',
    rejected: '已拒绝 ✗',
    questionTitle: '任务提问',
    complete: '任务完成 ✓',
    failed: '执行失败 ✗',
    errorTitle: '错误',
    pairingPrompt: '请输入 **6 位配对码** 以授权此会话。\n\n配对码可在 SkillsFan 设置页面中找到。',
    pairingSuccess: '配对成功！现在你可以通过飞书与 Agent 对话了。\n\n发送任何消息开始使用。',
    rateLimit: '配对尝试次数过多，请 1 小时后再试。'
  },
  'zh-TW': {
    statusTitle: '任務狀態',
    thinking: '正在處理你的請求…',
    working: '正在處理你的請求：',
    toolApprovalTitle: '工具執行審批',
    toolLabel: '工具',
    toolInputLabel: '參數',
    approve: '批准',
    reject: '拒絕',
    approved: '已批准 ✓',
    rejected: '已拒絕 ✗',
    questionTitle: '任務提問',
    complete: '任務完成 ✓',
    failed: '執行失敗 ✗',
    errorTitle: '錯誤',
    pairingPrompt: '請輸入 **6 位配對碼** 以授權此會話。\n\n配對碼可在 SkillsFan 設定頁面中找到。',
    pairingSuccess: '配對成功！現在你可以透過飛書與 Agent 對話了。\n\n發送任何訊息開始使用。',
    rateLimit: '配對嘗試次數過多，請 1 小時後再試。'
  },
  en: {
    statusTitle: 'Task Status',
    thinking: 'Working on your request…',
    working: 'Working on your request:',
    toolApprovalTitle: 'Tool Approval',
    toolLabel: 'Tool',
    toolInputLabel: 'Parameters',
    approve: 'Approve',
    reject: 'Reject',
    approved: 'Approved ✓',
    rejected: 'Rejected ✗',
    questionTitle: 'Question',
    complete: 'Task complete ✓',
    failed: 'Execution failed ✗',
    errorTitle: 'Error',
    pairingPrompt: 'Enter the **6-digit pairing code** to authorize this chat.\n\nYou can find the code in SkillsFan settings.',
    pairingSuccess: 'Pairing complete. You can now chat with the agent in Feishu.\n\nSend any message to begin.',
    rateLimit: 'Too many pairing attempts. Please try again in 1 hour.'
  }
}

function getCopy(locale: FeishuCardLocale): Record<string, string> {
  return CARD_COPY[locale] ?? CARD_COPY.en
}

/**
 * Build a "thinking" status card.
 */
export function buildThinkingCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.statusTitle },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: copy.thinking }
      }
    ]
  }
}

/**
 * Build a "thinking" status card with active tool calls listed.
 */
export function buildThinkingCardWithTools(
  tools: string[],
  locale: FeishuCardLocale = 'zh-CN'
): Record<string, unknown> {
  const copy = getCopy(locale)
  const toolLines = tools.join('\n')
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.statusTitle },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: toolLines ? `${copy.working}\n${toolLines}` : copy.thinking
        }
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
  toolCallId: string,
  locale: FeishuCardLocale = 'zh-CN'
): Record<string, unknown> {
  const copy = getCopy(locale)
  // Truncate long tool input for display
  const displayInput = toolInput.length > 500 ? toolInput.slice(0, 500) + '...' : toolInput

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.toolApprovalTitle },
      template: 'orange'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${copy.toolLabel}**: ${toolName}\n**${copy.toolInputLabel}**:\n\`\`\`\n${displayInput}\n\`\`\``
        }
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: copy.approve },
            type: 'primary',
            value: JSON.stringify({
              action: 'tool_approve',
              conversationId,
              toolCallId
            })
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: copy.reject },
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
  approved: boolean,
  locale: FeishuCardLocale = 'zh-CN'
): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.toolApprovalTitle },
      template: approved ? 'green' : 'red'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: approved
            ? `**${toolName}** - ${copy.approved}`
            : `**${toolName}** - ${copy.rejected}`
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
  questionId: string,
  locale: FeishuCardLocale = 'zh-CN'
): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.questionTitle },
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
export function buildCompleteCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.statusTitle },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: copy.complete }
      }
    ]
  }
}

/**
 * Build a failed status card.
 */
export function buildFailedCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.statusTitle },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: copy.failed }
      }
    ]
  }
}

/**
 * Build an error card.
 */
export function buildErrorCard(
  errorMessage: string,
  locale: FeishuCardLocale = 'zh-CN'
): Record<string, unknown> {
  const copy = getCopy(locale)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: copy.errorTitle },
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
export function buildPairingPromptCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
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
          content: copy.pairingPrompt
        }
      }
    ]
  }
}

/**
 * Build a pairing success card.
 */
export function buildPairingSuccessCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
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
          content: copy.pairingSuccess
        }
      }
    ]
  }
}

/**
 * Build a rate limit card.
 */
export function buildRateLimitCard(locale: FeishuCardLocale = 'zh-CN'): Record<string, unknown> {
  const copy = getCopy(locale)
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
          content: copy.rateLimit
        }
      }
    ]
  }
}
