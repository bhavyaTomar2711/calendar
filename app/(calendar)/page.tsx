'use client'

import { useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import WeekView from '@/components/calendar/WeekView'
import MonthView from '@/components/calendar/MonthView'
import DayView from '@/components/calendar/DayView'
import QuickEventModal from '@/components/modals/QuickEventModal'
import QuickCreateMenu from '@/components/modals/QuickCreateMenu'
import EventDetailPanel from '@/components/modals/EventDetailPanel'
import { useCalendarStore, type CalendarTask } from '@/lib/store/calendarStore'
import { getWeekRange, getMonthGridRange } from '@/lib/utils/dates'
import { addDays } from 'date-fns'

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const {
    currentView,
    currentDate,
    setEvents,
    setTasks,
    setCalendars,
    setIsLoadingEvents,
  } = useCalendarStore()

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Fetch calendars
  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch('/api/calendars')
      if (res.ok) {
        const data = await res.json()
        setCalendars(data)
      }
    } catch (err) {
      console.error('Failed to fetch calendars:', err)
    }
  }, [setCalendars])

  // Fetch events for current window
  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true)
    try {
      let start: Date
      let end: Date

      if (currentView === 'week') {
        const range = getWeekRange(currentDate)
        start = range.start
        end = range.end
      } else if (currentView === 'month') {
        const range = getMonthGridRange(currentDate)
        start = range.start
        end = range.end
      } else {
        start = currentDate
        end = addDays(currentDate, 1)
      }

      const res = await fetch(
        `/api/events?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      setIsLoadingEvents(false)
    }
  }, [currentView, currentDate, setEvents, setIsLoadingEvents])

  // Fetch all incomplete tasks for the sidebar list. Done once on mount;
  // mutations in the panel flow through the store so we don't re-fetch.
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?completed=false')
      if (res.ok) {
        const data: CalendarTask[] = await res.json()
        setTasks(data)
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    }
  }, [setTasks])

  // Always fetch the full month range so the sidebar's grouped event list
  // stays in sync regardless of which view (day/week/month) the grid is in.
  // Without this, switching to week view would shrink the store and hide
  // the sidebar's events for the rest of the month.
  const fetchSidebarEvents = useCallback(async () => {
    try {
      const range = getMonthGridRange(currentDate)
      const res = await fetch(
        `/api/events?start=${range.start.toISOString()}&end=${range.end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } catch (err) {
      console.error('Failed to fetch sidebar events:', err)
    }
  }, [currentDate, setEvents])

  // Unified refresh — used after any CRUD in the modals.
  // Runs both the view-window fetch (for the grid) AND the month fetch
  // (for the sidebar) so live CRUD stays in sync everywhere.
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchEvents(), fetchTasks(), fetchSidebarEvents()])
  }, [fetchEvents, fetchTasks, fetchSidebarEvents])

  useEffect(() => {
    if (session) {
      fetchCalendars()
    }
  }, [session, fetchCalendars])

  useEffect(() => {
    if (session) {
      fetchEvents()
    }
  }, [session, currentDate, currentView, fetchEvents])

  useEffect(() => {
    if (session) {
      fetchSidebarEvents()
    }
  }, [session, currentDate, fetchSidebarEvents])

  useEffect(() => {
    if (session) {
      fetchTasks()
    }
  }, [session, fetchTasks])

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-[#1f1f1f]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#1a73e8] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500 text-sm">Loading calendar…</span>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="flex flex-col h-screen bg-[#f8fafd] dark:bg-[#1f1f1f] overflow-hidden">
      <Header onEventSaved={refreshAll} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onEventSaved={refreshAll} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 pl-3 pr-10 pb-6 pt-2 overflow-hidden">
            <div className="h-full overflow-hidden rounded-3xl bg-white dark:bg-[#1f1f1f] shadow-[0_1px_2px_rgba(60,64,67,0.04),0_2px_8px_rgba(60,64,67,0.04)]">
              {currentView === 'week' && <WeekView onEventSaved={refreshAll} />}
              {currentView === 'month' && <MonthView onEventSaved={refreshAll} />}
              {currentView === 'day' && <DayView onEventSaved={refreshAll} />}
            </div>
          </div>
        </main>
      </div>
      <QuickEventModal onEventSaved={refreshAll} />
      <QuickCreateMenu />
      <EventDetailPanel onEventSaved={refreshAll} />
    </div>
  )
}
