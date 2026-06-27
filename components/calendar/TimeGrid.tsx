'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { isSameDay, differenceInMinutes, format } from 'date-fns'
import { useCalendarStore, CalendarEvent, asCalendarItem } from '@/lib/store/calendarStore'
import { toUserTz, fromUserTz, getMinutesFromMidnight, getTzLabel } from '@/lib/utils/dates'
import { HOUR_HEIGHT, TIME_GUTTER } from '@/lib/constants'
import EventBlock from './EventBlock'

const DEFAULT_COLOR_HEX = '#1a73e8'

/** Convert a local-time Date back to a UTC ISO string (mirror of fromUserTz). */
function fromUserTzToIso(localDate: Date, tz: string): string {
  return fromUserTz(localDate, tz).toISOString()
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const SNAP_MIN = 15
const TOTAL_MINUTES = 24 * 60

function formatHour(h: number) {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Compute left/width for overlapping events in a single column */
function layoutEvents(events: CalendarEvent[], tz: string) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
  )

  const columns: CalendarEvent[][] = []
  const eventCols = new Map<string, number>()
  const eventColCount = new Map<string, number>()

  for (const evt of sorted) {
    const start = new Date(evt.startUtc)
    const end = new Date(evt.endUtc)

    let placed = false
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci]
      const last = col[col.length - 1]
      if (new Date(last.endUtc) <= start) {
        col.push(evt)
        eventCols.set(evt.id, ci)
        placed = true
        break
      }
    }
    if (!placed) {
      columns.push([evt])
      eventCols.set(evt.id, columns.length - 1)
    }
  }

  // Determine how many columns each event spans (largest cluster of overlaps)
  for (const evt of sorted) {
    const start = new Date(evt.startUtc)
    const end = new Date(evt.endUtc)
    let maxCol = eventCols.get(evt.id) ?? 0
    for (const other of sorted) {
      if (other.id === evt.id) continue
      const os = new Date(other.startUtc)
      const oe = new Date(other.endUtc)
      if (os < end && oe > start) {
        maxCol = Math.max(maxCol, eventCols.get(other.id) ?? 0)
      }
    }
    eventColCount.set(evt.id, maxCol + 1)
  }

  return { eventCols, eventColCount, totalCols: columns.length }
}

interface TimeGridProps {
  days: Date[] // 1 day for DayView, 7 for WeekView
  onSaved: () => void
}

