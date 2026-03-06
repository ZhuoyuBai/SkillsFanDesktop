function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized = value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)

  if (normalized.length === 0) {
    return undefined
  }

  return [...new Set(normalized)]
}

export function sanitizeWebSearchInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...input }

  if (typeof sanitized.query === 'string') {
    sanitized.query = sanitized.query.trim().replace(/\s+/g, ' ')
  }

  const allowedDomains = normalizeStringArray(sanitized.allowed_domains)
  const blockedDomains = normalizeStringArray(sanitized.blocked_domains)

  if (allowedDomains) {
    sanitized.allowed_domains = allowedDomains
  } else {
    delete sanitized.allowed_domains
  }

  if (blockedDomains) {
    sanitized.blocked_domains = blockedDomains
  } else {
    delete sanitized.blocked_domains
  }

  // The backend rejects requests that specify both filters, even when one is effectively empty.
  // Prefer the positive allow-list because it is narrower and matches the model's intent better.
  if (sanitized.allowed_domains && sanitized.blocked_domains) {
    delete sanitized.blocked_domains
  }

  return sanitized
}
