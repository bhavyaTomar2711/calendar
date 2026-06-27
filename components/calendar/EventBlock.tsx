'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { format, addMinutes } from 'date-fns'
import { useCalendarStore, CalendarEvent, asCalendarItem } from '@/lib/store/calendarStore'
import { toUserTz } from '@/lib/utils/dates'
import { HOUR_HEIGHT, MIN_EVENT_DURATION } from '@/lib/constants'

const TOTAL_MINUTES = 24 * 60
const SNAP_MIN = 15

/**
 * Expansion IDs from `expandRecurring` look like `${parentId}_${isoDate}`.
 * The underscore separates the real DB id from the virtual occurrence date.
 * Returns the parent id + the occurrence start date, or null if the id
 * is not a synthetic expansion.
 */
function parseExpansionId(id: string): { parentId: string; occStart: string } | null {
  const idx = id.lastIndexOf('_')
  if (idx <= 0) return null
  const tail = id.slice(idx + 1)
  // Occurrence dates serialize as YYYY-MM-DDTHH:MM:SS.sssZ — must start with a 4-digit year
  if (!/^\d{4}-\d{2}-\d{2}T/.test(tail)) return null
  return { parentId: id.slice(0, idx), occStart: tail }
}

interface EventBlockProps {
  event: CalendarEvent
  top: number       // px from top of grid (= minutes since midnight)
  height: number    // px (= minutes)
  left?: string     // percentage left for column overlap
  width?: string    // percentage width for column overlap
  onSaved: () => void
}

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default function EventBlock({
  event,
  top,
  height,
  left = '0%',
  width = '100%',
  onSaved,
}: EventBlockProps) {
  const { openDetailPanel, updateEvent, userTimezone } = useCalendarStore()
  const blockRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{
    startY: number
    origHeight: number
    origStart: Date
    origEnd: Date
  } | null>(null)
  const dragRef = useRef<{
    startY: number
    startX: number
    origTop: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [localTop, setLocalTop] = useState(top)
  const [localHeight, setLocalHeight] = useState(Math.max(height, MIN_EVENT_DURATION))

  const color = event.color ?? '#1a73e8'
  const tz = userTimezone

  const startDate = new Date(event.startUtc)
  const endDate = new Date(event.endUtc)
  const startLocal = toUserTz(startDate, tz)
  const endLocal = toUserTz(endDate, tz)

  // Sync local visual state when parent props change (e.g. store update from elsewhere).
  // While actively dragging/resizing we don't want to be overridden mid-interaction.
  useEffect(() => {
    if (!isDragging && !isResizing) {
      setLocalTop(top)
      setLocalHeight(Math.max(height, MIN_EVENT_DURATION))
    }
  }, [top, height, isDragging, isResizing])

  const timeLabel = `${format(startLocal, 'h:mm')} – ${format(endLocal, 'h:mm a')}`

  // ─── Drag ──────────────────────────────────────────────────────────────────
  const handleMouseDownDrag = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.resize) return
      // Avoid left-button only; allow touch by stopping here for mouse primary
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      dragRef.current = { startY: e.clientY, startX: e.clientX, origTop: localTop }
      setIsDragging(true)

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return
        const dy = me.clientY - dragRef.current.startY
        const minutesDelta = snap((dy / HOUR_HEIGHT) * 60)
        const nextTop = clamp(dragRef.current.origTop + minutesDelta, 0, TOTAL_MINUTES - localHeight)
        setLocalTop(nextTop)
      }

      const onUp = async (me: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (!dragRef.current) return

        const dy = me.clientY - dragRef.current.startY
        const minutesDelta = snap((dy / HOUR_HEIGHT) * 60)
        const origTop = dragRef.current.origTop
        dragRef.current = null
        setIsDragging(false)

        // No-op drag (below snap threshold) — just restore visual.
        if (Math.abs(minutesDelta) < SNAP_MIN) {
          setLocalTop(origTop)
          return
        }

        const newStart = addMinutes(startDate, minutesDelta)
        const newEnd = addMinutes(endDate, minutesDelta)
        const newStartIso = newStart.toISOString()
        const newEndIso = newEnd.toISOString()
        const origStartIso = startDate.toISOString()
        const origEndIso = endDate.toISOString()

        // Expansion ids (from rrule expansion) reference a virtual occurrence,
        // not a real DB row. Resolve the parent id and route to the API's
        // recurring scope handler so the change applies correctly.
        const expansion = parseExpansionId(event.id)
        const apiId = expansion ? expansion.parentId : event.id
        const payload: Record<string, unknown> = {
          startUtc: newStartIso,
          endUtc: newEndIso,
        }
        if (expansion) {
          // 'this' shifts only this occurrence via an exception row.
          payload.scope = 'this'
          payload._occStart = expansion.occStart
        }

        // Optimistic store update
        updateEvent(event.id, { startUtc: newStartIso, endUtc: newEndIso })

        try {
          const res = await fetch(`/api/events/${apiId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          onSaved()
        } catch (err) {
          // Revert on failure (network OR non-2xx)
          console.error('Drag save failed:', err)
          updateEvent(event.id, { startUtc: origStartIso, endUtc: origEndIso })
          setLocalTop(origTop)
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [localTop, localHeight, startDate, endDate, event.id, updateEvent, onSaved]
  )

  // ─── Resize ────────────────────────────────────────────────────────────────
  const handleMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const origHeight = localHeight
      resizeRef.current = {
        startY: e.clientY,
        origHeight,
        origStart: startDate,
        origEnd: endDate,
      }
      setIsResizing(true)

      const onMove = (me: MouseEvent) => {
        if (!resizeRef.current) return
        const dy = me.clientY - resizeRef.current.startY
        const minutesDelta = snap((dy / HOUR_HEIGHT) * 60)
        const maxHeight = TOTAL_MINUTES - localTop
        const nextHeight = clamp(
          resizeRef.current.origHeight + minutesDelta,
          MIN_EVENT_DURATION,
          maxHeight
        )
        setLocalHeight(nextHeight)
      }

      const onUp = async (me: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (!resizeRef.current) return

        const dy = me.clientY - resizeRef.current.startY
        const minutesDelta = snap((dy / HOUR_HEIGHT) * 60)
        const newEnd = addMinutes(endDate, minutesDelta)
        const origEndIso = endDate.toISOString()
        const origHeight = resizeRef.current.origHeight
        resizeRef.current = null
        setIsResizing(false)

        // Enforce minimum duration and grid bounds
        const duration = (newEnd.getTime() - startDate.getTime()) / 60000
        if (duration < MIN_EVENT_DURATION) {
          setLocalHeight(origHeight)
          return
        }
        const maxHeight = TOTAL_MINUTES - localTop
        if (duration > maxHeight) {
          setLocalHeight(origHeight)
          return
        }

        const finalEndIso = newEnd.toISOString()
        updateEvent(event.id, { endUtc: finalEndIso })

        const expansion = parseExpansionId(event.id)
        const apiId = expansion ? expansion.parentId : event.id
        const payload: Record<string, unknown> = { endUtc: finalEndIso }
        if (expansion) {
          payload.scope = 'this'
          payload._occStart = expansion.occStart
        }

        try {
          const res = await fetch(`/api/events/${apiId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          onSaved()
        } catch (err) {
          console.error('Resize save failed:', err)
          updateEvent(event.id, { endUtc: origEndIso })
          setLocalHeight(origHeight)
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [endDate, startDate, localTop, localHeight, event.id, updateEvent, onSaved]
  )

  return (
    <div
      ref={blockRef}
      className="event-block select-none"
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${timeLabel}`}
      style={{
        top: localTop,
        height: localHeight,
        left,
        width,
        backgroundColor: color,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging || isResizing ? 0.85 : 1,
      }}
      onMouseDown={handleMouseDownDrag}
      onKeyDown={(e) => {
        // Keyboard accessibility: Enter / Space opens the detail panel.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDetailPanel(asCalendarItem('event', event as unknown as Record<string, unknown>))
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!isDragging && !isResizing) openDetailPanel(asCalendarItem('event', event as unknown as Record<string, unknown>))
      }}
    >
      <p className="font-medium text-white leading-tight truncate text-[14px]">
        {event.title}
      </p>
      {localHeight > 40 && (
        <p className="text-white/85 text-[12px] truncate">{timeLabel}</p>
      )}

      {/* Resize handle — 8px strip at bottom (per spec) */}
      <div
        data-resize="true"
        className="event-resize-handle"
        onMouseDown={handleMouseDownResize}
        aria-hidden="true"
      />
    </div>
  )
}