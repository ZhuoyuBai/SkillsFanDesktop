/**
 * useTypewriter - Reusable typewriter animation hook
 *
 * Drives a character-by-character reveal using requestAnimationFrame.
 * Handles content appending gracefully (does not restart from 0).
 */

import { useState, useEffect, useRef } from 'react'

interface UseTypewriterOptions {
  /** Whether the animation is enabled. When false, full content is shown immediately. */
  enabled?: boolean
  /** Characters to reveal per animation frame (~60fps). Default: 8 */
  charsPerFrame?: number
}

interface UseTypewriterResult {
  /** The portion of content to display */
  displayText: string
  /** Whether the animation is still in progress */
  isAnimating: boolean
}

export function useTypewriter(
  content: string,
  options: UseTypewriterOptions = {}
): UseTypewriterResult {
  const { enabled = true, charsPerFrame = 8 } = options
  const [displayLength, setDisplayLength] = useState(enabled ? 0 : content.length)
  const prevContentLenRef = useRef(content.length)

  // When enabled flips from false→true, start from 0
  // When enabled flips from true→false, jump to full
  const prevEnabledRef = useRef(enabled)
  useEffect(() => {
    if (prevEnabledRef.current !== enabled) {
      prevEnabledRef.current = enabled
      if (!enabled) {
        setDisplayLength(content.length)
      }
    }
  }, [enabled, content.length])

  // When content grows (same block appended), keep animating from current position
  // When content shrinks or changes entirely, reset
  useEffect(() => {
    if (content.length < prevContentLenRef.current) {
      // Content replaced — restart
      setDisplayLength(enabled ? 0 : content.length)
    }
    prevContentLenRef.current = content.length
  }, [content, enabled])

  // rAF-driven animation
  useEffect(() => {
    if (!enabled || displayLength >= content.length) return

    const frame = requestAnimationFrame(() => {
      setDisplayLength((prev) => Math.min(prev + charsPerFrame, content.length))
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled, displayLength, content.length, charsPerFrame])

  const displayText = enabled ? content.slice(0, displayLength) : content
  const isAnimating = enabled && displayLength < content.length

  return { displayText, isAnimating }
}
