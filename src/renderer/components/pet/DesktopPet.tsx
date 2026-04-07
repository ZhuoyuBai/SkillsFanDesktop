import { useCallback, useEffect, useRef, useState } from 'react'
import { PET_SIZE, PET_DEFAULT_POSITION, PET_VIDEOS } from './petConstants'
import { usePetState } from './usePetState'

const CANVAS_SIZE = 240 // 2x render for retina
const BLACK_THRESHOLD = 40 // pixels with R+G+B < threshold become transparent

interface DesktopPetProps {
  isActive: boolean
}

export function DesktopPet({ isActive }: DesktopPetProps) {
  const activityState = usePetState()
  const [position, setPosition] = useState(PET_DEFAULT_POSITION)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number>(0)
  const prevState = useRef(activityState)

  // Drag state
  const dragging = useRef(false)
  const dragStart = useRef({ clientX: 0, clientY: 0, right: 0, bottom: 0 })

  // Render video frame to canvas with black-to-transparent keying
  const renderFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.paused || video.ended) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const brightness = data[i] + data[i + 1] + data[i + 2]
      if (brightness < BLACK_THRESHOLD) {
        data[i + 3] = 0 // fully transparent
      } else if (brightness < BLACK_THRESHOLD * 2) {
        // Smooth edge transition
        data[i + 3] = Math.round(
          ((brightness - BLACK_THRESHOLD) / BLACK_THRESHOLD) * 255
        )
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

  // Load video on mount and state changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const src = PET_VIDEOS[activityState]
    if (video.src.endsWith(src.split('/').pop()!)) {
      // Same video, skip reload
      if (activityState === prevState.current) return
    }
    prevState.current = activityState

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
  }, [activityState, isActive, renderFrame])

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
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
    >
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
