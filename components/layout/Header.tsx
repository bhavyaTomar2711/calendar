'use client'

import { useState, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { useSession, signOut } from 'next-auth/react'
import { useCalendarStore, CalendarView } from '@/lib/store/calendarStore'
import { navigateDate } from '@/lib/utils/dates'
import SearchBar from './SearchBar'

const VIEWS: { label: string; value: CalendarView }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
]

// Sidebar width must stay in sync with components/layout/Sidebar.tsx
const SIDEBAR_WIDTH = 256

interface HeaderProps {
  onEventSaved: () => void
}

export default function Header({ onEventSaved: _onEventSaved }: HeaderProps) {
  const { data: session } = useSession()
  const {
    currentView,
    currentDate,
    setCurrentDate,
    setView,
    toggleSidebar,
    toggleDarkMode,
    darkMode,
  } = useCalendarStore()

  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  const handleToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [setCurrentDate])

  const handlePrev = useCallback(() => {
    setCurrentDate(navigateDate(currentDate, -1, currentView))
  }, [currentDate, currentView, setCurrentDate])

  const handleNext = useCallback(() => {
    setCurrentDate(navigateDate(currentDate, 1, currentView))
  }, [currentDate, currentView, setCurrentDate])

  const dateLabel = format(
    currentDate,
    currentView === 'day' ? 'EEEE, MMMM d, yyyy' : 'MMMM yyyy'
  )

  const userInitial =
    session?.user?.name?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    '?'
  const avatarUrl = session?.user?.image

  return (
    <header
      className="grid items-center shrink-0 bg-[#f8fafd] dark:bg-[#1f1f1f] px-4 gap-1"
      style={{
        gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
        height: 64,
      }}
    >
      {/* Left zone — matches sidebar width, holds hamburger + logo */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          id="sidebar-toggle-btn"
          onClick={toggleSidebar}
          className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-[#3d3d3d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
          aria-label="Toggle sidebar"
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
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2 mr-4 min-w-0">
          <svg viewBox="0 0 24 24" className="w-9 h-9 shrink-0" fill="none">
            <path
              d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"
              fill="#1a73e8"
            />
            <path d="M5 10h14v10H5z" fill="#e8f0fe" />
            <path
              d="M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
              fill="#1a73e8"
            />
          </svg>
          <span className="text-[22px] font-normal text-[#202124] dark:text-gray-100 hidden sm:block tracking-tight truncate">
            Calendar
          </span>
        </div>
      </div>

      {/* Right zone — starts at right edge of sidebar; contains Today/nav/date + all right controls */}
      <div className="flex items-center gap-1 min-w-0 pl-3">
        {/* Today + nav + date label */}
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <button
            id="header-today-btn"
            onClick={handleToday}
            className="px-6 py-2 text-[16px] font-medium text-[#202124] dark:text-gray-100 border border-[#9aa0a6] dark:border-[#5f6368] rounded-full hover:text-[#1a73e8] hover:border-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#2d2d2d] dark:hover:text-[#8ab4f8] dark:hover:border-[#8ab4f8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] min-h-[40px] shrink-0"
          >
            Today
          </button>
          <div className="flex items-center shrink-0">
            <button
              id="header-prev-btn"
              onClick={handlePrev}
              aria-label="Previous"
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2d2d] text-[#202124] dark:text-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            >
              <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              id="header-next-btn"
              onClick={handleNext}
              aria-label="Next"
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2d2d] text-[#202124] dark:text-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            >
              <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <h2
            id="header-date-label"
            aria-live="polite"
            className="text-xl md:text-2xl font-normal text-[#202124] dark:text-gray-100 ml-1 select-none truncate"
          >
            {dateLabel}
          </h2>
        </div>

        {/* Right-side controls: search, dark mode, view, avatar */}
        <div className="flex items-center gap-2 shrink-0">
          <SearchBar />

          <button
            id="dark-mode-btn"
            onClick={toggleDarkMode}
            className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-[#3d3d3d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg
                className="w-[22px] h-[22px] text-gray-100"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-[22px] h-[22px] text-[#202124]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>

          <div className="relative" ref={viewRef}>
            <button
              id="view-dropdown-btn"
              onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
              aria-haspopup="menu"
              aria-expanded={viewDropdownOpen}
              className="flex items-center gap-1.5 px-5 py-2 text-[16px] font-medium text-[#202124] dark:text-gray-100 border border-[#9aa0a6] dark:border-[#5f6368] rounded-full hover:text-[#1a73e8] hover:border-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#2d2d2d] dark:hover:text-[#8ab4f8] dark:hover:border-[#8ab4f8] transition-colors min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            >
              {VIEWS.find((v) => v.value === currentView)?.label}
              <svg
                className="w-[18px] h-[18px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {viewDropdownOpen && (
              <div className="absolute right-0 top-10 w-32 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-lg shadow-lg py-1 z-50">
                {VIEWS.map((v) => (
                  <button
                    key={v.value}
                    id={`view-${v.value}-btn`}
                    onClick={() => {
                      setView(v.value)
                      setViewDropdownOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      currentView === v.value
                        ? 'bg-[#e8f0fe] text-[#1a73e8] font-medium'
                        : 'text-[#202124] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative ml-1" ref={avatarRef}>
            <button
              id="avatar-btn"
              onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={avatarMenuOpen}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-transparent hover:border-[#1a73e8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#1a73e8] text-white text-sm font-medium">
                  {userInitial}
                </div>
              )}
            </button>

            {avatarMenuOpen && (
              <div className="absolute right-0 top-10 w-56 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-xl shadow-lg py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-[#3d3d3d]">
                  <p className="text-sm font-medium text-[#202124] dark:text-gray-200 truncate">
                    {session?.user?.name ?? 'User'}
                  </p>
                  <p className="text-xs text-[#70757a] dark:text-gray-400 truncate">
                    {session?.user?.email}
                  </p>
                </div>
                <button
                  id="signout-btn"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full text-left px-4 py-2 text-sm text-[#202124] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d] transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Close dropdowns on outside click */}
        {(viewDropdownOpen || avatarMenuOpen) && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setViewDropdownOpen(false)
              setAvatarMenuOpen(false)
            }}
          />
        )}
      </div>
    </header>
  )
}
