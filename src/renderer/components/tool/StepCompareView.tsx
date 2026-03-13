import { useState, useRef, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import type { HostStep } from '../../types'

type StepArtifact = NonNullable<HostStep['artifacts']>[number]

interface StepCompareViewProps {
  before: StepArtifact
  after: StepArtifact
  metadata?: Record<string, unknown>
  onClickImage?: (artifact: StepArtifact) => void
}

function getImageSrc(artifact: StepArtifact): string | undefined {
  if (artifact.previewImageData && artifact.mimeType) {
    return `data:${artifact.mimeType};base64,${artifact.previewImageData}`
  }
  return undefined
}

export function StepCompareView({ before, after, metadata, onClickImage }: StepCompareViewProps) {
  const { t } = useTranslation()
  const [sliderPosition, setSliderPosition] = useState(50)
  const [mode, setMode] = useState<'slider' | 'side'>('slider')
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const beforeSrc = getImageSrc(before)
  const afterSrc = getImageSrc(after)

  const clickX = typeof metadata?.x === 'number' ? metadata.x as number : undefined
  const clickY = typeof metadata?.y === 'number' ? metadata.y as number : undefined

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    setSliderPosition(percent)
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    updateSlider(e.clientX)
  }, [updateSlider])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    updateSlider(e.clientX)
  }, [updateSlider])

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  if (!beforeSrc || !afterSrc) {
    return null
  }

  if (mode === 'side') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">{t('Before / After')}</span>
          <button
            type="button"
            onClick={() => setMode('slider')}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {t('Slider view')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">{t('Before')}</span>
            <button
              type="button"
              onClick={() => onClickImage?.(before)}
              className="group block w-full overflow-hidden rounded-md border border-border/40 bg-muted/20"
            >
              <div className="relative">
                <img
                  src={beforeSrc}
                  alt={t('Before')}
                  className="w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                />
                {clickX !== undefined && clickY !== undefined && (
                  <ClickMarker x={clickX} y={clickY} />
                )}
              </div>
            </button>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">{t('After')}</span>
            <button
              type="button"
              onClick={() => onClickImage?.(after)}
              className="group block w-full overflow-hidden rounded-md border border-border/40 bg-muted/20"
            >
              <img
                src={afterSrc}
                alt={t('After')}
                className="w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
              />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{t('Before / After')}</span>
        <button
          type="button"
          onClick={() => setMode('side')}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {t('Side by side')}
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded-md border border-border/40 bg-muted/20"
        style={{ cursor: 'col-resize' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* After image (full width background) */}
        <img
          src={afterSrc}
          alt={t('After')}
          className="block w-full object-contain"
          draggable={false}
        />

        {/* Before image (clipped by slider) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${sliderPosition}%` }}
        >
          <img
            src={beforeSrc}
            alt={t('Before')}
            className="block w-full object-contain"
            style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }}
            draggable={false}
          />
          {clickX !== undefined && clickY !== undefined && (
            <ClickMarker x={clickX} y={clickY} />
          )}
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)]"
          style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2L1 6L4 10" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 2L11 6L8 10" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
          {t('Before')}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
          {t('After')}
        </div>
      </div>
    </div>
  )
}

function ClickMarker({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className="h-5 w-5 rounded-full border-2 border-red-500 bg-red-500/20 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
    </div>
  )
}
