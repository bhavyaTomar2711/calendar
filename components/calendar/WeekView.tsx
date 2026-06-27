'use client'

import { useMemo } from 'react'
import { format, isSameDay, startOfWeek } from 'date-fns'
import { useCalendarStore } from '@/lib/store/calendarStore'
import { getWeekDays, toUserTz } from '@/lib/utils/dates'
import TimeGrid from './TimeGrid'

// Sidebar width must stay in sync with components/layout/Sidebar.tsx
export const SIDEBAR_WIDTH = 256
// Time-label gutter inside the week/day grid (matches Google Calendar)
export const TIME_GUTTER = 72

interface WeekViewProps {
  onEventSaved: () => void
}

export default function WeekView({ onEventSaved }: WeekViewProps) {
  const { currentDate, userTimezone } = useCalendarStore()
  const tz = userTimezone
  const today = new Date()

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 0 }),
    [currentDate]
  )
  const days = useMemo(() => getWeekDays(weekStart), [weekStart])

  return (
    <div className="flex flex-col h-full overflow-hidden overflow-x-hidden bg-white dark:bg-[#1f1f1f]">
      {/* Day headers — no top/bottom border lines so the day-of-week label
          and date number sit in clean whitespace. Vertical dividers are
          drawn as a single overlay so they align with the time grid below.
          The row has explicit min-height + padding so both texts fit fully
          inside the rounded card (no clipping at the top). */}
      <div className="flex shrink-0 bg-white dark:bg-[#1f1f1f]">
        {/* Time label gutter — sized to match the time column in TimeGrid */}
        <div className="shrink-0 w-10 md:w-[72px]" />
        <div className="flex-1 relative min-h-[96px] pt-7 pb-3">
          {days.map((day, i) => {
            const isToday = isSameDay(toUserTz(day, tz), toUserTz(today, tz))
            return (
              <div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  left: `${(i / days.length) * 100}%`,
                  width: `${(1 / days.length) * 100}%`,
                }}
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <div
                    className={`text-[10px] md:text-[12px] font-semibold uppercase tracking-wide mb-1 md:mb-2 leading-none ${
                      isToday
                        ? 'text-[#1a73e8]'
                        : 'text-[#5f6368] dark:text-gray-300'
                    }`}
                  >
                    {format(day, 'EEE')}
                  </div>
                  <div
                    className={`text-[16px] md:text-[28px] flex items-center justify-center rounded-full leading-none transition-colors
                      ${
                        isToday
                          ? 'bg-[#1a73e8] text-white w-8 h-8 md:w-11 md:h-11 font-medium'
                          : 'text-[#3c4043] dark:text-gray-200 w-8 h-8 md:w-11 md:h-11 font-normal'
                      }`}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              </div>
            )
          })}
          {/* No divider overlay here — the day-of-week text and date numbers
              sit in clean whitespace per the design (no vertical lines between
              date columns). */}
        </div>
      </div>

      {/* Time grid */}
      <TimeGrid days={days} onSaved={onEventSaved} />
    </div>
  )
}