export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh'

const DEFAULT_REASONING_OPTIONS: ThinkingEffort[] = ['off']
const GPT5_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'low', 'medium', 'high']
const GPT5_1_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'low', 'medium', 'high']
const GPT5_2_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'low', 'medium', 'high', 'xhigh']
const GPT5_1_CODEX_MAX_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'medium', 'high', 'xhigh']
const GPT5_1_CODEX_MINI_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'low', 'medium', 'high']
const GPT5_1_CODEX_REASONING_OPTIONS: ThinkingEffort[] = ['off', 'medium', 'high']

function normalizeModelId(modelId?: string | null): string {
  return modelId?.trim().toLowerCase() || ''
}

function getGpt5MinorVersion(modelId?: string | null): number | null {
  const normalized = normalizeModelId(modelId)
  const match = normalized.match(/^gpt-5(?:\.(\d+))?/)
  if (!match) return null
  return match[1] ? Number(match[1]) : 0
}

export function isOpenAIReasoningModel(modelId?: string | null): boolean {
  const normalized = normalizeModelId(modelId)
  return normalized.startsWith('gpt-5')
}

export function isOpenAIModel(modelId?: string | null): boolean {
  const normalized = normalizeModelId(modelId)
  return normalized.startsWith('gpt-')
}

export function getSupportedThinkingEfforts(modelId?: string | null): ThinkingEffort[] {
  const normalized = normalizeModelId(modelId)
  const minorVersion = getGpt5MinorVersion(normalized)
  if (!normalized) return DEFAULT_REASONING_OPTIONS

  if (normalized.startsWith('gpt-5.1-codex-max')) {
    return GPT5_1_CODEX_MAX_REASONING_OPTIONS
  }

  if (normalized.startsWith('gpt-5.1-codex-mini')) {
    return GPT5_1_CODEX_MINI_REASONING_OPTIONS
  }

  if (normalized.startsWith('gpt-5.1-codex') || normalized.startsWith('gpt-5-codex')) {
    return GPT5_1_CODEX_REASONING_OPTIONS
  }

  if (normalized.startsWith('gpt-5.1')) {
    return GPT5_1_REASONING_OPTIONS
  }

  if (minorVersion !== null && minorVersion >= 2) {
    return GPT5_2_REASONING_OPTIONS
  }

  if (normalized === 'gpt-5' || normalized.startsWith('gpt-5-')) {
    return GPT5_REASONING_OPTIONS
  }

  return DEFAULT_REASONING_OPTIONS
}

export function supportsThinkingEffortSelector(modelId?: string | null): boolean {
  return getSupportedThinkingEfforts(modelId).length > 1
}

export function normalizeThinkingEffortForModel(
  modelId: string | null | undefined,
  effort: ThinkingEffort | null | undefined
): ThinkingEffort {
  if (isOpenAIModel(modelId) && !isOpenAIReasoningModel(modelId)) {
    return 'off'
  }

  if (!isOpenAIReasoningModel(modelId)) {
    if (effort === 'xhigh') return 'high'
    return effort || 'off'
  }

  const supported = getSupportedThinkingEfforts(modelId)
  if (effort && supported.includes(effort)) {
    return effort
  }

  return supported[1] || 'off'
}

export function thinkingEffortToBudgetTokens(effort: ThinkingEffort | null | undefined): number | null {
  switch (effort) {
    case 'low':
      return 2048
    case 'medium':
      return 5120
    case 'high':
      return 10240
    case 'xhigh':
      return 20000
    default:
      return null
  }
}

export function budgetTokensToChatReasoningEffort(
  budgetTokens: number | undefined
): 'low' | 'medium' | 'high' {
  if (!budgetTokens) return 'medium'
  if (budgetTokens > 10000) return 'high'
  if (budgetTokens > 5000) return 'medium'
  return 'low'
}

export function budgetTokensToResponsesReasoningEffort(
  budgetTokens: number | undefined
): 'low' | 'medium' | 'high' | 'xhigh' {
  if (!budgetTokens) return 'medium'
  if (budgetTokens >= 18000) return 'xhigh'
  if (budgetTokens > 10000) return 'high'
  if (budgetTokens > 5000) return 'medium'
  return 'low'
}
