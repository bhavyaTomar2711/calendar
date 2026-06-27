'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addHours } from 'date-fns'
import { useCalendarStore } from '@/lib/store/calendarStore'
import { fromUserTz, toUserTz } from '@/lib/utils/dates'
import { DEFAULT_COLOR } from '@/lib/constants'

/**
 * The popover that opens from the sidebar "Create" FAB. Lets the user choose
 * between creating an Event (opens the detail panel in event mode) or a Task
 * (opens the detail panel in task mode).
 *
 * Backdrop closes on outside click / Escape. Positioning mirrors the existing
 * QuickEventModal so the visual location stays consistent.
 */
export default function QuickCreateMenu() {
  const {
    createMenuOpen,
    createMenuAnchor,
    closeCreateMenu,
    openDetailPanel,
    calendars,
    userTimezone,
  } = useCalendarStore()

  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Anchor the popover flush against the Create button. If we measured the
  // button's rect on click, use it directly — otherwise fall back to a
  // sidebar-edge default.
  useEffect(() => {
    if (!createMenuOpen) {
      setPos(null)
      return
    }
    const PAD = 12
    const modalW = 280
    const modalH = 200
    const GAP = 8 // visual gap between button right edge and popover left edge

    let left: number
    let top: number
    if (createMenuAnchor) {
      // Place popover just to the right of the button, top-aligned with it.
      left = createMenuAnchor.right + GAP
      top = createMenuAnchor.top
    } else {
      left = 256 + GAP
      top = 96
    }
    // Clamp inside viewport
    left = Math.min(Math.max(PAD, left), window.innerWidth - modalW - PAD)
    top = Math.min(Math.max(PAD, top), window.innerHeight - modalH - PAD)
    setPos({ left, top })
  }, [createMenuOpen, createMenuAnchor])

  // Close on outside click
  useEffect(() => {
    if (!createMenuOpen) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeCreateMenu()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [createMenuOpen, closeCreateMenu])

  // Close on Escape
  useEffect(() => {
    if (!createMenuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeCreateMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [createMenuOpen, closeCreateMenu])

  function handleEvent() {
    const tz = userTimezone
    const now = toUserTz(new Date(), tz)
    now.setMinutes(0, 0, 0)
    const start = fromUserTz(now, tz)
    const end = fromUserTz(addHours(now, 1), tz)
    openDetailPanel({
      kind: 'event',
      data: {
        id: '__new__',
        title: '',
        startUtc: start.toISOString(),
        endUtc: end.toISOString(),
        isAllDay: false,
        calendarId: calendars[0]?.id ?? '',
        userId: '',
        color: DEFAULT_COLOR,
      },
    })
    closeCreateMenu()
  }

  function handleTask() {
    openDetailPanel({
      kind: 'task',
      data: {
        id: '__new_task__',
        title: '',
        dueUtc: null,
        completed: false,
        userId: '',
        color: DEFAULT_COLOR,
      },
    })
    closeCreateMenu()
  }

  return (
    <AnimatePresence>
      {createMenuOpen && pos && (
        <>
          {/* Backdrop — invisible but captures outside clicks */}
          <div
            className="fixed inset-0 z-40"
            onMouseDown={closeCreateMenu}
            aria-hidden="true"
          />
          <motion.div
            ref={ref}
            role="menu"
            aria-label="Create new"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="fixed z-50 bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-xl border border-gray-200 dark:border-[#3d3d3d] p-2 w-[280px]"
            style={{ left: pos.left, top: pos.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-medium">
              Create
            </div>
            <button
              id="create-event-btn"
              role="menuitem"
              onClick={handleEvent}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#e8f0fe] dark:hover:bg-[#3d3d3d] transition-colors text-left min-h-[48px] focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#3d3d3d]"
            >
              <span className="w-9 h-9 rounded-full bg-[#e8f0fe] dark:bg-[#3d3d3d] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#1a73e8] dark:text-[#8ab4f8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                  Event
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Schedule a time on your calendar
                </span>
              </span>
            </button>
            <button
              id="create-task-btn"
              role="menuitem"
              onClick={handleTask}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#e8f0fe] dark:hover:bg-[#3d3d3d] transition-colors text-left min-h-[48px] focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#3d3d3d]"
            >
              <span className="w-9 h-9 rounded-full bg-[#e8f0fe] dark:bg-[#3d3d3d] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#1a73e8] dark:text-[#8ab4f8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                  Task
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Add a to-do with an optional due date
                </span>
              </span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
