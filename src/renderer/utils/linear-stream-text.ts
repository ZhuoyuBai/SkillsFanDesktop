export function trimBoundaryBlankLines(content: string): string {
  return content
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '')
}

export function isCompactLinearStreamText(content: string): boolean {
  const normalized = trimBoundaryBlankLines(content)
  return normalized.length > 0 && !normalized.includes('\n') && normalized.trim().length < 80
}
