'use client'

import { useMemo, useState } from 'react'
import { format, isSameDay, isSameMonth, startOfDay } from 'date-fns'
import { useCalendarStore, CalendarEvent, asCalendarItem } from '@/lib/store/calendarStore'
import { getMonthGrid, toUserTz } from '@/lib/utils/dates'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_EVENTS_VISIBLE = 3

interface MonthViewProps {
  onEventSaved: () => void
}

export default function MonthView({ onEventSaved: _onEventSaved }: MonthViewProps) {
  const { currentDate, events, tasks, calendars, userTimezone, openQuickModal, openDetailPanel, setCurrentDate, setView } =
    useCalendarStore()
  const tz = userTimezone
  const today = new Date()
  const [popoverDay, setPopoverDay] = useState<Date | null>(null)

  const grid = useMemo(() => getMonthGrid(currentDate), [currentDate])

  const visibleCalIds = new Set(
    calendars.filter((c) => c.visible !== false).map((c) => c.id)
  )

  function getEventsForDay(day: Date): CalendarEvent[] {
    return events.filter((evt) => {
      if (!visibleCalIds.has(evt.calendarId)) return false
      const start = toUserTz(new Date(evt.startUtc), tz)
      return isSameDay(start, toUserTz(day, tz))
    })
  }

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => {
      if (t.completed || !t.dueUtc) return false
      const due = toUserTz(new Date(t.dueUtc), tz)
      return isSameDay(due, toUserTz(day, tz))
    })
  }

  function handleCellClick(e: React.MouseEvent, day: Date) {
    // Don't open modal if clicking on an event
    if ((e.target as HTMLElement).closest('[data-event]')) return
    openQuickModal({ x: e.clientX, y: e.clientY }, day)
  }

  function handleDayNumberClick(e: React.MouseEvent, day: Date) {
    e.stopPropagation()
    setCurrentDate(day)
    setView('day')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#1f1f1f]">
      {/* Column headers */}
      <div className="grid grid-cols-7 border-b border-[#e0e0e0] dark:border-[#3d3d3d] shrink-0">
        {DAYS_OF_WEEK.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-[#70757a] py-2 uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6-row grid */}
      <div className="flex-1 grid grid-rows-6 overflow-hidden" role="grid" aria-label="Month calendar">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[#e0e0e0] dark:border-[#3d3d3d]" role="row">
            {week.map((day, di) => {
              const isToday = isSameDay(toUserTz(day, tz), toUserTz(today, tz))
              const isCurrentMonth = isSameMonth(day, currentDate)
              const dayEvents = getEventsForDay(day)
              const dayTasks = getTasksForDay(day)

              // Merge events + tasks into a single list, then truncate to the
              // visible budget. The remaining count feeds the "+N more" link.
              type Pill =
                | { kind: 'event'; data: CalendarEvent }
                | { kind: 'task'; data: typeof dayTasks[number] }
              const allPills: Pill[] = [
                ...dayEvents.map((e) => ({ kind: 'event' as const, data: e })),
                ...dayTasks.map((t) => ({ kind: 'task' as const, data: t })),
              ]
              const visiblePills = allPills.slice(0, MAX_EVENTS_VISIBLE)
              const extraCount = allPills.length - visiblePills.length

              return (
                <div
                  key={di}
                  role="gridcell"
                  aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                  className={`border-r border-[#e0e0e0] dark:border-[#3d3d3d] p-1 overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a73e8]
                    ${isCurrentMonth
                      ? 'bg-white dark:bg-[#1f1f1f]'
                      : 'bg-[#f8f8f8] dark:bg-[#191919]'
                    }`}
                  onClick={(e) => handleCellClick(e, day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openQuickModal({ x: 200, y: 200 }, day)
                    }
                  }}
                  tabIndex={0}
                >
                  {/* Date number */}
                  <div className="flex items-center mb-1">
                    <button
                      onClick={(e) => handleDayNumberClick(e, day)}
                      aria-label={`Open ${format(day, 'EEEE, MMMM d')} in day view`}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]
                        ${isToday
                          ? 'bg-[#1a73e8] text-white'
                          : isCurrentMonth
                            ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#3d3d3d]'
                            : 'text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#3d3d3d]'
                        }`}
                    >
                      {format(day, 'd')}
                    </button>
                  </div>

                  {/* Event + task pills (merged list, capped to MAX_EVENTS_VISIBLE) */}
                  <div className="space-y-1">
                    {visiblePills.map((pill) =>
                      pill.kind === 'event' ? (
                        <div
                          key={`e-${pill.data.id}`}
                          data-event="true"
                          role="button"
                          tabIndex={0}
                          aria-label={`${pill.data.title} ${pill.data.isAllDay ? 'all day' : `at ${format(toUserTz(new Date(pill.data.startUtc), tz), 'h:mm a')}`}`}
                          className="text-white text-[13px] rounded px-2 py-1 truncate cursor-pointer hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          style={{ backgroundColor: pill.data.color ?? '#1a73e8' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetailPanel(asCalendarItem('event', pill.data as unknown as Record<string, unknown>))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              openDetailPanel(asCalendarItem('event', pill.data as unknown as Record<string, unknown>))
                            }
                          }}
                          title={pill.data.title}
                        >
                          {!pill.data.isAllDay && (
                            <span className="opacity-80 mr-1 text-[11px]">
                              {format(toUserTz(new Date(pill.data.startUtc), tz), 'h:mm')}
                            </span>
                          )}
                          {pill.data.title}
                        </div>
                      ) : (
                        <div
                          key={`t-${pill.data.id}`}
                          data-event="true"
                          role="button"
                          tabIndex={0}
                          aria-label={`Task: ${pill.data.title}`}
                          className="flex items-center gap-1.5 text-white text-[13px] rounded px-2 py-1 truncate cursor-pointer hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          style={{ backgroundColor: pill.data.color ?? '#1a73e8' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetailPanel(asCalendarItem('task', pill.data as unknown as Record<string, unknown>))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              openDetailPanel(asCalendarItem('task', pill.data as unknown as Record<string, unknown>))
                            }
                          }}
                          title={pill.data.title}
                        >
                          <svg
                            className="w-3 h-3 shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="9" strokeWidth={2} />
                          </svg>
                          <span className="truncate">{pill.data.title}</span>
                        </div>
                      )
                    )}

                    {/* +N more */}
                    {extraCount > 0 && (
                      <button
                        aria-label={`Show ${extraCount} more items for ${format(day, 'MMMM d')}`}
                        aria-haspopup="dialog"
                        className="text-[13px] text-[#1a73e8] hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded px-1 py-1 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] min-h-[28px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPopoverDay(day)
                        }}
                      >
                        +{extraCount} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Day popover ("+N more" expanded view) */}
      {popoverDay && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setPopoverDay(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Events on ${format(popoverDay, 'EEEE, MMMM d')}`}
            className="fixed z-50 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-2xl shadow-xl p-4 w-72 max-h-[80vh] overflow-y-auto"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPopoverDay(null)
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  {format(popoverDay, 'EEE')}
                </div>
                <div className="text-2xl font-light text-gray-800 dark:text-gray-100">
                  {format(popoverDay, 'd')}
                </div>
              </div>
              <button
                onClick={() => setPopoverDay(null)}
                aria-label="Close"
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-1">
              {[
                ...getEventsForDay(popoverDay).map((e) => ({ kind: 'event' as const, data: e })),
                ...getTasksForDay(popoverDay).map((t) => ({ kind: 'task' as const, data: t })),
              ].map((item) =>
                item.kind === 'event' ? (
                  <div
                    key={`e-${item.data.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.data.title} ${item.data.isAllDay ? 'all day' : `at ${format(toUserTz(new Date(item.data.startUtc), tz), 'h:mm a')}`}`}
                    className="text-white text-sm rounded-lg px-3 py-2 cursor-pointer hover:opacity-90 flex items-center gap-2 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{ backgroundColor: item.data.color ?? '#1a73e8' }}
                    onClick={() => {
                      openDetailPanel(asCalendarItem('event', item.data as unknown as Record<string, unknown>))
                      setPopoverDay(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openDetailPanel(asCalendarItem('event', item.data as unknown as Record<string, unknown>))
                        setPopoverDay(null)
                      }
                    }}
                  >
                    {!item.data.isAllDay && (
                      <span className="text-xs opacity-80">
                        {format(toUserTz(new Date(item.data.startUtc), tz), 'h:mm a')}
                      </span>
                    )}
                    <span className="truncate">{item.data.title}</span>
                  </div>
                ) : (
                  <div
                    key={`t-${item.data.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Task: ${item.data.title}`}
                    className="text-white text-sm rounded-lg px-3 py-2 cursor-pointer hover:opacity-90 flex items-center gap-2 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{ backgroundColor: item.data.color ?? '#1a73e8' }}
                    onClick={() => {
                      openDetailPanel(asCalendarItem('task', item.data as unknown as Record<string, unknown>))
                      setPopoverDay(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openDetailPanel(asCalendarItem('task', item.data as unknown as Record<string, unknown>))
                        setPopoverDay(null)
                      }
                    }}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    </svg>
                    <span className="truncate">{item.data.title}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
