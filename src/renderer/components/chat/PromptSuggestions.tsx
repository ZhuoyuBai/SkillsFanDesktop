/**
 * PromptSuggestions - Context-aware follow-up suggestions after assistant response
 *
 * Priority:
 * 1. Extract actionable options from assistant's reply text (e.g. bullet-point choices)
 * 2. Generate suggestions based on tools used in the turn
 * 3. Show nothing if no meaningful suggestions can be derived
 */

import { useMemo } from 'react'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'

interface PromptSuggestionsProps {
  thoughts: Thought[]
  content?: string   // Last assistant message text
  onSelect: (suggestion: string) => void
}

/**
 * Try to extract short, actionable options from the assistant's message.
 * Targets bullet-point or numbered sub-lists that look like choices.
 */
function extractOptionsFromContent(content: string): string[] {
  // Match bullet items: - xxx, • xxx, * xxx  (only short ones that look like options)
  const bulletRegex = /(?:^|\n)\s*[-•*]\s+(.{2,30})(?:\n|$)/gm
  const bullets: string[] = []
  let m: RegExpExecArray | null
  while ((m = bulletRegex.exec(content)) !== null) {
    const text = m[1].trim()
      .replace(/[,，。.:：、]$/, '')   // strip trailing punctuation
      .replace(/\*\*/g, '')            // strip bold markers
    // Skip items that are too long, contain colons (likely label:value), or are generic
    if (text.length >= 2 && text.length <= 25 && !text.includes(':') && !text.includes('：')) {
      bullets.push(text)
    }
  }
  if (bullets.length >= 2) return bullets.slice(0, 3)

  // Match numbered items with short text after colon/bold: "1. **语言**: Python" → skip
  // Instead look for short numbered items without sub-content
  const numberedRegex = /(?:^|\n)\s*\d+[.)]\s+(.{2,30})(?:\n|$)/gm
  const numbered: string[] = []
  while ((m = numberedRegex.exec(content)) !== null) {
    const text = m[1].trim()
      .replace(/[,，。.:：、]$/, '')
      .replace(/\*\*/g, '')
    if (text.length >= 2 && text.length <= 25 && !text.includes(':') && !text.includes('：') && !text.includes('?') && !text.includes('？')) {
      numbered.push(text)
    }
  }
  if (numbered.length >= 2) return numbered.slice(0, 3)

  return []
}

export function PromptSuggestions({ thoughts, content, onSelect }: PromptSuggestionsProps) {
  const { t } = useTranslation()

  const suggestions = useMemo(() => {
    // 1. Try content-based extraction first (most contextual)
    if (content) {
      const contentItems = extractOptionsFromContent(content)
      if (contentItems.length > 0) return contentItems
    }

    // 2. Fall back to tool-based suggestions
    const toolNames = new Set(
      thoughts
        .filter(th => th.type === 'tool_use' && th.toolName)
        .map(th => th.toolName!)
    )

    const items: string[] = []

    if (toolNames.has('Write') || toolNames.has('Edit')) {
      items.push(t('Run tests'))
      items.push(t('Review the changes'))
    }

    if (toolNames.has('WebSearch') || toolNames.has('WebFetch')) {
      items.push(t('Go deeper'))
      items.push(t('Summarize findings'))
    }

    if (toolNames.has('Bash')) {
      items.push(t('Check the output'))
    }

    if (toolNames.has('Read') || toolNames.has('Grep') || toolNames.has('Glob')) {
      items.push(t('Explain this code'))
    }

    // No generic fallback — only show when we have something meaningful
    return items.slice(0, 3)
  }, [thoughts, content, t])

  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-1 py-1">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="px-3 py-1 text-xs rounded-full
            bg-muted/50 text-muted-foreground
            hover:bg-muted hover:text-foreground
            border border-border/50 hover:border-border
            transition-all duration-150"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
