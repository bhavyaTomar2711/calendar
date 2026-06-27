'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, addHours, addDays, isToday, isTomorrow, startOfDay, isBefore } from 'date-fns'
import { useCalendarStore, type CalendarItem } from '@/lib/store/calendarStore'
import { toUserTz, fromUserTz } from '@/lib/utils/dates'
import { GOOGLE_COLORS, DEFAULT_COLOR } from '@/lib/constants'
import { RECURRENCE_PRESETS } from '@/lib/utils/recurrence'
import CustomSelect from '@/components/ui/CustomSelect'

// Per-modal draft key (was colliding with QuickEventModal).
const DRAFT_KEY = 'gcal_detail_draft'

interface EventDetailPanelProps {
  onEventSaved: () => void
}

type EditScope = 'this' | 'following' | 'all'

type DueSelection =
  | { kind: 'preset'; value: 'today' | 'tomorrow' | 'yesterday'; time: string }
  | { kind: 'picked'; iso: string; time: string } // yyyy-MM-dd + HH:mm
  | { kind: 'none' }

// Default time for new tasks: current time, snapped to the next 15-minute
// boundary so it lands cleanly on the grid. Falls back to 09:00 if anything
// goes wrong reading the clock.
function getDefaultTaskTime(): string {
  const now = new Date()
  const minutes = now.getMinutes()
  const snapped = Math.ceil(minutes / 15) * 15
  const h = now.getHours() + Math.floor(snapped / 60)
  const m = snapped % 60
  const hh = String(Math.min(h, 23)).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

function dueSelectionToValue(s: DueSelection): string {
  if (s.kind === 'preset') return s.value
  if (s.kind === 'none') return 'none'
  return `picked:${s.iso}`
}
function dueValueToSelection(v: string, prev?: DueSelection): DueSelection {
  const time = prev && 'time' in prev ? prev.time : getDefaultTaskTime()
  if (v === 'today' || v === 'tomorrow' || v === 'yesterday') return { kind: 'preset', value: v, time }
  if (v === 'none') return { kind: 'none' }
  if (v.startsWith('picked:')) return { kind: 'picked', iso: v.slice(7), time }
  return { kind: 'preset', value: 'today', time }
}

export default function EventDetailPanel({ onEventSaved }: EventDetailPanelProps) {
  const {
    detailPanelOpen,
    selectedItem,
    setSelectedItem,
    closeDetailPanel,
    calendars,
    userTimezone,
    updateEvent,
    deleteEvent,
    addEvent,
    addTask,
    updateTask,
    deleteTask,
  } = useCalendarStore()

  const tz = userTimezone
  const isNewEvent = selectedItem?.kind === 'event' && selectedItem.data.id === '__new__'
  const isNewTask = selectedItem?.kind === 'task' && selectedItem.data.id === '__new_task__'
  const isExistingEvent = selectedItem?.kind === 'event' && !isNewEvent
  const isExistingTask = selectedItem?.kind === 'task' && !isNewTask

  // ── Event form state ────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startStr, setStartStr] = useState('')
  const [endStr, setEndStr] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [calendarId, setCalendarId] = useState('')
  const [recurrenceRule, setRecurrenceRule] = useState('')

  // ── Task form state ─────────────────────────────────────────────────
  const [taskDue, setTaskDue] = useState<DueSelection>({ kind: 'preset', value: 'today', time: getDefaultTaskTime() })
  const [taskCompleted, setTaskCompleted] = useState(false)
  const [showTaskDatePicker, setShowTaskDatePicker] = useState(false)

  // ── Shared UI state ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [scopeDialog, setScopeDialog] = useState<'edit' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Populate the right form based on selectedItem kind
  useEffect(() => {
    if (!selectedItem) return
    setError(null)
    setConfirmDelete(false)
    setShowTaskDatePicker(false)

    if (selectedItem.kind === 'event') {
      const ev = selectedItem.data
      setTitle((ev.title as string) ?? '')
      setDescription((ev.description as string | null) ?? '')
      setLocation((ev.location as string | null) ?? '')
      setColor((ev.color as string | null) ?? DEFAULT_COLOR)
      setCalendarId((ev.calendarId as string) ?? calendars[0]?.id ?? '')
      setRecurrenceRule((ev.recurrenceRule as string | null) ?? '')
      setIsAllDay(!!ev.isAllDay)

      const start = toUserTz(new Date(ev.startUtc as string), tz)
      const end = toUserTz(new Date(ev.endUtc as string), tz)
      setStartStr(format(start, "yyyy-MM-dd'T'HH:mm"))
      setEndStr(format(end, "yyyy-MM-dd'T'HH:mm"))
    } else if (!isNewTask) {
      // Existing task — populate from data.
      const t = selectedItem.data
      setTitle((t.title as string) ?? '')
      setDescription((t.description as string | null) ?? '')
      setColor((t.color as string | null) ?? DEFAULT_COLOR)
      setTaskCompleted(!!t.completed)

      if (!t.dueUtc) {
        // Existing task with no due date — preserve "No date".
        setTaskDue({ kind: 'none' })
      } else {
        const due = new Date(t.dueUtc as string)
        const today = startOfDay(new Date())
        const d = startOfDay(due)
        // Convert UTC to user TZ to derive the local HH:mm
        const local = toUserTz(due, tz)
        const hh = String(local.getHours()).padStart(2, '0')
        const mm = String(local.getMinutes()).padStart(2, '0')
        const time = `${hh}:${mm}`
        if (isSameDayLocal(d, today)) setTaskDue({ kind: 'preset', value: 'today', time })
        else if (isSameDayLocal(d, addDays(today, 1))) setTaskDue({ kind: 'preset', value: 'tomorrow', time })
        else if (isSameDayLocal(d, addDays(today, -1))) setTaskDue({ kind: 'preset', value: 'yesterday', time })
        else setTaskDue({ kind: 'picked', iso: format(d, 'yyyy-MM-dd'), time })
      }
    }
  }, [selectedItem, tz, calendars])

  // Save draft while editing
  useEffect(() => {
    if (detailPanelOpen && title) {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ title, description, location })
        )
      } catch { /* quota */ }
    }
  }, [detailPanelOpen, title, description, location])

  // Escape closes the panel (or dismisses scope dialog first)
  useEffect(() => {
    if (!detailPanelOpen && !scopeDialog && !confirmDelete) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (scopeDialog) setScopeDialog(null)
        else if (confirmDelete) setConfirmDelete(false)
        else closeDetailPanel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [detailPanelOpen, scopeDialog, confirmDelete, closeDetailPanel])

  // ── Save handlers ──────────────────────────────────────────────────
  const handleSaveEvent = useCallback(
    async (scope?: EditScope) => {
      if (!selectedItem || selectedItem.kind !== 'event') return
      setSaving(true)
      setError(null)

      const startLocal = new Date(startStr)
      const endLocal = new Date(endStr)
      if (isNaN(startLocal.getTime()) || isNaN(endLocal.getTime())) {
        setError('Invalid date.')
        setSaving(false)
        return
      }
      if (startLocal >= endLocal) {
        setError('End time must be after start time.')
        setSaving(false)
        return
      }

      const startUtc = fromUserTz(startLocal, tz).toISOString()
      const endUtc = fromUserTz(endLocal, tz).toISOString()
      const payload = {
        title: title.trim(),
        description,
        location,
        startUtc,
        endUtc,
        isAllDay,
        color,
        calendarId,
        recurrenceRule: recurrenceRule || null,
        scope,
      }

      try {
        if (isNewEvent) {
          const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          addEvent(data.event)
        } else {
          const res = await fetch(`/api/events/${selectedItem.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          updateEvent(selectedItem.data.id as string, {
            title: payload.title,
            description: payload.description ?? undefined,
            location: payload.location ?? undefined,
            startUtc,
            endUtc,
            isAllDay,
            color,
            calendarId,
            recurrenceRule: recurrenceRule || null,
          })
        }
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
        closeDetailPanel()
        onEventSaved()
      } catch (err) {
        console.error('Save error:', err)
        setError('Could not save. Please try again.')
      } finally {
        setSaving(false)
        setScopeDialog(null)
      }
    },
    [
      selectedItem, startStr, endStr, isNewEvent, isAllDay, title, description,
      location, color, calendarId, recurrenceRule, tz, addEvent, updateEvent,
      closeDetailPanel, onEventSaved,
    ]
  )

  const handleSaveTask = useCallback(async () => {
    if (!selectedItem || selectedItem.kind !== 'task') return
    setSaving(true)
    setError(null)

    const dueIso = taskDueToIso(taskDue, tz)
    const payload = {
      title: title.trim(),
      description,
      color,
      completed: taskCompleted,
    }

    try {
      if (isNewTask) {
        const body: Record<string, unknown> = { ...payload }
        if (dueIso) body.dueUtc = dueIso
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        addTask(data)
      } else {
        const body: Record<string, unknown> = { ...payload }
        body.dueUtc = dueIso // null unschedules
        const res = await fetch(`/api/tasks/${selectedItem.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const updated = await res.json()
        updateTask(selectedItem.data.id as string, updated)
      }
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
      closeDetailPanel()
      onEventSaved()
    } catch (err) {
      console.error('Save task error:', err)
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [
    selectedItem, taskDue, taskCompleted, title, description, color, tz,
    isNewTask, addTask, updateTask, closeDetailPanel, onEventSaved,
  ])

  const handleSave = useCallback(async () => {
    if (!selectedItem) return
    if (selectedItem.kind === 'event') {
      // Recurring events need a scope; only existing events can be recurring
      const isRecurring =
        !!(selectedItem.data.recurrenceRule || selectedItem.data.recurrenceId)
      if (isExistingEvent && isRecurring) {
        setScopeDialog('edit')
        return
      }
      handleSaveEvent()
    } else {
      handleSaveTask()
    }
  }, [selectedItem, isExistingEvent, handleSaveEvent, handleSaveTask])

    const handleDeleteEvent = useCallback(
    async (scope: EditScope) => {
      if (!selectedItem || selectedItem.kind !== 'event' || isNewEvent) return
      setDeleting(true)
      setError(null)
      try {
        // Expansion ids look like `${parentId}_${isoDate}`. They reference a
        // virtual occurrence, not a real DB row — strip the trailing date
        // so the API call hits the parent.
        const rawId = selectedItem.data.id as string
        const underscoreIdx = rawId.lastIndexOf('_')
        let parentId = rawId
        let occStart: string | null = null
        if (underscoreIdx > 0) {
          const tail = rawId.slice(underscoreIdx + 1)
          if (/^\d{4}-\d{2}-\d{2}T/.test(tail)) {
            parentId = rawId.slice(0, underscoreIdx)
            occStart = tail
          }
        }

        const url = occStart
          ? `/api/events/${parentId}?scope=${scope}&occStart=${encodeURIComponent(occStart)}`
          : `/api/events/${parentId}?scope=${scope}`

        const res = await fetch(url, { method: 'DELETE' })
        // 404 means the row is already gone — treat as success so the
        // local store still gets cleaned up.
        if (!res.ok && res.status !== 404) {
          throw new Error(`HTTP ${res.status}`)
        }
        deleteEvent(rawId)
        closeDetailPanel()
        onEventSaved()
      } catch (err) {
        console.error('Delete error:', err)
        setError('Could not delete. Please try again.')
      } finally {
        setDeleting(false)
        setScopeDialog(null)
        setConfirmDelete(false)
      }
    },
    [selectedItem, isNewEvent, deleteEvent, closeDetailPanel, onEventSaved]
  )

  const handleDeleteTask = useCallback(async () => {
    if (!selectedItem || selectedItem.kind !== 'task' || isNewTask) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${selectedItem.data.id}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`)
      }
      deleteTask(selectedItem.data.id as string)
      closeDetailPanel()
      onEventSaved()
    } catch (err) {
      console.error('Delete task error:', err)
      setError('Could not delete. Please try again.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }, [selectedItem, isNewTask, deleteTask, closeDetailPanel, onEventSaved])

  const handleDelete = useCallback(() => {
    if (!selectedItem) return
    if (selectedItem.kind === 'event') {
      const isRecurring =
        !!(selectedItem.data.recurrenceRule || selectedItem.data.recurrenceId)
      if (isExistingEvent && isRecurring) {
        setScopeDialog('delete')
      } else {
        setConfirmDelete(true)
      }
    } else {
      setConfirmDelete(true)
    }
  }, [selectedItem, isExistingEvent])

  // ── Kind conversion (Event ↔ Task) ─────────────────────────────────
  const handleConvert = useCallback(
    async (target: 'event' | 'task') => {
      if (!selectedItem || converting) return
      setConverting(true)
      setError(null)
      try {
        // Unsaved stubs (`__new__` / `__new_task__`) are not yet on the
        // server, so we just swap the kind in-place — no POST/DELETE needed.
        const isStub =
          selectedItem.data.id === '__new__' ||
          selectedItem.data.id === '__new_task__'
        if (isStub) {
          const stub: CalendarItem =
            target === 'task'
              ? {
                  kind: 'task',
                  data: {
                    id: '__new_task__',
                    title: (selectedItem.data.title as string) ?? '',
                    description: (selectedItem.data.description as string | null) ?? null,
                    color: (selectedItem.data.color as string | null) ?? null,
                    dueUtc: null,
                    completed: false,
                    userId: '',
                  },
                }
              : {
                  kind: 'event',
                  data: {
                    id: '__new__',
                    title: (selectedItem.data.title as string) ?? '',
                    description: (selectedItem.data.description as string | null) ?? null,
                    color: (selectedItem.data.color as string | null) ?? null,
                    startUtc: (selectedItem.data.startUtc as string | undefined) ?? new Date().toISOString(),
                    endUtc: (selectedItem.data.endUtc as string | undefined) ?? new Date().toISOString(),
                    isAllDay: false,
                    calendarId: (selectedItem.data.calendarId as string | undefined) ?? calendars[0]?.id ?? '',
                    userId: '',
                  },
                }
          setSelectedItem(stub)
          return
        }

        if (selectedItem.kind === 'event' && target === 'task') {
          // Event → Task: POST a new task carrying over title/description/color
          // and the event's startUtc as the due date. Then DELETE the event.
          const dueIso = selectedItem.data.startUtc
            ? format(toUserTz(new Date(selectedItem.data.startUtc as string), tz), 'yyyy-MM-dd') +
              'T00:00:00.000Z'
            : null
          const taskRes = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: (selectedItem.data.title as string) || '',
              description: (selectedItem.data.description as string | null) ?? null,
              color: (selectedItem.data.color as string | null) ?? null,
              dueUtc: dueIso,
              completed: false,
            }),
          })
          if (!taskRes.ok) throw new Error(`task create failed: HTTP ${taskRes.status}`)
          const newTask = await taskRes.json()
          addTask(newTask)
          // scope=all handles recurring parents + their exceptions
          const delRes = await fetch(
            `/api/events/${selectedItem.data.id}?scope=all`,
            { method: 'DELETE' }
          )
          // 404 = already gone; that's fine — the new task still got created
          if (!delRes.ok && delRes.status !== 404) {
            console.error('Event delete failed after task create')
          }
          deleteEvent(selectedItem.data.id as string)
        } else if (selectedItem.kind === 'task' && target === 'event') {
          // Task → Event: default 09:00–10:00 on the task's dueUtc date (today if none)
          const baseDate = selectedItem.data.dueUtc
            ? new Date(selectedItem.data.dueUtc as string)
            : startOfDay(new Date())
          const localStart = new Date(baseDate)
          localStart.setHours(9, 0, 0, 0)
          const localEnd = new Date(baseDate)
          localEnd.setHours(10, 0, 0, 0)
          const startUtc = fromUserTz(localStart, tz).toISOString()
          const endUtc = fromUserTz(localEnd, tz).toISOString()
          const eventRes = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: (selectedItem.data.title as string) || '',
              description: (selectedItem.data.description as string | null) ?? null,
              startUtc,
              endUtc,
              isAllDay: false,
              color: (selectedItem.data.color as string | null) ?? null,
              calendarId: calendars[0]?.id ?? '',
            }),
          })
          if (!eventRes.ok) throw new Error(`event create failed: HTTP ${eventRes.status}`)
          const data = await eventRes.json()
          addEvent(data.event)
          const delRes = await fetch(`/api/tasks/${selectedItem.data.id}`, {
            method: 'DELETE',
          })
          // 404 = already gone; that's fine
          if (!delRes.ok && delRes.status !== 404) {
            console.error('Task delete failed after event create')
          }
          deleteTask(selectedItem.data.id as string)
        }
        closeDetailPanel()
        onEventSaved()
      } catch (err) {
        console.error('Convert error:', err)
        setError('Could not convert. Please try again.')
      } finally {
        setConverting(false)
      }
    },
    [
      selectedItem, converting, tz, calendars, addTask, addEvent,
      deleteEvent, deleteTask, setSelectedItem, closeDetailPanel, onEventSaved,
    ]
  )

  // ── Derived labels for the task date row ───────────────────────────
  const taskDateLabel = useMemo(() => {
    if (taskDue.kind === 'none') return 'No date'
    if (taskDue.kind === 'preset') {
      if (taskDue.value === 'today') return 'Today'
      if (taskDue.value === 'tomorrow') return 'Tomorrow'
      return 'Yesterday'
    }
    // picked
    const d = new Date(taskDue.iso + 'T00:00:00')
    return format(d, 'EEE, MMM d')
  }, [taskDue])

  const taskDateValue = dueSelectionToValue(taskDue)
  const taskDateOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [
      { label: 'Today', value: 'today' },
      { label: 'Tomorrow', value: 'tomorrow' },
      { label: 'Yesterday', value: 'yesterday' },
      { label: 'No date', value: 'none' },
    ]
    // If a non-preset date is currently picked, surface it as a custom option
    if (taskDue.kind === 'picked') {
      opts.push({ label: format(new Date(taskDue.iso + 'T00:00:00'), 'EEE, MMM d'), value: `picked:${taskDue.iso}` })
    }
    return opts
  }, [taskDue])

  if (!selectedItem) return null

  const isEvent = selectedItem.kind === 'event'

  return (
    <>
      <AnimatePresence>
        {detailPanelOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              isNewEvent ? 'Create event'
                : isNewTask ? 'Create task'
                  : isEvent ? 'Edit event'
                    : 'Edit task'
            }
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 h-full w-[400px] bg-white dark:bg-[#2d2d2d] shadow-2xl border-l border-gray-200 dark:border-[#3d3d3d] z-50 flex flex-col overflow-hidden"
          >
            {/* Toolbar — 44x44 hit targets */}
            <div className="flex items-center justify-between px-2 py-2 border-b border-gray-200 dark:border-[#3d3d3d] shrink-0">
              <button
                id="detail-close-btn"
                onClick={closeDetailPanel}
                aria-label="Close"
                className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#3d3d3d] text-gray-500 dark:text-gray-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {(isExistingEvent || isExistingTask) && (
                <button
                  id="detail-delete-btn"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label={isEvent ? 'Delete event' : 'Delete task'}
                  title="Delete"
                  className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#3d3d3d] text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            {/* Pill toggle — switch kind in-flight */}
            <div className="px-6 pt-4 shrink-0">
              <div
                role="tablist"
                aria-label="Item type"
                className="inline-flex rounded-full bg-gray-100 dark:bg-[#1f1f1f] p-1"
              >
                <button
                  id="kind-event-btn"
                  role="tab"
                  aria-selected={isEvent}
                  onClick={() => !isEvent && handleConvert('event')}
                  disabled={converting}
                  title="Switch to event"
                  className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${
                    isEvent
                      ? 'bg-[#1a73e8] text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                  }`}
                >
                  Event
                </button>
                <button
                  id="kind-task-btn"
                  role="tab"
                  aria-selected={!isEvent}
                  onClick={() => isEvent && handleConvert('task')}
                  disabled={converting}
                  title="Switch to task"
                  className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${
                    !isEvent
                      ? 'bg-[#1a73e8] text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                  }`}
                >
                  Task
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {isEvent ? (
                /* ── EVENT FORM ─────────────────────────────────── */
                <>
                  {/* Color dot + Title */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-4 h-4 rounded-sm mt-2 shrink-0"
                      style={{ backgroundColor: color }}
                      title="Event color"
                      aria-hidden="true"
                    />
                    <textarea
                      id="detail-title-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Add title"
                      rows={1}
                      aria-label="Event title"
                      className="flex-1 text-xl font-normal outline-none border-b-2 border-[#1a73e8] bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none py-1 focus:border-[#1557b0]"
                    />
                  </div>

                  {/* Date/time */}
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div className="flex-1 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isAllDay}
                          onChange={(e) => setIsAllDay(e.target.checked)}
                          className="rounded w-4 h-4"
                        />
                        All day
                      </label>
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <input
                          id="detail-start-input"
                          type={isAllDay ? 'date' : 'datetime-local'}
                          value={isAllDay ? startStr.split('T')[0] : startStr}
                          onChange={(e) => setStartStr(isAllDay ? `${e.target.value}T00:00` : e.target.value)}
                          aria-label="Start date and time"
                          className="border border-gray-300 dark:border-[#5f6368] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-[#3d3d3d] text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#1a73e8] outline-none"
                        />
                        <span className="text-gray-400" aria-hidden="true">→</span>
                        <input
                          id="detail-end-input"
                          type={isAllDay ? 'date' : 'datetime-local'}
                          value={isAllDay ? endStr.split('T')[0] : endStr}
                          onChange={(e) => setEndStr(isAllDay ? `${e.target.value}T00:00` : e.target.value)}
                          aria-label="End date and time"
                          className="border border-gray-300 dark:border-[#5f6368] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-[#3d3d3d] text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#1a73e8] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recurrence */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <CustomSelect
                      id="detail-recurrence-select"
                      value={recurrenceRule}
                      onChange={setRecurrenceRule}
                      options={RECURRENCE_PRESETS.map((p) => ({ label: p.label, value: p.value }))}
                      ariaLabel="Recurrence"
                    />
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <input
                      id="detail-location-input"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Add location"
                      aria-label="Location"
                      className="flex-1 border-b border-gray-200 dark:border-[#5f6368] outline-none text-sm text-gray-700 dark:text-gray-200 bg-transparent placeholder-gray-400 dark:placeholder-gray-500 py-1 focus:border-[#1a73e8]"
                    />
                  </div>

                  {/* Description */}
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <textarea
                      id="detail-description-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add description"
                      rows={3}
                      aria-label="Description"
                      className="flex-1 border-b border-gray-200 dark:border-[#5f6368] outline-none text-sm text-gray-700 dark:text-gray-200 bg-transparent placeholder-gray-400 dark:placeholder-gray-500 py-1 resize-none focus:border-[#1a73e8]"
                    />
                  </div>

                  {/* Calendar picker */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <CustomSelect
                      id="detail-calendar-select"
                      value={calendarId}
                      onChange={setCalendarId}
                      options={calendars.map((c) => ({
                        label: c.name,
                        value: c.id,
                        swatch: c.color,
                      }))}
                      ariaLabel="Calendar"
                    />
                  </div>

                  {/* Event color */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event color">
                      {GOOGLE_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          title={c.name}
                          role="radio"
                          aria-checked={color === c.hex}
                          aria-label={c.name}
                          onClick={() => setColor(c.hex)}
                          className="w-9 h-9 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a73e8] dark:focus:ring-offset-[#2d2d2d]"
                          style={{
                            backgroundColor: c.hex,
                            outline: color === c.hex ? `3px solid ${c.hex}` : 'none',
                            outlineOffset: color === c.hex ? '2px' : '0',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* ── TASK FORM ───────────────────────────────────── */
                <>
                  {/* Checkbox + Title (large, single row like the reference) */}
                  <div className="flex items-start gap-3">
                    <button
                      id="task-complete-btn"
                      onClick={() => setTaskCompleted((c) => !c)}
                      aria-label={taskCompleted ? 'Mark task incomplete' : 'Mark task complete'}
                      aria-pressed={taskCompleted}
                      className={`mt-2 w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${
                        taskCompleted
                          ? 'bg-[#1a73e8] border-[#1a73e8]'
                          : 'border-[#5f6368] dark:border-[#9aa0a6] hover:border-[#1a73e8]'
                      }`}
                    >
                      {taskCompleted && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <textarea
                      id="detail-title-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Add a task"
                      rows={1}
                      aria-label="Task title"
                      className={`flex-1 text-xl font-normal outline-none border-b-2 border-[#1a73e8] bg-transparent placeholder-gray-400 dark:placeholder-gray-500 resize-none py-1 focus:border-[#1557b0] ${
                        taskCompleted
                          ? 'text-gray-400 dark:text-gray-500 line-through'
                          : 'text-gray-800 dark:text-gray-100'
                      }`}
                    />
                  </div>

                  {/* Mark as complete pill — visible only for existing tasks */}
                  {isExistingTask && (
                    <div className="flex items-center gap-3">
                      {/* Spacer to align with the icon column above */}
                      <span className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <button
                        id="task-mark-complete-pill"
                        type="button"
                        onClick={() => setTaskCompleted((c) => !c)}
                        aria-pressed={taskCompleted}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${
                          taskCompleted
                            ? 'bg-[#e8f0fe] dark:bg-[#1f3a5f] text-[#1a73e8] dark:text-[#8ab4f8] hover:bg-[#d2e3fc] dark:hover:bg-[#264773]'
                            : 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
                        }`}
                      >
                        <svg
                          className="w-4 h-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {taskCompleted ? 'Completed' : 'Mark as complete'}
                      </button>
                    </div>
                  )}

                  {/* Date row */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        {taskDateLabel}
                      </span>
                      <CustomSelect
                        id="detail-task-date-select"
                        value={taskDateValue}
                        onChange={(v) => setTaskDue(dueValueToSelection(v))}
                        options={taskDateOptions}
                        ariaLabel="Task due date"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTaskDatePicker((s) => !s)}
                        className="text-xs text-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#3d3d3d] px-2 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] min-h-[32px]"
                      >
                        {showTaskDatePicker ? 'Close' : 'Pick a date…'}
                      </button>
                      {showTaskDatePicker && (
                        <input
                          type="date"
                          aria-label="Pick a specific date"
                          value={taskDue.kind === 'picked' ? taskDue.iso : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              setTaskDue({ kind: 'picked', iso: e.target.value, time: 'time' in taskDue ? taskDue.time : getDefaultTaskTime() })
                              setShowTaskDatePicker(false)
                            }
                          }}
                          className="border border-gray-300 dark:border-[#5f6368] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-[#3d3d3d] text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#1a73e8] outline-none"
                        />
                      )}
                      {taskDue.kind !== 'none' && (
                        <input
                          type="time"
                          aria-label="Task time"
                          value={taskDue.time}
                          onChange={(e) => {
                            const t = e.target.value || getDefaultTaskTime()
                            if (taskDue.kind === 'preset') setTaskDue({ ...taskDue, time: t })
                            else if (taskDue.kind === 'picked') setTaskDue({ ...taskDue, time: t })
                          }}
                          className="border border-gray-300 dark:border-[#5f6368] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-[#3d3d3d] text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#1a73e8] outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <textarea
                      id="detail-description-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add description"
                      rows={3}
                      aria-label="Description"
                      className="flex-1 border-b border-gray-200 dark:border-[#5f6368] outline-none text-sm text-gray-700 dark:text-gray-200 bg-transparent placeholder-gray-400 dark:placeholder-gray-500 py-1 resize-none focus:border-[#1a73e8]"
                    />
                  </div>

                  {/* Task color */}
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Task color">
                      {GOOGLE_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          title={c.name}
                          role="radio"
                          aria-checked={color === c.hex}
                          aria-label={c.name}
                          onClick={() => setColor(c.hex)}
                          className="w-9 h-9 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a73e8] dark:focus:ring-offset-[#2d2d2d]"
                          style={{
                            backgroundColor: c.hex,
                            outline: color === c.hex ? `3px solid ${c.hex}` : 'none',
                            outlineOffset: color === c.hex ? '2px' : '0',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Inline error */}
              {error && (
                <div role="alert" className="text-sm text-[#d50000]">
                  {error}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#3d3d3d] shrink-0">
              <button
                id="detail-cancel-btn"
                onClick={closeDetailPanel}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors min-h-[36px]"
              >
                Cancel
              </button>
              <button
                id="detail-save-btn"
                onClick={handleSave}
                disabled={saving || converting || !title.trim()}
                className="px-5 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
              >
                {saving || converting
                  ? 'Saving…'
                  : (isNewEvent || isNewTask)
                    ? 'Create'
                    : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single-item delete confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-[60]"
              onClick={() => setConfirmDelete(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl p-6 w-80"
            >
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
                {isEvent ? 'Delete event?' : 'Delete task?'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {isEvent
                  ? 'This event will be removed. This can’t be undone.'
                  : 'This task will be removed. This can’t be undone.'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors min-h-[36px]"
                >
                  Cancel
                </button>
                <button
                  onClick={isEvent ? () => handleDeleteEvent('this') : handleDeleteTask}
                  disabled={deleting}
                  className="px-4 py-2 bg-[#d50000] hover:bg-[#b71c1c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Recurring-event scope dialog */}
      <AnimatePresence>
        {scopeDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-[60]"
              onClick={() => setScopeDialog(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={scopeDialog === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl p-6 w-80"
            >
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
                {scopeDialog === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {scopeDialog === 'edit'
                  ? 'Which events do you want to change?'
                  : 'Which events do you want to delete?'}
              </p>
              <div className="space-y-2">
                {(['this', 'following', 'all'] as EditScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      scopeDialog === 'edit' ? handleSaveEvent(s) : handleDeleteEvent(s)
                    }
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[#3d3d3d] text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#5f6368] transition-colors min-h-[44px]"
                  >
                    {s === 'this' && 'This event'}
                    {s === 'following' && 'This and following events'}
                    {s === 'all' && 'All events in series'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setScopeDialog(null)}
                className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 min-h-[36px] py-2"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ── helpers (module-scoped) ──────────────────────────────────────────

function isSameDayLocal(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/** Resolve a DueSelection to an ISO UTC string (yyyy-MM-ddT00:00:00.000Z) or null. */
function taskDueToIso(s: DueSelection, tz: string): string | null {
  if (s.kind === 'none') return null
  const today = startOfDay(new Date())
  let baseDate: Date
  if (s.kind === 'preset') {
    if (s.value === 'today') baseDate = today
    else if (s.value === 'tomorrow') baseDate = addDays(today, 1)
    else baseDate = addDays(today, -1)
  } else {
    baseDate = new Date(s.iso + 'T00:00:00')
  }
  // Apply the chosen HH:mm in user TZ, then convert to UTC.
  const [hh, mm] = (s.time || getDefaultTaskTime()).split(':').map((n) => parseInt(n, 10))
  const local = new Date(baseDate)
  local.setHours(hh || 9, mm || 0, 0, 0)
  return fromUserTz(local, tz).toISOString()
}
