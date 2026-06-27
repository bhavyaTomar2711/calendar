'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { format, isSameDay, isSameMonth } from 'date-fns'
import { useCalendarStore } from '@/lib/store/calendarStore'
import { getMonthGrid, navigateDate } from '@/lib/utils/dates'
import { GOOGLE_COLORS } from '@/lib/constants'
import SidebarEvents from './SidebarEvents'
import TaskListSidebar from './TaskListSidebar'

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface SidebarProps {
  onEventSaved: () => void
}

export default function Sidebar({ onEventSaved }: SidebarProps) {
  const {
    sidebarOpen,
    currentDate,
    setCurrentDate,
    openCreateMenu,
    calendars,
    toggleCalendarVisibility,
    updateCalendar,
    deleteCalendar,
  } = useCalendarStore()

  const [miniMonth, setMiniMonth] = useState(new Date())
  const [hoveredCalId, setHoveredCalId] = useState<string | null>(null)
  const [menuCalId, setMenuCalId] = useState<string | null>(null)
  const [editingCalId, setEditingCalId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [eventsCollapsed, setEventsCollapsed] = useState(false)
  const [calsCollapsed, setCalsCollapsed] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const today = new Date()
  const grid = getMonthGrid(miniMonth)

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingCalId) editInputRef.current?.focus()
  }, [editingCalId])

  // Close menus on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmDeleteId) setConfirmDeleteId(null)
      else if (showColorPicker) setShowColorPicker(null)
      else if (editingCalId) setEditingCalId(null)
      else if (menuCalId) setMenuCalId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuCalId, editingCalId, showColorPicker, confirmDeleteId])

  const handleDayClick = useCallback((day: Date) => {
    setCurrentDate(day)
    setMiniMonth(day)
  }, [setCurrentDate])

  const handleDeleteCalendar = useCallback(async (id: string) => {
    const calRes = await fetch(`/api/calendars/${id}`, {
      method: 'DELETE',
    })
    if (calRes.ok) {
      const data = await calRes.json()
      deleteCalendar(id)
      onEventSaved()
      // Replace alert() with a more contextual experience: keep user in flow,
      // but show a transient toast via the existing global UI patterns. For
      // now we log; production code should route to a toast component.
      console.info(`Calendar deleted (${data.eventsDeleted ?? 0} event(s) removed).`)
    }
    setConfirmDeleteId(null)
  }, [deleteCalendar, onEventSaved])

  const handleEditSave = useCallback(async (id: string) => {
    if (!editName.trim()) return
    const res = await fetch(`/api/calendars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    })
    if (res.ok) {
      const data = await res.json()
      updateCalendar(id, { name: data.name })
    }
    setEditingCalId(null)
    setMenuCalId(null)
  }, [editName, updateCalendar])

  const handleColorChange = useCallback(async (id: string, color: string) => {
    const res = await fetch(`/api/calendars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (res.ok) {
      updateCalendar(id, { color })
    }
    setShowColorPicker(null)
    setMenuCalId(null)
  }, [updateCalendar])

  if (!sidebarOpen) return null

  return (
    <aside className="w-64 shrink-0 bg-[#f8fafd] dark:bg-[#141414] flex flex-col overflow-y-auto">
      {/* Create button — rounded rectangle with a deep drop shadow; no circle on the + */}
      <div className="px-5 pt-8 pb-8">
        <button
          id="create-event-fab"
          onClick={(e) => openCreateMenu((e.currentTarget as HTMLElement).getBoundingClientRect())}
          aria-label="Create event or task"
          className="group flex items-center gap-2.5 bg-white dark:bg-[#2d2d2d] hover:bg-[#f8f9fa] dark:hover:bg-[#353535] rounded-2xl pl-4 pr-5 py-3 text-[15px] font-medium text-[#202124] dark:text-gray-100 shadow-[0_1px_2px_rgba(60,64,67,0.22),0_2px_6px_rgba(60,64,67,0.18),0_6px_14px_rgba(60,64,67,0.14)] hover:shadow-[0_2px_4px_rgba(60,64,67,0.28),0_6px_16px_rgba(60,64,67,0.22)] transition-all focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:ring-offset-2 dark:focus:ring-offset-[#141414] min-h-[48px]"
        >
          {/* Black + icon — sits directly on the button surface, no circle wrapper */}
          <svg className="w-6 h-6 text-[#202124] dark:text-white shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/>
          </svg>
          Create
        </button>
      </div>

      {/* Mini calendar */}
      <div className="px-4 pb-5">
        {/* Mini cal nav */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-base font-semibold text-[#202124] dark:text-gray-100 tracking-tight">
            {format(miniMonth, 'MMMM yyyy')}
          </span>
          <div className="flex gap-0.5">
            <button
              id="mini-prev-btn"
              onClick={() => setMiniMonth(navigateDate(miniMonth, -1, 'month'))}
              aria-label="Previous month"
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2d2d] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            >
              <svg className="w-4 h-4 text-[#70757a] dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              id="mini-next-btn"
              onClick={() => setMiniMonth(navigateDate(miniMonth, 1, 'month'))}
              aria-label="Next month"
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2d2d] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            >
              <svg className="w-4 h-4 text-[#70757a] dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1.5">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={i} className="text-center text-[13px] font-medium text-[#70757a] dark:text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-y-1">
            {week.map((day, di) => {
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, currentDate)
              const isCurrentMonth = isSameMonth(day, miniMonth)
              return (
                <button
                  key={di}
                  onClick={() => handleDayClick(day)}
                  aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                  aria-pressed={isSelected}
                  className={`mini-cal-day mx-auto focus:outline-none focus:ring-2 focus:ring-[#1a73e8]
                    ${isToday ? 'today' : ''}
                    ${isSelected && !isToday ? 'selected' : ''}
                    ${!isCurrentMonth ? 'text-[#dadce0] dark:text-gray-600' : 'text-[#202124] dark:text-gray-200'}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Sidebar events — date-wise list for current month */}
      <SidebarEvents />

      {/* Tasks — collapsible list of incomplete tasks grouped by due date */}
      <TaskListSidebar onTaskSaved={onEventSaved} />

      {/* Subtle spacer (no divider line) */}
      <div className="h-2" />

      {/* My Calendars — header with collapse toggle */}
      <div className="px-3 pb-6">
        <button
          id="my-calendars-toggle"
          onClick={() => setCalsCollapsed((c) => !c)}
          aria-expanded={!calsCollapsed}
          aria-controls="my-calendars-list"
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1f1f1f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
        >
          <span className="text-[16px] font-medium text-[#202124] dark:text-gray-100 tracking-tight">
            My calendars
          </span>
          <svg
            className={`w-4 h-4 text-[#5f6368] dark:text-gray-400 shrink-0 transition-transform duration-200 ${calsCollapsed ? '-rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          id="my-calendars-list"
          className={`overflow-hidden transition-all duration-200 ${calsCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}
        >
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className="relative flex items-center gap-3 px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2d2d] transition-colors group"
            onMouseEnter={() => setHoveredCalId(cal.id)}
            onMouseLeave={() => {
              setHoveredCalId(null)
              if (menuCalId !== cal.id) setMenuCalId(null)
            }}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={cal.visible !== false}
              onChange={() => toggleCalendarVisibility(cal.id)}
              className="w-4 h-4 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
              style={{ accentColor: cal.color }}
              aria-label={`Show ${cal.name}`}
            />
            {/* Color dot */}
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: cal.color }}
              aria-hidden="true"
            />
            {/* Name */}
            {editingCalId === cal.id ? (
              <input
                ref={editInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEditSave(cal.id)
                  if (e.key === 'Escape') setEditingCalId(null)
                }}
                onBlur={() => handleEditSave(cal.id)}
                aria-label="Calendar name"
                className="flex-1 text-xs border-b border-[#1a73e8] outline-none bg-transparent text-[#202124] dark:text-gray-200 px-1"
              />
            ) : (
              <span className="flex-1 text-[15px] text-[#202124] dark:text-gray-200 truncate">
                {cal.name}
              </span>
            )}

            {/* Three-dot menu — 32px hit area (p-2 on a 16px icon) */}
            {hoveredCalId === cal.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuCalId(menuCalId === cal.id ? null : cal.id)
                }}
                aria-label={`Options for ${cal.name}`}
                aria-haspopup="menu"
                aria-expanded={menuCalId === cal.id}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
              >
                <svg className="w-4 h-4 text-[#70757a] dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>
            )}

            {/* Menu popup */}
            {menuCalId === cal.id && (
              <div
                role="menu"
                className="absolute right-0 top-9 w-40 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-xl shadow-lg py-1 z-50"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setEditName(cal.name)
                    setEditingCalId(cal.id)
                    setMenuCalId(null)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[#202124] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d] focus:outline-none focus:bg-gray-50 dark:focus:bg-[#3d3d3d] min-h-[36px]"
                >
                  Edit
                </button>
                <button
                  role="menuitem"
                  onClick={() => setShowColorPicker(cal.id)}
                  className="w-full text-left px-3 py-2 text-sm text-[#202124] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d] focus:outline-none focus:bg-gray-50 dark:focus:bg-[#3d3d3d] min-h-[36px]"
                >
                  Color
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setConfirmDeleteId(cal.id)
                    setMenuCalId(null)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[#d50000] hover:bg-gray-50 dark:hover:bg-[#3d3d3d] focus:outline-none focus:bg-gray-50 dark:focus:bg-[#3d3d3d] min-h-[36px]"
                >
                  Delete
                </button>
              </div>
            )}

            {/* Color picker */}
            {showColorPicker === cal.id && (
              <div
                role="dialog"
                aria-label="Choose calendar color"
                className="absolute right-0 top-9 w-44 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-xl shadow-lg p-3 z-50"
              >
                <p className="text-xs text-[#70757a] dark:text-gray-400 mb-2">Calendar color</p>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {GOOGLE_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      title={c.name}
                      role="radio"
                      aria-checked={cal.color === c.hex}
                      aria-label={c.name}
                      onClick={() => handleColorChange(cal.id, c.hex)}
                      className="w-9 h-9 rounded-full border-2 border-transparent hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a73e8] dark:focus:ring-offset-[#2d2d2d]"
                      style={{
                        backgroundColor: c.hex,
                        outline: cal.color === c.hex ? `3px solid ${c.hex}` : 'none',
                        outlineOffset: cal.color === c.hex ? '2px' : '0',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>

      {/* Close menus overlay (don't catch delete confirm) */}
      {(menuCalId || showColorPicker) && !confirmDeleteId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setMenuCalId(null)
            setShowColorPicker(null)
          }}
        />
      )}

      {/* Inline delete confirmation (replaces native confirm) */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete calendar"
            className="bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl p-6 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              Delete calendar?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              All events in &ldquo;
              {calendars.find((c) => c.id === confirmDeleteId)?.name ?? 'this calendar'}
              &rdquo; will be permanently removed. This can&rsquo;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors min-h-[36px] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCalendar(confirmDeleteId)}
                className="px-4 py-2 bg-[#d50000] hover:bg-[#b71c1c] text-white text-sm font-medium rounded-lg transition-colors min-h-[36px] focus:outline-none focus:ring-2 focus:ring-[#d50000] focus:ring-offset-2 dark:focus:ring-offset-[#2d2d2d]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}