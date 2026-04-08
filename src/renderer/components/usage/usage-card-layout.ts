import { useEffect, useState, type RefObject } from 'react'

export const USAGE_STAT_CARD_WIDTH = 260
const USAGE_STAT_CARD_GAP = 12

function getGridMinWidth(columnCount: number): number {
  return (USAGE_STAT_CARD_WIDTH * columnCount) + (USAGE_STAT_CARD_GAP * (columnCount - 1))
}

export function getRealtimeMonitorColumnCount(containerWidth?: number | null): 2 | 4 {
  if (containerWidth != null && containerWidth >= getGridMinWidth(4)) {
    return 4
  }

  return 2
}

export function getHistorySummaryColumnCount(containerWidth?: number | null): 1 | 2 {
  if (containerWidth != null && containerWidth >= getGridMinWidth(2)) {
    return 2
  }

  return 1
}

export function useUsageCardColumns<T extends number>(
  containerRef: RefObject<HTMLElement | null>,
  resolveColumns: (containerWidth?: number | null) => T,
  initialColumns: T
): T {
  const [columnCount, setColumnCount] = useState<T>(initialColumns)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateColumnCount = (width: number) => {
      setColumnCount((current) => {
        const next = resolveColumns(width)
        return current === next ? current : next
      })
    }

    updateColumnCount(container.clientWidth)

    if (typeof ResizeObserver !== 'function') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      updateColumnCount(entry.contentRect.width)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, resolveColumns])

  return columnCount
}
