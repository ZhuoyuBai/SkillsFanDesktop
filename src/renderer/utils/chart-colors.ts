/**
 * Chart color utilities - reads CSS theme variables for recharts
 */

import { useState, useEffect, useMemo } from 'react'

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function getChartColors() {
  return {
    primary: `hsl(${getCSSVar('--primary')})`,
    secondary: `hsl(${getCSSVar('--secondary')})`,
    muted: `hsl(${getCSSVar('--muted')})`,
    foreground: `hsl(${getCSSVar('--foreground')})`,
    mutedForeground: `hsl(${getCSSVar('--muted-foreground')})`,
    border: `hsl(${getCSSVar('--border')})`,
    background: `hsl(${getCSSVar('--background')})`,
    // Tooltip uses elevated card surface for better contrast in dark mode
    tooltipBg: `hsl(${getCSSVar('--card')})`,
    tooltipFg: `hsl(${getCSSVar('--card-foreground')})`,
    // Chart-specific palette - solid theme-derived colors for dark/light mode
    palette: [
      `hsl(${getCSSVar('--primary')})`,
      `hsl(${getCSSVar('--ring')})`,
      `hsl(${getCSSVar('--link')})`,
      `hsl(${getCSSVar('--success')})`,
      `hsl(${getCSSVar('--warning')})`,
      `hsl(${getCSSVar('--muted-foreground')})`,
    ]
  }
}

/**
 * React hook that re-reads chart colors when the theme changes
 * (watches class/data-theme attribute on <html>).
 */
export function useChartColors() {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const observer = new MutationObserver(() => setRevision((n) => n + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
    return () => observer.disconnect()
  }, [])

  return useMemo(() => getChartColors(), [revision])
}

/**
 * Format token count with K/M suffix
 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/**
 * Format cost as USD
 */
export function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n > 0) return `$${n.toFixed(4)}`
  return '$0.00'
}
