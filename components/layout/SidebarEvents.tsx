'use client'

import { useMemo, useState } from 'react'
import { format, isSameDay, isSameMonth, startOfDay } from 'date-fns'
import { useCalendarStore, type CalendarEvent, asCalendarItem } from '@/lib/store/calendarStore'

const MAX_PER_DAY = 3

export default function SidebarEvents() {
  const {
    events: storeEvents,
    calendars,
    openDetailPanel,
    setCurrentDate,
  } = useCalendarStore()
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [eventsCollapsed, setEventsCollapsed] = useState(false)

  // Calendar lookup for color fallback
  const calById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c])),
    [calendars]
  )

  // The page-level fetch (current month range) populates the store; this
  // component just renders from it. Live CRUD in the detail panel mutates
  // the store directly, so create/delete updates the sidebar in real time.

  // Group events by local date string YYYY-MM-DD
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { date: Date; events: CalendarEvent[] }
    >()

    for (const ev of storeEvents) {
      const start = new Date(ev.startUtc)
      // Use the calendar's local-day key (user's locale is fine here since
      // we're rendering in the same locale the rest of the calendar uses).
      const key = format(start, 'yyyy-MM-dd')
      const existing = map.get(key)
      if (existing) {
        existing.events.push(ev)
      } else {
        map.set(key, { date: startOfDay(start), events: [ev] })
      }
    }

    // Sort events within each day by start time, then sort days ascending
    for (const { events } of map.values()) {
      events.sort(
        (a, b) =>
          new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
      )
    }
    return Array.from(map.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    )
  }, [storeEvents])

  function handleEventClick(event: CalendarEvent) {
    setCurrentDate(new Date(event.startUtc))
    openDetailPanel(asCalendarItem('event', event as unknown as Record<string, unknown>))
  }

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Empty state
  if (grouped.length === 0) {
    return (
      <div className="px-3 pb-4">
        <button
          onClick={() => setEventsCollapsed((c) => !c)}
          aria-expanded={!eventsCollapsed}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1f1f1f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
        >
          <span className="text-[16px] font-medium text-[#202124] dark:text-gray-100 tracking-tight">
            Events
          </span>
          <svg
            className={`w-4 h-4 text-[#5f6368] dark:text-gray-400 shrink-0 transition-transform duration-200 ${eventsCollapsed ? '-rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ${eventsCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}
        >
          <div className="text-[14px] text-[#70757a] dark:text-gray-400 px-3 py-2">
            No events this month
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pb-2">
      <button
        onClick={() => setEventsCollapsed((c) => !c)}
        aria-expanded={!eventsCollapsed}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1f1f1f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
      >
        <span className="text-[16px] font-medium text-[#202124] dark:text-gray-100 tracking-tight">
          Events
        </span>
        <svg
          className={`w-4 h-4 text-[#5f6368] dark:text-gray-400 shrink-0 transition-transform duration-200 ${eventsCollapsed ? '-rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${eventsCollapsed ? 'max-h-0' : 'max-h-[4000px]'}`}
      >
      {grouped.length === 0 && (
        <div className="px-5 py-3 text-[14px] text-[#70757a] dark:text-gray-400">
          No events this month
        </div>
      )}

      {grouped.map(({ date, events: dayEvents }) => {
        const key = format(date, 'yyyy-MM-dd')
        const isExpanded = expandedDays.has(key)
        const visible = isExpanded ? dayEvents : dayEvents.slice(0, MAX_PER_DAY)
        const hiddenCount = dayEvents.length - visible.length
        const isToday = isSameDay(date, new Date())

        return (
          <div key={key} className="px-4">
            <div className="sidebar-event-day">
              <span className={isToday ? 'text-[#1a73e8]' : ''}>
                {isToday
                  ? 'Today'
                  : format(date, isSameMonth(date, new Date()) ? 'EEE d' : 'EEE MMM d')}
              </span>
            </div>

            {visible.map((event) => {
              const cal = calById.get(event.calendarId)
              const color = event.color ?? cal?.color ?? '#1a73e8'
              const start = new Date(event.startUtc)
              return (
                <div
                  key={event.id}
                  className="sidebar-event-item focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#2d2d2d]"
                  onClick={() => handleEventClick(event)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${event.title} at ${event.isAllDay ? 'all day' : format(start, 'h:mm a')}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleEventClick(event)
                    }
                  }}
                >
                  <span
                    className="sidebar-event-dot"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="sidebar-event-time">
                    {event.isAllDay
                      ? 'All day'
                      : format(start, 'h:mm a')}
                  </span>
                  <span className="sidebar-event-title">{event.title}</span>
                </div>
              )
            })}

            {hiddenCount > 0 && (
              <div
                className="sidebar-event-more focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#2d2d2d]"
                onClick={() => toggleDay(key)}
                tabIndex={0}
                role="button"
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleDay(key)
                  }
                }}
              >
                {hiddenCount} more
              </div>
            )}
            {isExpanded && dayEvents.length > MAX_PER_DAY && (
              <div
                className="sidebar-event-more focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#2d2d2d]"
                onClick={() => toggleDay(key)}
                tabIndex={0}
                role="button"
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleDay(key)
                  }
                }}
              >
                Show less
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}