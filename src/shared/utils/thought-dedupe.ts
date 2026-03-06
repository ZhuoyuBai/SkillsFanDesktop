export interface ThoughtLike {
  id: string
  type: string
  toolName?: string
  toolInput?: Record<string, unknown>
  parentToolId?: string
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`
}

export function normalizeToolThoughtId(id: string): string {
  return id
    .replace(/^tool_(use|result)_/, '')
    .replace(/_result$/, '')
}

export function toolResultMatchesThought<T extends ThoughtLike>(
  resultThought: T,
  toolUseThought: T
): boolean {
  if (resultThought.type !== 'tool_result') {
    return false
  }

  return normalizeToolThoughtId(resultThought.id) === normalizeToolThoughtId(toolUseThought.id)
}

export function getToolThoughtFingerprint<T extends ThoughtLike>(thought: T): string | null {
  if (thought.type !== 'tool_use' || !thought.toolName) {
    return null
  }

  return [
    thought.parentToolId || '',
    thought.toolName,
    stableSerialize(thought.toolInput || {})
  ].join('::')
}

export function hasMatchingToolResult<T extends ThoughtLike>(
  thoughts: T[],
  toolUseThought: T
): boolean {
  return thoughts.some((thought) => toolResultMatchesThought(thought, toolUseThought))
}

export function getMatchingToolResult<T extends ThoughtLike>(
  thoughts: T[],
  toolUseThought: T
): T | undefined {
  return thoughts.find((thought) => toolResultMatchesThought(thought, toolUseThought))
}

export function isDuplicateActiveToolUse<T extends ThoughtLike>(
  thoughts: T[],
  candidate: T
): boolean {
  if (candidate.type !== 'tool_use') {
    return false
  }

  const candidateFingerprint = getToolThoughtFingerprint(candidate)
  if (!candidateFingerprint || hasMatchingToolResult(thoughts, candidate)) {
    return false
  }

  return thoughts.some((thought) => {
    if (thought.type !== 'tool_use' || thought.id === candidate.id) {
      return false
    }

    return (
      getToolThoughtFingerprint(thought) === candidateFingerprint &&
      !hasMatchingToolResult(thoughts, thought)
    )
  })
}

export function getLatestVisibleActiveToolUseIds<T extends ThoughtLike>(thoughts: T[]): Set<string> {
  const latestIds = new Map<string, string>()

  for (const thought of thoughts) {
    const fingerprint = getToolThoughtFingerprint(thought)
    if (!fingerprint || hasMatchingToolResult(thoughts, thought)) {
      continue
    }

    latestIds.set(fingerprint, thought.id)
  }

  return new Set(latestIds.values())
}
