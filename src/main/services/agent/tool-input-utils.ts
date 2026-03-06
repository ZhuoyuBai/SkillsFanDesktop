export function sanitizeWebSearchInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...input }

  if (typeof sanitized.query === 'string') {
    sanitized.query = sanitized.query.trim().replace(/\s+/g, ' ')
  }

  // Always strip domain filters — third-party models (GPT, etc.) tend to add
  // overly restrictive allowed_domains that cause empty search results.
  delete sanitized.allowed_domains
  delete sanitized.blocked_domains

  return sanitized
}
