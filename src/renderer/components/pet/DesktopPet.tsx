import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PET_SIZE, PET_DEFAULT_POSITION, PET_VIDEOS_DARK, PET_VIDEOS_LIGHT } from './petConstants'
import { usePetState, type PetUsageStats } from './usePetState'
import { formatTokenCount, formatCost } from '../../utils/chart-colors'
import { projectFiveHourTokens, projectFiveHourCost } from '../usage/RealtimeMonitor'

const CANVAS_SIZE = 240 // 2x render for retina
const BLACK_THRESHOLD = 40 // pixels with R+G+B < threshold become transparent
const WHITE_THRESHOLD = 700 // pixels with R+G+B > threshold become transparent

interface DesktopPetProps {
  isActive: boolean
}

function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(
    document.documentElement.classList.contains('light')
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('light'))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  return isLight
}

function PetTooltip({ stats }: { stats: PetUsageStats | null }) {
  const { t } = useTranslation()
  const tokPerMin = stats?.tokensPerMinute ?? 0
  const costPerMin = stats?.costPerMinute ?? 0
  const proj5hTokens = projectFiveHourTokens(tokPerMin)
  const proj5hCost = projectFiveHourCost(costPerMin)

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-10 whitespace-nowrap">
      <div className="bg-popover border border-border/50 rounded-md shadow-lg px-2.5 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
        <div>{t('Pet Speed')}:{formatTokenCount(tokPerMin)} tok/min</div>
        <div>{t('Pet Cost')}:{formatCost(costPerMin)}/min</div>
        <div>{t('Pet 5h Usage')}:{proj5hTokens != null ? formatTokenCount(proj5hTokens) : '-'}</div>
        <div>{t('Pet 5h Cost')}:{proj5hCost != null ? formatCost(proj5hCost) : '-'}</div>
      </div>
    </div>
  )
}

export function DesktopPet({ isActive }: DesktopPetProps) {
  const { activityState, usageStats } = usePetState()
  const isLight = useIsLightTheme()
  const [position, setPosition] = useState(PET_DEFAULT_POSITION)
  const [hovered, setHovered] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number>(0)
  const prevState = useRef(activityState)
  const prevIsLight = useRef(isLight)
  const isLightRef = useRef(isLight)

  // Keep ref in sync for use inside renderFrame
  isLightRef.current = isLight

  // Drag state
  const dragging = useRef(false)
  const hasDragged = useRef(false)
  const dragStart = useRef({ clientX: 0, clientY: 0, right: 0, bottom: 0 })

  // Render video frame to canvas with background-to-transparent keying
  const renderFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.paused || video.ended) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const data = imageData.data

    if (isLightRef.current) {
      // White-to-transparent keying for light mode videos
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] + data[i + 1] + data[i + 2]
        if (brightness > WHITE_THRESHOLD) {
          data[i + 3] = 0
        } else if (brightness > WHITE_THRESHOLD - BLACK_THRESHOLD) {
          data[i + 3] = Math.round(
            ((WHITE_THRESHOLD - brightness) / BLACK_THRESHOLD) * 255
          )
        }
      }
    } else {
      // Black-to-transparent keying for dark mode videos
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] + data[i + 1] + data[i + 2]
        if (brightness < BLACK_THRESHOLD) {
          data[i + 3] = 0
        } else if (brightness < BLACK_THRESHOLD * 2) {
          data[i + 3] = Math.round(
            ((brightness - BLACK_THRESHOLD) / BLACK_THRESHOLD) * 255
          )
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
    rafRef.current = requestAnimationFrame(renderFrame)
  }, [])

  // Start/stop render loop based on visibility
  useEffect(() => {
    if (isActive) {
      const video = videoRef.current
      if (video && video.src) {
        video.play()
        rafRef.current = requestAnimationFrame(renderFrame)
      }
    } else {
      videoRef.current?.pause()
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, renderFrame])

  // Load video on mount, state changes, or theme changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const videos = isLight ? PET_VIDEOS_LIGHT : PET_VIDEOS_DARK
    const src = videos[activityState]

    if (
      video.src.endsWith(src.split('/').pop()!) &&
      activityState === prevState.current &&
      isLight === prevIsLight.current
    ) {
      return
    }
    prevState.current = activityState
    prevIsLight.current = isLight

    video.src = src
    video.load()

    const handleCanPlay = () => {
      if (isActive) {
        video.play()
        rafRef.current = requestAnimationFrame(renderFrame)
      }
    }

    video.addEventListener('canplay', handleCanPlay, { once: true })
    return () => video.removeEventListener('canplay', handleCanPlay)
  }, [activityState, isLight, isActive, renderFrame])

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    hasDragged.current = false
    dragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      right: position.right,
      bottom: position.bottom,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [position])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return
    const parent = containerRef.current.parentElement
    if (!parent) return

    hasDragged.current = true
    const parentRect = parent.getBoundingClientRect()
    const deltaX = dragStart.current.clientX - e.clientX
    const deltaY = dragStart.current.clientY - e.clientY

    const newRight = Math.max(0, Math.min(
      dragStart.current.right + deltaX,
      parentRect.width - PET_SIZE
    ))
    const newBottom = Math.max(0, Math.min(
      dragStart.current.bottom + deltaY,
      parentRect.height - PET_SIZE
    ))

    setPosition({ right: newRight, bottom: newBottom })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute z-[5] cursor-grab active:cursor-grabbing select-none"
      style={{
        right: position.right,
        bottom: position.bottom,
        width: PET_SIZE,
        height: PET_SIZE,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && <PetTooltip stats={usageStats} />}
      {/* Hidden video source */}
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        className="hidden"
      />
      {/* Canvas with transparent background - theme color shows through */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="w-full h-full pointer-events-none"
      />
    </div>
  )
}
