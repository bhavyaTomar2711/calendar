'use client'

import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { useCalendarStore } from '@/lib/store/calendarStore'
import { toUserTz } from '@/lib/utils/dates'
import { TIME_GUTTER } from '@/lib/constants'
import TimeGrid from './TimeGrid'

interface DayViewProps {
  onEventSaved: () => void
}

export default function DayView({ onEventSaved }: DayViewProps) {
  const { currentDate, userTimezone } = useCalendarStore()
  const tz = userTimezone
  const today = new Date()
  const isToday = isSameDay(toUserTz(currentDate, tz), toUserTz(today, tz))

  const days = useMemo(() => [currentDate], [currentDate])

  return (
    <div className="flex flex-col h-full overflow-hidden overflow-x-hidden bg-white dark:bg-[#1f1f1f]">
      {/* Day header */}
      <div className="flex shrink-0 bg-white dark:bg-[#1f1f1f] pt-4 pb-3">
        <div className="shrink-0 w-10 md:w-[72px]" />
        <div className="flex-1 text-center py-3 border-l border-[#e8eaed] dark:border-[#3d3d3d] min-h-[80px] flex flex-col items-center justify-center">
          <div className={`text-[10px] md:text-[11px] font-medium uppercase tracking-wide mb-1 ${isToday ? 'text-[#1a73e8]' : 'text-[#70757a] dark:text-gray-400'}`}>
            {format(currentDate, 'EEEE')}
          </div>
          <div
            className={`text-[24px] md:text-[40px] font-light mx-auto flex items-center justify-center rounded-full
              ${isToday ? 'bg-[#1a73e8] text-white w-10 h-10 md:w-14 md:h-14 font-medium' : 'text-[#3c4043] dark:text-gray-200 w-10 h-10 md:w-14 md:h-14'}`}
          >
            {format(currentDate, 'd')}
          </div>
        </div>
      </div>

      {/* Time grid */}
      <TimeGrid days={days} onSaved={onEventSaved} />
    </div>
  )
}
