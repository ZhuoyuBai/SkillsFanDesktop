/**
 * SchedulePicker - Core shared schedule picker component
 *
 * Visual schedule builder with:
 * - Segmented tabs: Fixed Schedule / Repeat Interval
 * - Time picker (hour:minute dropdowns)
 * - Day selector (weekday pills with quick select)
 * - Scroll wheel picker for interval mode
 * - Preview description text
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Timer } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Select } from '../../ui/Select'
import {
  DAY_KEYS,
  ALL_DAYS,
  WEEKDAYS,
  defaultPickerState,
  scheduleToPickerState,
  pickerStateToSchedule,
  formatScheduleDescription,
  type SchedulePickerState
} from './schedule-utils'
import type { TaskSchedule } from '../../../../shared/types/loop-task'

interface SchedulePickerProps {
  schedule: TaskSchedule
  onChange: (schedule: TaskSchedule) => void
}

export function SchedulePicker({ schedule, onChange }: SchedulePickerProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<SchedulePickerState>(() =>
    scheduleToPickerState(schedule)
  )

  // Sync state changes back to parent
  const emitChange = useCallback((newState: SchedulePickerState) => {
    setState(newState)
    onChange(pickerStateToSchedule(newState, schedule.enabled))
  }, [onChange, schedule.enabled])

  // Re-init when schedule prop changes externally
  useEffect(() => {
    setState(scheduleToPickerState(schedule))
  }, [schedule.type, schedule.cronExpression, schedule.intervalMs])

  const isAllDays = state.selectedDays.length === 7
  const isWeekdays = state.selectedDays.length === 5 &&
    WEEKDAYS.every(d => state.selectedDays.includes(d))

  // Generate preview text
  const previewSchedule = pickerStateToSchedule(state, true)
  const previewText = formatScheduleDescription(previewSchedule, t)

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex bg-muted/50 rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => emitChange({ ...state, mode: 'fixed' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
            state.mode === 'fixed'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Calendar size={13} />
          {t('Fixed Schedule')}
        </button>
        <button
          type="button"
          onClick={() => emitChange({ ...state, mode: 'interval' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
            state.mode === 'interval'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Timer size={13} />
          {t('Repeat Interval')}
        </button>
      </div>

      {/* Fixed Schedule mode */}
      {state.mode === 'fixed' && (
        <div className="space-y-3">
          {/* Time picker */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{t('Run time')}</label>
                <div className="flex items-center gap-1.5">
                  <Select<number>
                    variant="mini"
                    value={state.hour}
                    onChange={(v) => emitChange({ ...state, hour: v })}
                    options={Array.from({ length: 24 }, (_, i) => ({
                      value: i,
                      label: String(i).padStart(2, '0')
                    }))}
                    className="tabular-nums"
                  />
                  <span className="text-muted-foreground font-medium">:</span>
                  <Select<number>
                    variant="mini"
                    value={state.minute}
                    onChange={(v) => emitChange({ ...state, minute: v })}
                    options={Array.from({ length: 12 }, (_, i) => i * 5).map(m => ({
                      value: m,
                      label: String(m).padStart(2, '0')
                    }))}
                    className="tabular-nums"
                  />
                </div>
              </div>

              {/* Day selector */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{t('Run days')}</label>

                {/* Quick select buttons */}
                <div className="flex gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => emitChange({ ...state, selectedDays: [...ALL_DAYS] })}
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-md border transition-colors',
                      isAllDays
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t('Every day')}
                  </button>
                  <button
                    type="button"
                    onClick={() => emitChange({ ...state, selectedDays: [...WEEKDAYS] })}
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-md border transition-colors',
                      isWeekdays && !isAllDays
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t('Weekdays')}
                  </button>
                </div>

                {/* Day pills */}
                <div className="flex gap-1">
                  {DAY_KEYS.map((dayKey, index) => {
                    const dayNum = index + 1 // 1=Mon ... 7=Sun
                    const isSelected = state.selectedDays.includes(dayNum)
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        onClick={() => {
                          const newDays = isSelected
                            ? state.selectedDays.filter(d => d !== dayNum)
                            : [...state.selectedDays, dayNum].sort((a, b) => a - b)
                          // Must have at least 1 day
                          if (newDays.length > 0) {
                            emitChange({ ...state, selectedDays: newDays })
                          }
                        }}
                        className={cn(
                          'w-8 h-8 text-xs rounded-lg border transition-colors flex items-center justify-center',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border hover:border-primary/30 text-muted-foreground'
                        )}
                      >
                        {t(dayKey)}
                      </button>
                    )
                  })}
                </div>
              </div>
        </div>
      )}

      {/* Interval mode - scroll wheel picker */}
      {state.mode === 'interval' && (
        <IntervalWheelPicker
          intervalMs={state.intervalMs}
          onChange={(ms) => emitChange({ ...state, intervalMs: ms })}
        />
      )}

      {/* Preview */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
        {previewText}
      </div>
    </div>
  )
}

