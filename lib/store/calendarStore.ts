import { create } from 'zustand'

export type CalendarView = 'day' | 'week' | 'month'

export interface CalendarEvent {
  id: string
  title: string
  description?: string | null
  location?: string | null
  startUtc: string // ISO string
  endUtc: string   // ISO string
  isAllDay: boolean
  color?: string | null
  calendarId: string
  userId: string
  recurrenceRule?: string | null
  recurrenceId?: string | null
  isException?: boolean
}

export interface CalendarTask {
  id: string
  title: string
  description?: string | null
  /** ISO UTC string. Null = unscheduled. */
  dueUtc?: string | null
  completed: boolean
  completedAt?: string | null
  color?: string | null
  userId: string
}

/** Helper to build a CalendarItem from a calendar event or task payload. */
export function asCalendarItem(
  kind: 'event' | 'task',
  data: Record<string, unknown>
): CalendarItem {
  return { kind, data: data as CalendarItem['data'] }
}

export interface CalendarItem {
  kind: 'event' | 'task'
  // Loose payload — components branch on `kind`.
  data: {
    id: string
    title: string
    description?: string | null
    location?: string | null
    color?: string | null
    userId: string
    // Event-only (optional on task):
    startUtc?: string
    endUtc?: string
    isAllDay?: boolean
    calendarId?: string
    recurrenceRule?: string | null
    recurrenceId?: string | null
    isException?: boolean
    // Task-only (optional on event):
    dueUtc?: string | null
    completed?: boolean
    completedAt?: string | null
  }
}

export interface CalendarListItem {
  id: string
  name: string
  color: string
  userId: string
  visible?: boolean
}

interface CalendarStore {
  // View state
  currentView: CalendarView
  currentDate: Date
  sidebarOpen: boolean
  userTimezone: string

  // Data
  events: CalendarEvent[]
  tasks: CalendarTask[]
  calendars: CalendarListItem[]
  /**
   * Unified selection used by the detail panel. Either an event or a task.
   * `selectedEvent` is kept as a derived getter for back-compat with
   * pre-Task call sites.
   */
  selectedItem: CalendarItem | null
  /** @deprecated Use selectedItem with kind === 'event'. */
  selectedEvent: CalendarEvent | null
  isLoadingEvents: boolean

  // Modal state
  quickModalOpen: boolean
  quickModalPosition: { x: number; y: number } | null
  quickModalDate: Date | null
  detailPanelOpen: boolean
  /** Top-of-page Create FAB chooser (Event vs Task). */
  createMenuOpen: boolean
  /** Anchor rect of the Create button so the chooser can position itself against it. */
  createMenuAnchor: DOMRect | null

  // Dark mode
  darkMode: boolean

  // Actions — View
  setView: (view: CalendarView) => void
  setCurrentDate: (date: Date) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  // Actions — Events
  setEvents: (events: CalendarEvent[]) => void
  addEvent: (event: CalendarEvent) => void
  updateEvent: (id: string, event: Partial<CalendarEvent>) => void
  deleteEvent: (id: string) => void
  setSelectedEvent: (event: CalendarEvent | null) => void
  setIsLoadingEvents: (loading: boolean) => void

  // Actions — Tasks
  setTasks: (tasks: CalendarTask[]) => void
  addTask: (task: CalendarTask) => void
  updateTask: (id: string, patch: Partial<CalendarTask>) => void
  deleteTask: (id: string) => void
  toggleTaskComplete: (id: string) => void

  // Actions — Unified selection
  setSelectedItem: (item: CalendarItem | null) => void

  // Actions — Calendars
  setCalendars: (calendars: CalendarListItem[]) => void
  addCalendar: (calendar: CalendarListItem) => void
  updateCalendar: (id: string, calendar: Partial<CalendarListItem>) => void
  deleteCalendar: (id: string) => void
  toggleCalendarVisibility: (id: string) => void

  // Actions — Modals
  openQuickModal: (position: { x: number; y: number }, date: Date) => void
  closeQuickModal: () => void
  openDetailPanel: (item: CalendarItem) => void
  closeDetailPanel: () => void
  openCreateMenu: (anchor?: DOMRect) => void
  closeCreateMenu: () => void

  // Actions — Dark mode
  toggleDarkMode: () => void
  setDarkMode: (dark: boolean) => void
}

