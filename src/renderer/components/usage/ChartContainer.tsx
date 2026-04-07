import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

interface ChartContainerSize {
  width: number
  height: number
}

interface ChartContainerProps {
  className?: string
  children: ReactNode | ((size: ChartContainerSize) => ReactNode)
}

export function ChartContainer({ className, children }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<ChartContainerSize | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect()
      const nextSize = width > 0 && height > 0
        ? { width: Math.floor(width), height: Math.floor(height) }
        : null

      setSize((current) => {
        if (!current && !nextSize) return current
        if (
          current &&
          nextSize &&
          current.width === nextSize.width &&
          current.height === nextSize.height
        ) {
          return current
        }
        return nextSize
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={cn('w-full min-w-0', className)}>
      {size
        ? typeof children === 'function'
          ? children(size)
          : children
        : null}
    </div>
  )
}