// ============================================
// Interval Wheel Picker
// ============================================

const ITEM_HEIGHT = 36

interface IntervalWheelPickerProps {
  intervalMs: number
  onChange: (ms: number) => void
}

function IntervalWheelPicker({ intervalMs, onChange }: IntervalWheelPickerProps) {
  const { t } = useTranslation()

  // Derive hours and minutes from intervalMs
  const totalMinutes = Math.round(intervalMs / 60000)
  const hours = Math.min(Math.floor(totalMinutes / 60), 24)
  const minutes = hours >= 24 ? 0 : totalMinutes % 60

  // Round minutes to nearest 5
  const roundedMinutes = Math.round(minutes / 5) * 5

  const handleChange = (h: number, m: number) => {
    // Clamp: min 5 minutes, max 24 hours
    if (h >= 24) { h = 24; m = 0 }
    const total = h * 60 + m
    if (total < 5) return // min 5 minutes
    onChange(total * 60000)
  }

  // Hour options: 0-24
  const hourOptions = Array.from({ length: 25 }, (_, i) => i)
  // Minute options: 0, 5, 10, ..., 55 (disabled when hours=24)
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5)

  return (
    <div className="space-y-2">
      <span className="text-xs text-muted-foreground">{t('Run every')}</span>
      <div className="flex items-center justify-center gap-1">
        {/* Hours wheel */}
        <div className="flex items-center gap-1">
          <ScrollWheel
            values={hourOptions}
            selected={hours}
            onChange={(v) => handleChange(v, v >= 24 ? 0 : roundedMinutes)}
            formatLabel={(v) => String(v).padStart(2, '0')}
          />
          <span className="text-xs text-muted-foreground w-4">{t('h')}</span>
        </div>

        <span className="text-muted-foreground font-medium mx-1">:</span>

        {/* Minutes wheel */}
        <div className="flex items-center gap-1">
          <ScrollWheel
            values={minuteOptions}
            selected={hours >= 24 ? 0 : roundedMinutes}
            onChange={(v) => handleChange(hours, v)}
            formatLabel={(v) => String(v).padStart(2, '0')}
            disabled={hours >= 24}
          />
          <span className="text-xs text-muted-foreground w-4">{t('m')}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Custom Scroll Wheel Component
// Fully custom-drawn, no native scroll used.
// Uses transform + pointer/wheel events + rAF.
// ============================================

const VISIBLE_COUNT = 3
const FRICTION = 0.85
const MIN_VELOCITY = 0.3
const SNAP_DURATION = 200

interface ScrollWheelProps {
  values: number[]
  selected: number
  onChange: (value: number) => void
  formatLabel?: (value: number) => string
  disabled?: boolean
}

function ScrollWheel({ values, selected, onChange, formatLabel, disabled }: ScrollWheelProps) {
  const selectedIndex = values.indexOf(selected)

  // All mutable animation state lives in refs to avoid re-render flicker
  const offsetRef = useRef(-selectedIndex * ITEM_HEIGHT)
  const velocityRef = useRef(0)
  const rafRef = useRef(0)
  const isDraggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragStartOffsetRef = useRef(0)
  const lastPointerYRef = useRef(0)
  const lastPointerTimeRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Force re-render trigger (only used to update visual state)
  const [, forceRender] = useState(0)
  const rerender = useCallback(() => forceRender(v => v + 1), [])

  // Clamp offset within bounds
  const clampOffset = useCallback((off: number) => {
    const minOff = -(values.length - 1) * ITEM_HEIGHT
    return Math.max(minOff, Math.min(0, off))
  }, [values.length])

  // Snap to nearest item with spring animation
  const snapTo = useCallback((targetIndex: number) => {
    const targetOffset = -targetIndex * ITEM_HEIGHT
    const startOffset = offsetRef.current
    const startTime = performance.now()

    cancelAnimationFrame(rafRef.current)

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / SNAP_DURATION, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      offsetRef.current = startOffset + (targetOffset - startOffset) * eased
      rerender()

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        offsetRef.current = targetOffset
        rerender()
        // Emit change
        if (values[targetIndex] !== selected) {
          onChange(values[targetIndex])
        }
      }
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [values, selected, onChange, rerender])

  // Inertia animation after drag release
  const startInertia = useCallback(() => {
    cancelAnimationFrame(rafRef.current)

    const animate = () => {
      velocityRef.current *= FRICTION
      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        // Snap to nearest
        const idx = Math.round(-offsetRef.current / ITEM_HEIGHT)
        const clampedIdx = Math.max(0, Math.min(idx, values.length - 1))
        snapTo(clampedIdx)
        return
      }
      offsetRef.current = clampOffset(offsetRef.current + velocityRef.current)
      rerender()
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [values.length, clampOffset, snapTo, rerender])

  // Sync offset when selected prop changes externally
  useEffect(() => {
    if (isDraggingRef.current) return
    cancelAnimationFrame(rafRef.current)
    offsetRef.current = -selectedIndex * ITEM_HEIGHT
    rerender()
  }, [selectedIndex, rerender])

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Pointer events for drag
  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    cancelAnimationFrame(rafRef.current)
    isDraggingRef.current = true
    dragStartYRef.current = e.clientY
    dragStartOffsetRef.current = offsetRef.current
    lastPointerYRef.current = e.clientY
    lastPointerTimeRef.current = performance.now()
    velocityRef.current = 0
    containerRef.current!.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || disabled) return
    const dy = e.clientY - dragStartYRef.current
    offsetRef.current = clampOffset(dragStartOffsetRef.current + dy)

    // Track velocity
    const now = performance.now()
    const dt = now - lastPointerTimeRef.current
    if (dt > 0) {
      const raw = (e.clientY - lastPointerYRef.current) / dt * 16 // normalize to ~60fps
      velocityRef.current = Math.max(-20, Math.min(20, raw)) // cap velocity
    }
    lastPointerYRef.current = e.clientY
    lastPointerTimeRef.current = now
    rerender()
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    // If barely moved, just snap without inertia
    const totalDrag = Math.abs(e.clientY - dragStartYRef.current)
    if (totalDrag < 3) {
      const idx = Math.round(-offsetRef.current / ITEM_HEIGHT)
      const clampedIdx = Math.max(0, Math.min(idx, values.length - 1))
      snapTo(clampedIdx)
    } else {
      startInertia()
    }
  }

  // Mouse wheel: step one item at a time
  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return
    e.preventDefault()
    cancelAnimationFrame(rafRef.current)
    const direction = e.deltaY > 0 ? 1 : -1
    const currentIdx = Math.round(-offsetRef.current / ITEM_HEIGHT)
    const nextIdx = Math.max(0, Math.min(currentIdx + direction, values.length - 1))
    snapTo(nextIdx)
  }

  // Click on an item
  const handleItemClick = (index: number) => {
    if (disabled || isDraggingRef.current) return
    snapTo(index)
  }

  const currentOffset = offsetRef.current

  return (
    <div
      className={cn('relative w-12 select-none', disabled && 'opacity-40 pointer-events-none')}
      style={{ height: ITEM_HEIGHT * VISIBLE_COUNT }}
    >
      {/* Selection highlight band */}
      <div
        className="absolute inset-x-0 pointer-events-none border-y border-primary/30 bg-primary/5 rounded-sm z-10"
        style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      {/* Fade overlays */}
      <div className="absolute inset-x-0 top-0 pointer-events-none z-20 bg-gradient-to-b from-background to-transparent" style={{ height: ITEM_HEIGHT * 0.8 }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-20 bg-gradient-to-t from-background to-transparent" style={{ height: ITEM_HEIGHT * 0.8 }} />
      {/* Items container - clipped, no native scroll */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {values.map((value, index) => {
          // Position each item via transform
          const y = ITEM_HEIGHT + index * ITEM_HEIGHT + currentOffset
          // Skip rendering items far off-screen
          if (y < -ITEM_HEIGHT || y > ITEM_HEIGHT * (VISIBLE_COUNT + 1)) return null
          // Distance from center (0 = perfectly centered)
          const distFromCenter = Math.abs(y - ITEM_HEIGHT) / ITEM_HEIGHT
          const scale = 1 - distFromCenter * 0.12
          const opacity = 1 - distFromCenter * 0.55
          return (
            <div
              key={value}
              className="absolute inset-x-0 flex items-center justify-center text-sm tabular-nums cursor-pointer"
              style={{
                height: ITEM_HEIGHT,
                transform: `translateY(${y}px) scale(${scale})`,
                opacity: Math.max(0, opacity),
                fontWeight: distFromCenter < 0.3 ? 500 : 400,
                willChange: 'transform, opacity'
              }}
              onClick={() => handleItemClick(index)}
            >
              {formatLabel ? formatLabel(value) : String(value)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