export default function TimeGrid({ days, onSaved }: TimeGridProps) {
  const { events, tasks, calendars, userTimezone, openQuickModal } = useCalendarStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const tz = userTimezone

  // Live "now" — re-render every minute so the current-time indicator stays current.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    // Align to the next minute boundary, then tick every 60s.
    const msToNextMinute = 60000 - (Date.now() % 60000)
    const initial = setTimeout(() => {
      tick()
      const id = setInterval(tick, 60000)
      ;(intervalRef as { current: ReturnType<typeof setInterval> | null }).current = id
    }, msToNextMinute)
    const intervalRef = { current: null as ReturnType<typeof setInterval> | null }
    return () => {
      clearTimeout(initial)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Scroll to current time on mount and when tz changes
  useEffect(() => {
    if (!scrollRef.current) return
    const mins = getMinutesFromMidnight(new Date(), tz)
    const scrollTop = Math.max(0, mins - 120) // show 2hr before current time
    scrollRef.current.scrollTop = scrollTop
  }, [tz])

  // Live current-time pixel — uses `now` so it updates with the interval.
  const currentTimePx = useMemo(() => {
    return getMinutesFromMidnight(now, tz)
  }, [now, tz])

  // Visible calendar ids (memoized — was rebuilt every render)
  const visibleCalIds = useMemo(
    () => new Set(calendars.filter((c) => c.visible !== false).map((c) => c.id)),
    [calendars]
  )

  // Filter and group events by day
  // (eventsByDay unused after refactor — kept implicit via gridItemsByDay)

  // All-day events
  const allDayEvents = useMemo(() => {
    return days.map((day) =>
      events.filter((evt) => {
        if (!visibleCalIds.has(evt.calendarId)) return false
        if (!evt.isAllDay) return false
        const evtStart = toUserTz(new Date(evt.startUtc), tz)
        return isSameDay(evtStart, toUserTz(day, tz))
      })
    )
  }, [events, days, tz, visibleCalIds])

  // Combined time-grid items: timed events + tasks rendered as 30-min blocks
  // starting at their dueUtc time. Each item is shaped like a CalendarEvent
  // so layoutEvents() / EventBlock can render them uniformly.
  // `kind` lets the renderer choose between EventBlock and a task pill.
  const gridItemsByDay = useMemo(() => {
    const TASK_DURATION_MIN = 30
    return days.map((day) => {
      const items: (CalendarEvent & { _kind: 'event' | 'task' })[] = []

      // Timed events
      for (const evt of events) {
        if (!visibleCalIds.has(evt.calendarId)) continue
        if (evt.isAllDay) continue
        const evtStart = toUserTz(new Date(evt.startUtc), tz)
        if (!isSameDay(evtStart, toUserTz(day, tz))) continue
        items.push({ ...evt, _kind: 'event' })
      }

      // Tasks — only those scheduled (dueUtc) and not completed
      for (const t of tasks) {
        if (t.completed || !t.dueUtc) continue
        const due = new Date(t.dueUtc)
        // If the stored time is exactly UTC midnight, treat as legacy
        // date-only and place at the current local time. New tasks always
        // carry a real time so this branch is mostly historical.
        const isDateOnly = due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0
        let startLocal: Date
        let endLocal: Date
        if (isDateOnly) {
          const local = toUserTz(due, tz)
          const now = new Date()
          local.setHours(now.getHours(), now.getMinutes(), 0, 0)
          startLocal = local
          endLocal = new Date(local.getTime() + TASK_DURATION_MIN * 60_000)
        } else {
          startLocal = toUserTz(due, tz)
          endLocal = new Date(startLocal.getTime() + TASK_DURATION_MIN * 60_000)
        }
        // Skip if the task's date doesn't fall on this day
        if (!isSameDay(startLocal, toUserTz(day, tz))) continue

        items.push({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          startUtc: fromUserTzToIso(startLocal, tz),
          endUtc: fromUserTzToIso(endLocal, tz),
          isAllDay: false,
          color: t.color ?? DEFAULT_COLOR_HEX,
          calendarId: '',
          userId: t.userId,
          _kind: 'task',
        })
      }

      return items
    })
  }, [events, tasks, days, tz, visibleCalIds])

  function handleCellClick(e: React.MouseEvent, day: Date) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    // Correct conversion: y is pixels; HOUR_HEIGHT is px-per-hour.
    const minutes = (y / HOUR_HEIGHT) * 60
    const snapped = Math.round(minutes / SNAP_MIN) * SNAP_MIN
    const clickedDate = toUserTz(day, tz)
    const totalMin = Math.floor(snapped / 60) * 60 + (snapped % 60)
    clickedDate.setHours(0, Math.max(0, Math.min(totalMin, TOTAL_MINUTES - SNAP_MIN)), 0, 0)
    openQuickModal({ x: e.clientX, y: e.clientY }, clickedDate)
  }

  const totalHeight = 24 * HOUR_HEIGHT

  return (
    <div className="flex flex-col h-full overflow-hidden overflow-x-hidden bg-white dark:bg-[#1f1f1f]">
      {/* All-day row */}
      <div className="flex shrink-0">
        {/* Time label gutter */}
        <div
          className="shrink-0 px-1 md:px-3 py-2 text-right w-10 md:w-[72px]"
        >
          {days.length === 1 ? (
            <span className="text-[10px] text-[#70757a] dark:text-gray-400 font-medium">
              {getTzLabel(tz)}
            </span>
          ) : (
            <span className="text-[10px] text-[#70757a] dark:text-gray-400 font-medium uppercase tracking-wide">
              {getTzLabel(tz)}
            </span>
          )}
        </div>
        {/* All-day cells — same X-coordinate math as the day-header row in
            WeekView so columns align vertically across the two rows */}
        <div className="flex-1 relative pt-2 pb-1" style={{ minHeight: 32 }}>
          {days.map((day, di) => (
            <div
              key={di}
              className="absolute top-0 bottom-0 px-1 py-1"
              style={{
                left: `${(di / days.length) * 100}%`,
                width: `${(1 / days.length) * 100}%`,
              }}
            >
              {allDayEvents[di].map((evt) => (
                <div
                  key={evt.id}
                  role="button"
                  tabIndex={0}
                  aria-label={evt.title}
                  className="text-white text-xs rounded px-2 py-1 mb-1 cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-white"
                  style={{ backgroundColor: evt.color ?? '#1a73e8' }}
                  onClick={() => useCalendarStore.getState().openDetailPanel(asCalendarItem('event', evt as unknown as Record<string, unknown>))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      useCalendarStore.getState().openDetailPanel(asCalendarItem('event', evt as unknown as Record<string, unknown>))
                    }
                  }}
                >
                  {evt.title}
                </div>
              ))}
              {/* Tasks render on the time grid below — NOT in the all-day row,
                  so they get a specific start time (default 09:00 on dueUtc). */}
            </div>
          ))}
          {/* No divider overlay — all-day row shares its column edges with
              the time-grid below. The dividers live on the time-grid. */}
        </div>
      </div>

      {/* Time grid (scrollable) — scroll-stable reserves the right-side
              scrollbar gutter so percentage-positioned dividers align with
              the all-day row above and the day-header in WeekView. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-stable">
        <div className="flex" style={{ height: totalHeight }}>
          {/* Time labels column — 72px wide, right-aligned, sits at top of each hour */}
          <div
            className="shrink-0 relative select-none w-10 md:w-[72px]"
            aria-hidden="true"
          >
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 md:right-3 text-[10px] md:text-[12px] text-[#70757a] dark:text-gray-400 font-normal whitespace-nowrap"
                style={{ top: h * HOUR_HEIGHT - 8, transform: 'translateY(-50%)' }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns — absolute positioned so dividers align perfectly */}
          <div className="flex-1 relative">
            {/* Hour separator lines — single set drawn across all columns */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 bg-[#dadce0] dark:bg-[#404040]"
                style={{ top: h * HOUR_HEIGHT, height: '1px' }}
                aria-hidden="true"
              />
            ))}

            {/* Per-day click + event rendering */}
            {days.map((day, di) => {
              const dayItems = gridItemsByDay[di]
              const { eventCols, eventColCount, totalCols } = layoutEvents(dayItems, tz)
              const isToday = isSameDay(toUserTz(day, tz), toUserTz(now, tz))

              return (
                <div
                  key={di}
                  role="grid"
                  aria-label={day.toDateString()}
                  className="absolute top-0 cursor-pointer"
                  style={{
                    left: `${(di / days.length) * 100}%`,
                    width: `${(1 / days.length) * 100}%`,
                    height: totalHeight,
                  }}
                  onClick={(e) => handleCellClick(e, day)}
                >
                  {/* Current time line (only on today's column) */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none z-20"
                      style={{ top: currentTimePx }}
                      aria-hidden="true"
                    >
                      <div className="h-[2px] bg-[#ea4335] relative">
                        <div className="absolute left-0 -top-[5px] w-[10px] h-[10px] rounded-full bg-[#ea4335]" />
                      </div>
                    </div>
                  )}

                  {/* Time-grid items (timed events + tasks). Tasks render as a
                      compact pill with a circle glyph; events go through
                      EventBlock which handles drag/resize. */}
                  {dayItems.map((item) => {
                    const evtStart = new Date(item.startUtc)
                    const evtEnd = new Date(item.endUtc)
                    const topPx = getMinutesFromMidnight(evtStart, tz)
                    const heightPx = Math.max(
                      differenceInMinutes(evtEnd, evtStart),
                      30
                    )
                    const col = eventCols.get(item.id) ?? 0
                    const colCount = eventColCount.get(item.id) ?? 1
                    const colW = 100 / Math.max(totalCols, colCount)

                    if (item._kind === 'task') {
                      // Tasks always need room for title + time, so bump the
                      // minimum height above the standard 30-min event block.
                      const taskHeight = Math.max(heightPx, 44)
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Task: ${item.title}`}
                          title={item.title}
                          className="event-block select-none"
                          style={{
                            top: topPx,
                            height: taskHeight,
                            left: `${col * colW}%`,
                            width: `${colW - 1}%`,
                            backgroundColor: item.color ?? DEFAULT_COLOR_HEX,
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            useCalendarStore.getState().openDetailPanel(
                              asCalendarItem('task', item as unknown as Record<string, unknown>)
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              useCalendarStore.getState().openDetailPanel(
                                asCalendarItem('task', item as unknown as Record<string, unknown>)
                              )
                            }
                          }}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <svg
                              className="w-3 h-3 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" strokeWidth={2} />
                            </svg>
                            <span className="font-medium text-[14px] truncate flex-1">
                              {item.title}
                            </span>
                          </div>
                          <div className="text-white/85 text-[12px] mt-0.5 truncate">
                            {`${format(evtStart, 'h:mm')} – ${format(evtEnd, 'h:mm a')}`}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <EventBlock
                        key={item.id}
                        event={item}
                        top={topPx}
                        height={heightPx}
                        left={`${col * colW}%`}
                        width={`${colW - 1}%`}
                        onSaved={onSaved}
                      />
                    )
                  })}
                </div>
              )
            })}

            {/* Vertical column dividers — drawn ONCE so each line sits between
                two adjacent columns. A 1px div with no transform renders the
                line flush at the column edge (no sub-pixel clipping). */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {Array.from({ length: days.length + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 bg-[#c4c7cc] dark:bg-[#484848]"
                  style={{
                    left: `${(i / days.length) * 100}%`,
                    width: '1px',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}