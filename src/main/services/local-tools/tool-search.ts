import type { ToolCatalogEntry } from '../../../gateway/tools/types'

export interface ToolSearchResult extends ToolCatalogEntry {
  score: number
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter(Boolean)
}

function computeRegexScore(entry: ToolCatalogEntry, matcher: RegExp): number {
  const haystack = `${entry.name}\n${entry.description}`
  matcher.lastIndex = 0
  const matches = haystack.match(matcher)
  if (!matches) return 0
  return matches.length + (matcher.test(entry.name) ? 2 : 0)
}

export function searchToolsByRegex(args: {
  catalog: ToolCatalogEntry[]
  pattern: string
  caseSensitive?: boolean
  limit?: number
}): ToolSearchResult[] {
  const flags = args.caseSensitive ? 'g' : 'gi'
  const matcher = new RegExp(args.pattern, flags)
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit || 10)))

  return args.catalog
    .map((entry) => ({
      ...entry,
      score: computeRegexScore(entry, matcher)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function searchToolsByBm25(args: {
  catalog: ToolCatalogEntry[]
  query: string
  limit?: number
}): ToolSearchResult[] {
  const queryTerms = tokenize(args.query)
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit || 10)))
  if (queryTerms.length === 0) return []

  const docs = args.catalog.map((entry) => {
    const nameTerms = tokenize(entry.name)
    const descriptionTerms = tokenize(entry.description)
    const tokens = [...nameTerms, ...nameTerms, ...descriptionTerms]
    const frequencies = new Map<string, number>()
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1)
    }
    return {
      entry,
      frequencies,
      length: tokens.length || 1
    }
  })

  const avgDocLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1)
  const k1 = 1.2
  const b = 0.75

  const docFrequency = new Map<string, number>()
  for (const term of queryTerms) {
    const count = docs.reduce((sum, doc) => sum + (doc.frequencies.has(term) ? 1 : 0), 0)
    docFrequency.set(term, count)
  }

  return docs
    .map((doc) => {
      let score = 0

      for (const term of queryTerms) {
        const frequency = doc.frequencies.get(term) || 0
        if (frequency === 0) continue

        const df = docFrequency.get(term) || 0
        const idf = Math.log(1 + ((docs.length - df + 0.5) / (df + 0.5)))
        const numerator = frequency * (k1 + 1)
        const denominator = frequency + k1 * (1 - b + b * (doc.length / Math.max(avgDocLength, 1)))
        score += idf * (numerator / denominator)
      }

      return {
        ...doc.entry,
        score
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}
