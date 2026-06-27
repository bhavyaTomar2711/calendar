'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, isSameDay, isToday, isTomorrow, isBefore, startOfDay, addDays } from 'date-fns'
import { useCalendarStore, type CalendarTask } from '@/lib/store/calendarStore'

interface TaskListSidebarProps {
  /** Called after any task mutation so the parent can refetch / refresh state. */
  onTaskSaved: () => void
}

type TaskBucket = 'overdue' | 'today' | 'tomorrow' | 'later' | 'nodate'

interface BucketSection {
  key: TaskBucket
  label: string
  items: CalendarTask[]
}

/**
 * Sidebar section showing the current user's tasks grouped by date.
 * Mirrors the visual language of SidebarEvents.tsx so the sidebar reads as
 * one continuous list of "things you have to deal with today / tomorrow".
 */
export default function TaskListSidebar({ onTaskSaved }: TaskListSidebarProps) {
  const { tasks, setTasks, toggleTaskComplete, openDetailPanel } =
    useCalendarStore()
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Initial load + whenever `tasks` length drops to 0 (e.g. delete all).
  // Most updates flow through the store directly so we don't re-fetch.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (tasks.length > 0) return
      setLoading(true)
      try {
        const res = await fetch('/api/tasks?completed=false')
        if (!res.ok) return
        const data: CalendarTask[] = await res.json()
        if (!cancelled) setTasks(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = useMemo(() => startOfDay(new Date()), [])
  const tomorrow = useMemo(() => addDays(today, 1), [today])

  const sections = useMemo<BucketSection[]>(() => {
    const overdue: CalendarTask[] = []
    const todayList: CalendarTask[] = []
    const tomorrowList: CalendarTask[] = []
    const laterList: CalendarTask[] = []
    const noDateList: CalendarTask[] = []

    for (const t of tasks) {
      if (!t.dueUtc) {
        noDateList.push(t)
        continue
      }
      const due = startOfDay(new Date(t.dueUtc))
      if (isBefore(due, today)) overdue.push(t)
      else if (isSameDay(due, today)) todayList.push(t)
      else if (isSameDay(due, tomorrow)) tomorrowList.push(t)
      else laterList.push(t)
    }

    const sortByDue = (a: CalendarTask, b: CalendarTask) =>
      new Date(a.dueUtc!).getTime() - new Date(b.dueUtc!).getTime()

    return [
      { key: 'overdue', label: 'Overdue', items: overdue.sort(sortByDue) },
      { key: 'today', label: 'Today', items: todayList.sort(sortByDue) },
      { key: 'tomorrow', label: 'Tomorrow', items: tomorrowList.sort(sortByDue) },
      { key: 'later', label: 'Later', items: laterList.sort(sortByDue) },
      { key: 'nodate', label: 'No date', items: noDateList },
    ]
  }, [tasks, today, tomorrow])

  const visibleSections = sections.filter((s) => s.items.length > 0)

  const handleToggle = useCallback(
    async (task: CalendarTask) => {
      const nextCompleted = !task.completed
      // Optimistic update — flip locally so the row leaves the list.
      toggleTaskComplete(task.id)
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: nextCompleted }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        onTaskSaved()
      } catch (err) {
        // Revert by flipping back through the store.
        console.error('Failed to toggle task:', err)
        toggleTaskComplete(task.id)
      }
    },
    [toggleTaskComplete, onTaskSaved]
  )

  const openTask = useCallback(
    (task: CalendarTask) => {
      openDetailPanel({
        kind: 'task',
        data: task as unknown as Parameters<typeof openDetailPanel>[0]['data'],
      })
    },
    [openDetailPanel]
  )

  return (
    <div className="px-3 pb-2">
      <button
        id="tasks-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-controls="tasks-list"
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1f1f1f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
      >
        <span className="text-[16px] font-medium text-[#202124] dark:text-gray-100 tracking-tight">
          Tasks
        </span>
        <svg
          className={`w-4 h-4 text-[#5f6368] dark:text-gray-400 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="tasks-list"
        className={`overflow-hidden transition-all duration-200 ${collapsed ? 'max-h-0' : 'max-h-[4000px]'}`}
      >
        {loading && tasks.length === 0 && (
          <div className="px-5 py-3 text-[14px] text-[#70757a] dark:text-gray-400">
            Loading tasks…
          </div>
        )}

        {!loading && visibleSections.length === 0 && (
          <div className="px-5 py-3 text-[14px] text-[#70757a] dark:text-gray-400">
            No tasks yet
          </div>
        )}

        {visibleSections.map((section) => (
          <div key={section.key}>
            <div
              className={`sidebar-event-day ${
                section.key === 'overdue' ? 'text-[#d50000] dark:text-[#f28b82]' : ''
              }`}
            >
              {section.label}
            </div>
            {section.items.map((task) => (
              <div
                key={task.id}
                className="sidebar-event-item focus:outline-none focus-visible:bg-[#e8f0fe] dark:focus-visible:bg-[#2d2d2d] gap-2"
              >
                {/* Checkbox — separate from row click so it doesn't open the panel */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggle(task)
                  }}
                  aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                  aria-pressed={task.completed}
                  className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${
                    task.completed
                      ? 'bg-[#1a73e8] border-[#1a73e8]'
                      : 'border-[#5f6368] dark:border-[#9aa0a6] hover:border-[#1a73e8]'
                  }`}
                >
                  {task.completed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Title — clicking opens the detail panel */}
                <button
                  onClick={() => openTask(task)}
                  className={`flex-1 text-left text-[14px] truncate min-w-0 ${
                    task.completed
                      ? 'text-[#70757a] dark:text-gray-500 line-through'
                      : 'text-[#202124] dark:text-gray-200'
                  }`}
                  title={task.title}
                >
                  {task.title}
                </button>

                {/* Color accent (only if set) */}
                {task.color && (
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: task.color }}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
