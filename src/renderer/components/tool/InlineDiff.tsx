/**
 * InlineDiff - Lightweight inline diff display for Edit tool results
 * Shows old_string → new_string changes with red/green line highlighting
 * Much lighter than react-diff-viewer, designed for inline use in ToolItem
 */

import { memo, useMemo } from 'react'

interface InlineDiffProps {
  oldString: string
  newString: string
  maxLines?: number // Max lines to show before collapsing (default: 20)
}

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
}

/**
 * Simple line-by-line diff algorithm
 * For small edits (typical tool output), a simple approach is sufficient
 */
function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const lines: DiffLine[] = []

  // Use a simple LCS-based approach for small inputs
  const lcs = computeLCS(oldLines, newLines)
  let oi = 0, ni = 0, li = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] &&
        ni < newLines.length && newLines[ni] === lcs[li]) {
      // Context line (in both)
      lines.push({ type: 'context', content: lcs[li] })
      oi++; ni++; li++
    } else if (li < lcs.length && ni < newLines.length && newLines[ni] === lcs[li]) {
      // Old line removed
      lines.push({ type: 'remove', content: oldLines[oi] })
      oi++
    } else if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li]) {
      // New line added
      lines.push({ type: 'add', content: newLines[ni] })
      ni++
    } else {
      // Neither matches LCS - removed then added
      if (oi < oldLines.length) {
        lines.push({ type: 'remove', content: oldLines[oi] })
        oi++
      }
      if (ni < newLines.length) {
        lines.push({ type: 'add', content: newLines[ni] })
        ni++
      }
    }
  }

  return lines
}

/**
 * Compute Longest Common Subsequence of two string arrays
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length
  // For very large diffs, skip LCS and just show remove all + add all
  if (m * n > 10000) {
    return []
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--; j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return result
}

export const InlineDiff = memo(function InlineDiff({
  oldString,
  newString,
  maxLines = 20,
}: InlineDiffProps) {
  const diffLines = useMemo(() => computeLineDiff(oldString, newString), [oldString, newString])

  // Only show changed lines (remove context) if too many lines
  const displayLines = useMemo(() => {
    if (diffLines.length <= maxLines) return diffLines

    // Show only changed lines with minimal context (1 line before/after)
    const changedIndices = new Set<number>()
    diffLines.forEach((line, i) => {
      if (line.type !== 'context') {
        changedIndices.add(i)
        if (i > 0) changedIndices.add(i - 1)
        if (i < diffLines.length - 1) changedIndices.add(i + 1)
      }
    })

    const result: (DiffLine | { type: 'separator' })[] = []
    let lastIdx = -1
    for (const idx of [...changedIndices].sort((a, b) => a - b)) {
      if (lastIdx >= 0 && idx > lastIdx + 1) {
        result.push({ type: 'separator' as const })
      }
      result.push(diffLines[idx])
      lastIdx = idx
    }
    return result as DiffLine[]
  }, [diffLines, maxLines])

  if (displayLines.length === 0) return null

  return (
    <div className="mt-1 rounded-md border border-border/30 overflow-hidden text-[11px] leading-[1.4] font-mono">
      {displayLines.map((line, i) => {
        if ((line as any).type === 'separator') {
          return (
            <div key={i} className="px-2 py-0.5 text-muted-foreground/40 bg-muted/10 text-center select-none">
              ···
            </div>
          )
        }

        const bgClass = line.type === 'add'
          ? 'bg-green-500/10'
          : line.type === 'remove'
            ? 'bg-red-500/10'
            : ''

        const textClass = line.type === 'add'
          ? 'text-green-400/80'
          : line.type === 'remove'
            ? 'text-red-400/80'
            : 'text-muted-foreground/50'

        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '

        return (
          <div key={i} className={`px-2 ${bgClass} whitespace-pre-wrap break-all`}>
            <span className={`${textClass} select-none mr-1`}>{prefix}</span>
            <span className={textClass}>{line.content}</span>
          </div>
        )
      })}
    </div>
  )
})
