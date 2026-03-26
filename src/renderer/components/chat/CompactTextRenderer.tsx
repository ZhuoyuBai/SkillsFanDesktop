import { memo } from 'react'
import { normalizeCompactLogText } from '../../utils/message-text-rendering'

interface CompactTextRendererProps {
  content: string
  className?: string
}

export const CompactTextRenderer = memo(function CompactTextRenderer({
  content,
  className = '',
}: CompactTextRendererProps) {
  const normalized = normalizeCompactLogText(content)

  if (!normalized.trim()) return null

  return (
    <div
      className={`whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground ${className}`.trim()}
    >
      {normalized}
    </div>
  )
})
