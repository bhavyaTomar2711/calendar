'use client'

import { useState, useEffect, useRef } from 'react'
import { format, addHours } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useCalendarStore, asCalendarItem } from '@/lib/store/calendarStore'
import { fromUserTz } from '@/lib/utils/dates'
import { DEFAULT_COLOR } from '@/lib/constants'

// Per-modal draft key so QuickEventModal and EventDetailPanel don't overwrite each other.
const DRAFT_KEY = 'gcal_quick_draft'

interface QuickEventModalProps {
  onEventSaved: () => void
}

export default function QuickEventModal({ onEventSaved }: QuickEventModalProps) {
  const {
    quickModalOpen,
    quickModalPosition,
    quickModalDate,
    closeQuickModal,
    openDetailPanel,
    calendars,
    userTimezone,
    addEvent,
  } = useCalendarStore()

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tz = userTimezone

  // Pre-fill from draft on open; reset on close
  useEffect(() => {
    if (quickModalOpen) {
      const draft = localStorage.getItem(DRAFT_KEY)
      if (draft) {
        try {
          const parsed = JSON.parse(draft)
          if (parsed.title) setTitle(parsed.title)
        } catch { /* ignore malformed draft */ }
      }
      // Defer focus to next frame so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setOverlapWarning(null)
      setError(null)
    }
  }, [quickModalOpen])

  // Save draft on title change while modal is open
  useEffect(() => {
    if (quickModalOpen && title) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title }))
      } catch { /* quota */ }
    }
  }, [title, quickModalOpen])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    setOverlapWarning(null)

    const defaultCalendar = calendars[0]
    if (!defaultCalendar) {
      setError('No calendar available. Create one first.')
      setSaving(false)
      return
    }

    const baseDate = quickModalDate ?? new Date()
    const startUtc = fromUserTz(baseDate, tz)
    const endUtc = fromUserTz(addHours(baseDate, 1), tz)

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
          calendarId: defaultCalendar.id,
          isAllDay: false,
          color: DEFAULT_COLOR,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      addEvent(data.event)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
      setTitle('')
      closeQuickModal()
      onEventSaved()

      // Show overlap warning inside the calendar area (not native alert).
      if (data.overlapping && Array.isArray(data.conflicts) && data.conflicts.length > 0) {
        const titles = data.conflicts
          .map((c: { title?: string }) => c.title)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')
        setOverlapWarning(titles || 'another event')
      }
    } catch (err) {
      console.error('Failed to save event:', err)
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleMoreOptions() {
    const defaultCalendar = calendars[0]
    if (!defaultCalendar) return
    const baseDate = quickModalDate ?? new Date()
    const startUtc = fromUserTz(baseDate, tz)
    const endUtc = fromUserTz(addHours(baseDate, 1), tz)

    openDetailPanel(
      asCalendarItem('event', {
        id: '__new__',
        title,
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString(),
        calendarId: defaultCalendar.id,
        userId: '',
        isAllDay: false,
        color: DEFAULT_COLOR,
      })
    )
    closeQuickModal()
  }

  if (!quickModalOpen || !quickModalPosition) return null

  // Position modal near click, clamped to viewport (account for scroll offsets).
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 800
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0
  const modalW = 340
  const modalH = 220
  const PAD = 16
  // quickModalPosition already stores viewport-relative coords (clientX/clientY),
  // but subtract scroll in case the store ever captures page coords.
  const left = Math.min(
    Math.max(PAD, quickModalPosition.x - scrollX),
    vpW - modalW - PAD
  )
  const top = Math.min(
    Math.max(PAD, quickModalPosition.y - scrollY),
    vpH - modalH - PAD
  )

  return (
    <>
      {/* Invisible backdrop */}
      <div
        className="fixed inset-0 z-40"
        onMouseDown={closeQuickModal}
        aria-hidden="true"
      />
      <AnimatePresence>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Create event"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-50 bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-xl border border-gray-200 dark:border-[#3d3d3d] p-4 w-[340px]"
          style={{ left, top }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Close button — 44x44 hit target */}
          <div className="flex justify-end -mt-1 -mr-1">
            <button
              onClick={closeQuickModal}
              aria-label="Close"
              className="p-2.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Title input */}
          <label htmlFor="quick-event-title" className="sr-only">
            Event title
          </label>
          <input
            ref={inputRef}
            id="quick-event-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') closeQuickModal()
            }}
            placeholder="Add title"
            className="w-full border-b-2 border-[#1a73e8] outline-none text-lg font-normal text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-400 dark:placeholder-gray-500 pb-1 mb-3 focus:border-[#1557b0]"
          />

          {/* Date/time row */}
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              {quickModalDate
                ? format(quickModalDate, 'EEE, MMMM d · h:mm a')
                : format(new Date(), 'EEE, MMMM d')}
            </span>
          </div>

          {/* Inline feedback (replaces native alert) */}
          {error && (
            <div role="alert" className="text-xs text-[#d50000] mb-2">{error}</div>
          )}
          {overlapWarning && (
            <div role="status" className="text-xs text-[#e67c73] mb-2">
              ⚠ Overlaps with: {overlapWarning}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            <button
              id="quick-more-options-btn"
              onClick={handleMoreOptions}
              className="text-sm text-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#3d3d3d] px-3 py-2 rounded-lg transition-colors min-h-[36px]"
            >
              More options
            </button>
            <button
              id="quick-save-btn"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}