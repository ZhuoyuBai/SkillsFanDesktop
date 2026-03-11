/**
 * Image Viewer - Image display with zoom and pan
 *
 * Features:
 * - Zoom in/out with buttons or scroll
 * - Pan by dragging
 * - Fit to window / actual size
 * - Download button
 * - Window maximize for fullscreen viewing
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize, ExternalLink, Download, RotateCw } from 'lucide-react'
import { api } from '../../../api'
import type { CanvasTab } from '../../../stores/canvas.store'
import { useTranslation } from '../../../i18n'

interface ImageViewerProps {
  tab: CanvasTab
}

export function ImageViewer({ tab }: ImageViewerProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!tab.content) {
      setLocalObjectUrl(null)
      return
    }

    try {
      const binary = atob(tab.content)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }

      const objectUrl = URL.createObjectURL(new Blob([bytes], {
        type: tab.mimeType || 'image/png'
      }))
      setLocalObjectUrl(objectUrl)

      return () => {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      console.error('Failed to build local image preview URL:', error)
      setLocalObjectUrl(null)
      return
    }
  }, [tab.id, tab.content, tab.mimeType, tab.lastModified])

  // Get image URL
  // Priority:
  // 1. Remote download URL in remote mode
  // 2. Local blob URL built from base64 content
  // 3. halo-file:// fallback for legacy tabs that only have a path
  // Append lastModified timestamp to bust browser cache when file changes
  const cacheBuster = tab.lastModified ? `?t=${tab.lastModified}` : ''
  const imageUrl = api.isRemoteMode() && tab.path
    ? api.getArtifactDownloadUrl(tab.path)
    : tab.content
      ? (localObjectUrl || '')
      : tab.path
        ? `halo-file://${encodeURI(tab.path)}${cacheBuster}`
        : ''

  // Reset view when tab changes
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setImageLoaded(false)
    setImageError(false)
  }, [tab.id])

  // Reset image load state when file content changes (live reload)
  useEffect(() => {
    if (tab.lastModified) {
      setImageLoaded(false)
      setImageError(false)
    }
  }, [tab.lastModified])

  useEffect(() => {
    if (localObjectUrl) {
      setImageError(false)
    }
  }, [localObjectUrl])

  // Zoom functions
  const zoomIn = () => setScale(s => Math.min(s * 1.25, 5))
  const zoomOut = () => setScale(s => Math.max(s / 1.25, 0.1))
  const resetZoom = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }
  const fitToWindow = () => {
    if (!containerRef.current || !naturalSize.width) return
    const container = containerRef.current
    const containerWidth = container.clientWidth - 48
    const containerHeight = container.clientHeight - 48
    const scaleX = containerWidth / naturalSize.width
    const scaleY = containerHeight / naturalSize.height
    setScale(Math.min(scaleX, scaleY, 1))
    setPosition({ x: 0, y: 0 })
  }

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => Math.max(0.1, Math.min(5, s * delta)))
  }, [])

  // Handle drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  const handleMouseUp = () => setIsDragging(false)

  // Download image
  const handleDownload = () => {
    if (tab.path) {
      api.downloadArtifact(tab.path)
    }
  }

  // Open with external application
  const handleOpenExternal = async () => {
    if (!tab.path) return
    try {
      await api.openArtifact(tab.path)
    } catch (err) {
      console.error('Failed to open with external app:', err)
    }
  }

  const canOpenExternal = !api.isRemoteMode() && tab.path

  // Image load handlers
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    setImageLoaded(true)
    setImageError(false)
  }

  const handleImageError = () => {
    setImageError(true)
    setImageLoaded(false)
  }

  return (
    <div className="relative flex flex-col h-full bg-[#1a1a1a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {imageLoaded && (
            <>
              <span>{naturalSize.width} × {naturalSize.height}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{Math.round(scale * 100)}%</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={zoomOut}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title={t('Zoom out')}
          >
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={zoomIn}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title={t('Zoom in')}
          >
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={fitToWindow}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title={t('Fit to window')}
          >
            <Maximize className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title={t('Reset')}
          >
            <RotateCw className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Download */}
          {tab.path && (
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title={t('Download')}
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* Open with external app */}
          {canOpenExternal && (
            <button
              onClick={handleOpenExternal}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title={t('Open in external application')}
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {imageError ? (
          <div className="text-center text-muted-foreground">
            <p className="text-lg mb-2">{t('Unable to load image')}</p>
            <p className="text-sm">{t('File may have been moved or deleted')}</p>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={tab.title}
            className="max-w-none transition-transform duration-100"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              opacity: imageLoaded ? 1 : 0,
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
          />
        ) : null}

        {/* Loading indicator */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Checkerboard background for transparency */}
      <style>{`
        .bg-\\[\\#1a1a1a\\] {
          background-image:
            linear-gradient(45deg, #222 25%, transparent 25%),
            linear-gradient(-45deg, #222 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #222 75%),
            linear-gradient(-45deg, transparent 75%, #222 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
          background-color: #1a1a1a;
        }
      `}</style>
    </div>
  )
}