// Read saved theme preference on store init so the toggle icon matches the
// applied class on first paint (the bootstrap script in app/layout.tsx handles
// the DOM class; this keeps the store in sync).
const initialDarkMode =
  typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'

export const useCalendarStore = create<CalendarStore>((set) => ({
  // Initial state
  currentView: 'week',
  currentDate: new Date(),
  sidebarOpen: true,
  userTimezone:
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC',

  events: [],
  tasks: [],
  calendars: [],
  selectedItem: null,
  // Derived: empty until populated from selectedItem
  selectedEvent: null,
  isLoadingEvents: false,

  quickModalOpen: false,
  quickModalPosition: null,
  quickModalDate: null,
  detailPanelOpen: false,
  createMenuOpen: false,
  createMenuAnchor: null,

  darkMode: initialDarkMode,

  // View actions
  setView: (view) => set({ currentView: view }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Event actions
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),
  updateEvent: (id, updated) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === id ? { ...e, ...updated } : e
      ),
    })),
  deleteEvent: (id) =>
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    })),
  setSelectedEvent: (event) =>
    set({
      // Back-compat path — wrap into the unified item.
      selectedEvent: event,
      selectedItem: event
        ? asCalendarItem('event', event as unknown as Record<string, unknown>)
        : null,
      detailPanelOpen: !!event,
    }),
  setIsLoadingEvents: (loading) => set({ isLoadingEvents: loading }),

  // Task actions
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
      // Keep the open detail panel in sync if it's this task
      selectedItem:
        state.selectedItem?.kind === 'task' && state.selectedItem.data.id === id
          ? {
              ...state.selectedItem,
              data: { ...state.selectedItem.data, ...patch },
            }
          : state.selectedItem,
    })),
  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
  toggleTaskComplete: (id) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: !t.completed,
              completedAt: !t.completed ? new Date().toISOString() : t.completedAt,
            }
          : t
      ),
    })),

  // Unified selection
  setSelectedItem: (item) =>
    set({
      selectedItem: item,
      selectedEvent:
        item?.kind === 'event'
          ? (item.data as unknown as CalendarEvent)
          : null,
    }),

  // Calendar actions
  setCalendars: (calendars) =>
    set({
      calendars: calendars.map((c) => ({ ...c, visible: true })),
    }),
  addCalendar: (calendar) =>
    set((state) => ({
      calendars: [...state.calendars, { ...calendar, visible: true }],
    })),
  updateCalendar: (id, updated) =>
    set((state) => ({
      calendars: state.calendars.map((c) =>
        c.id === id ? { ...c, ...updated } : c
      ),
    })),
  deleteCalendar: (id) =>
    set((state) => ({
      calendars: state.calendars.filter((c) => c.id !== id),
    })),
  toggleCalendarVisibility: (id) =>
    set((state) => ({
      calendars: state.calendars.map((c) =>
        c.id === id ? { ...c, visible: !c.visible } : c
      ),
    })),

  // Modal actions
  openQuickModal: (position, date) =>
    set({ quickModalOpen: true, quickModalPosition: position, quickModalDate: date }),
  closeQuickModal: () =>
    set({ quickModalOpen: false, quickModalPosition: null, quickModalDate: null }),
  openDetailPanel: (item) =>
    set({
      selectedItem: item,
      selectedEvent:
        item.kind === 'event' ? (item.data as unknown as CalendarEvent) : null,
      detailPanelOpen: true,
    }),
  closeDetailPanel: () =>
    set({ detailPanelOpen: false, selectedItem: null, selectedEvent: null }),
  openCreateMenu: (anchor) =>
    set({
      createMenuOpen: true,
      createMenuAnchor: anchor ?? null,
    }),
  closeCreateMenu: () =>
    set({ createMenuOpen: false, createMenuAnchor: null }),

  // Dark mode
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
      }
      return { darkMode: next }
    }),
  setDarkMode: (dark) =>
    set(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', dark)
        // Persist alongside toggleDarkMode so reloads don't revert.
        try {
          localStorage.setItem('theme', dark ? 'dark' : 'light')
        } catch {
          // localStorage unavailable (Safari private mode, quota) — best-effort.
        }
      }
      return { darkMode: dark }
    }),
}))
