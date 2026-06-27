'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, isToday, isTomorrow, isThisYear } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useCalendarStore, type CalendarEvent, asCalendarItem } from '@/lib/store/calendarStore'

export default function SearchBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const openDetailPanel = useCalendarStore((s) => s.openDetailPanel)
  const setCurrentDate = useCalendarStore((s) => s.setCurrentDate)
  const calendars = useCalendarStore((s) => s.calendars)

  // Focus input when opening
  useEffect(() => {
    if (open) {
      // Defer to next tick so the input is in the DOM
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setQuery('')
      setResults([])
      setActiveIndex(0)
    }
  }, [open])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const runSearch = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort()
    if (!q.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(
        `/api/events?q=${encodeURIComponent(q.trim())}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error('search failed')
      const data: CalendarEvent[] = await res.json()
      setResults(data)
      setActiveIndex(0)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Search failed:', err)
        setResults([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => runSearch(query), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  function handleSelect(event: CalendarEvent) {
    // Navigate to the event's date and open its detail panel
    setCurrentDate(new Date(event.startUtc))
    openDetailPanel(asCalendarItem('event', event as unknown as Record<string, unknown>))
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[activeIndex]
      if (target) handleSelect(target)
    }
  }

  function formatEventDate(iso: string): string {
    const d = new Date(iso)
    if (isToday(d)) return `Today · ${format(d, 'h:mm a')}`
    if (isTomorrow(d)) return `Tomorrow · ${format(d, 'h:mm a')}`
    if (isThisYear(d)) return format(d, 'EEE, MMM d · h:mm a')
    return format(d, 'MMM d, yyyy · h:mm a')
  }

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-transparent text-[#1a73e8] font-semibold">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button (matches existing header button style) */}
      <button
        id="search-btn"
        onClick={() => setOpen((o) => !o)}
        className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-[#3d3d3d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
        aria-label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          className="w-[22px] h-[22px] text-[#202124] dark:text-gray-100"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute right-0 top-12 w-[420px] bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-2xl shadow-2xl z-50 overflow-hidden"
            role="dialog"
            aria-label="Search events"
          >
            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-[#3d3d3d]">
              <svg
                className="w-4 h-4 text-gray-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                id="search-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search events"
                className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400"
                autoComplete="off"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <kbd className="hidden sm:inline-block text-[10px] font-medium text-gray-400 border border-gray-200 dark:border-[#3d3d3d] rounded px-1.5 py-0.5">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[420px] overflow-y-auto">
              {!query.trim() && (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Type to search across event titles, descriptions, and locations.
                </div>
              )}

              {query.trim() && loading && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Searching…
                </div>
              )}

              {query.trim() && !loading && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No events match &ldquo;{query}&rdquo;.
                </div>
              )}

              {results.length > 0 && (() => {
                // Build a local lookup at render time — no effect deps, no loop.
                const calById = new Map(calendars.map((c) => [c.id, c]))
                return (
                <ul className="py-1">
                  {results.map((event, idx) => {
                    const cal = calById.get(event.calendarId)
                    return (
                    <li key={event.id}>
                      <button
                        onClick={() => handleSelect(event)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                          idx === activeIndex
                            ? 'bg-[#e8f0fe] dark:bg-[#3d3d3d]'
                            : 'hover:bg-gray-50 dark:hover:bg-[#353535]'
                        }`}
                      >
                        <div
                          className="w-1 self-stretch rounded-full shrink-0"
                          style={{
                            backgroundColor: event.color ?? cal?.color ?? '#1a73e8',
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                            {highlightMatch(event.title, query)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatEventDate(event.startUtc)}
                          </div>
                          {event.location && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              📍 {highlightMatch(event.location, query)}
                            </div>
                          )}
                          {cal?.name && (
                            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 truncate">
                              {cal.name}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                    )
                  })}
                </ul>
                )
              })()}
            </div>

            {/* Footer hint */}
            {results.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-[#3d3d3d] text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="text-[10px] border border-gray-200 dark:border-[#3d3d3d] rounded px-1 py-0.5">↑</kbd>
                  <kbd className="text-[10px] border border-gray-200 dark:border-[#3d3d3d] rounded px-1 py-0.5">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="text-[10px] border border-gray-200 dark:border-[#3d3d3d] rounded px-1 py-0.5">↵</kbd>
                  open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="text-[10px] border border-gray-200 dark:border-[#3d3d3d] rounded px-1 py-0.5">Esc</kbd>
                  close
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}