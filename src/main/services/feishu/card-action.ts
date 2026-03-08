function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [key, entry as string])
  )
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function tryParseQueryString(raw: string): Record<string, string> | null {
  if (!raw.includes('=')) return null

  const params = new URLSearchParams(raw)
  const entries = Array.from(params.entries())
  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

export function parseFeishuCardActionValue(raw: unknown): Record<string, string> | null {
  if (!raw) return null

  if (typeof raw === 'object') {
    const valueObject = raw as Record<string, unknown>

    if (typeof valueObject.value === 'string') {
      return parseFeishuCardActionValue(valueObject.value)
    }

    if (typeof valueObject.action === 'string' || typeof valueObject.conversationId === 'string') {
      return toStringRecord(valueObject)
    }

    const firstString = Object.values(valueObject).find((value) => typeof value === 'string')
    if (typeof firstString === 'string') {
      return parseFeishuCardActionValue(firstString)
    }

    return null
  }

  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const directJson = tryParseJson(trimmed)
  if (directJson && typeof directJson === 'object') {
    return parseFeishuCardActionValue(directJson)
  }
  if (typeof directJson === 'string') {
    return parseFeishuCardActionValue(directJson)
  }

  try {
    const decoded = decodeURIComponent(trimmed)
    if (decoded !== trimmed) {
      return parseFeishuCardActionValue(decoded)
    }
  } catch {
    // ignore malformed URI sequences
  }

  return tryParseQueryString(trimmed)
}
