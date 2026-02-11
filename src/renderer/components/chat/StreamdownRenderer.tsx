/**
 * StreamdownRenderer - Incremental Markdown rendering for AI streaming
 *
 * Uses Streamdown (Vercel) for efficient streaming: only new tokens are parsed,
 * already-rendered content is preserved. Replaces react-markdown in streaming scenarios.
 *
 * Key benefits over react-markdown:
 * - O(n) instead of O(n²) for streaming
 * - No code highlight flickering
 * - Handles incomplete Markdown blocks gracefully
 * - Shiki-based syntax highlighting (inline styles, no CSS class flickering)
 */

import { memo, useRef, useCallback, useState } from 'react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { cjk } from '@streamdown/cjk'
import { Check, Copy } from 'lucide-react'

// Import Streamdown built-in animation styles
import 'streamdown/styles.css'

interface StreamdownRendererProps {
  /** Markdown content (full text including all tokens received so far) */
  content: string
  /** Whether content is currently being streamed */
  isStreaming?: boolean
  /** Custom CSS class name */
  className?: string
}

// Plugin configuration (singleton, avoid recreating on every render)
const plugins = {
  code,
  cjk,
}

export const StreamdownRenderer = memo(function StreamdownRenderer({
  content,
  isStreaming = false,
  className = '',
}: StreamdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [copiedPre, setCopiedPre] = useState<HTMLPreElement | null>(null)

  // Event delegation for code block copy
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Check if click is on a copy button inside a code block header
    const copyBtn = target.closest('[data-sd-copy]') as HTMLElement | null
    if (copyBtn) return // Let Streamdown's built-in copy handle it

    // Check if click is on our custom copy button
    const customCopyBtn = target.closest('.sd-copy-btn') as HTMLElement | null
    if (!customCopyBtn) return

    const pre = customCopyBtn.closest('.sd-code-wrapper')?.querySelector('pre')
    const codeEl = pre?.querySelector('code')
    if (codeEl) {
      navigator.clipboard.writeText(codeEl.textContent || '')
      setCopiedPre(pre!)
      setTimeout(() => setCopiedPre(null), 2000)
    }
  }, [])

  if (!content?.trim()) return null

  return (
    <div
      ref={containerRef}
      className={`streamdown-content ${className}`}
      onClick={handleClick}
    >
      <Streamdown
        plugins={plugins}
        isAnimating={isStreaming}
        shikiTheme={['github-light', 'github-dark']}
        controls={{ code: true, table: true }}
        parseIncompleteMarkdown={true}
      >
        {content}
      </Streamdown>
    </div>
  )
}, (prevProps, nextProps) => {
  return prevProps.content === nextProps.content
    && prevProps.isStreaming === nextProps.isStreaming
})
