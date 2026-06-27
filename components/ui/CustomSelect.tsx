'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface SelectOption {
  label: string
  value: string
  /** Optional leading swatch color — renders a small color dot before the label */
  swatch?: string
}

interface CustomSelectProps {
  id: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  placeholder?: string
  /** Optional icon rendered inside the trigger on the left */
  icon?: React.ReactNode
  className?: string
}

/**
 * A dropdown that replaces the native <select> so it can match the rest of
 * the app's design — soft border, chevron, animated panel, click-outside,
 * Escape, keyboard arrows. Visually mirrors the event detail form rows.
 */
export default function CustomSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Select…',
  icon,
  className = '',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click
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

  // Close on Escape; arrow keys navigate; Enter selects
  const onTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
        setActiveIndex((cur) => {
          const start = cur === -1
            ? (e.key === 'ArrowDown' ? 0 : options.length - 1)
            : e.key === 'ArrowDown'
              ? Math.min(cur + 1, options.length - 1)
              : Math.max(cur - 1, 0)
          return start
        })
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (!open) {
          e.preventDefault()
          setOpen(true)
          setActiveIndex(0)
        }
      }
    },
    [open, options.length]
  )

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const opt = options[activeIndex]
        if (opt) {
          onChange(opt.value)
          setOpen(false)
          triggerRef.current?.focus()
        }
      }
    },
    [activeIndex, options, onChange]
  )

  // Scroll active option into view inside the popover
  useEffect(() => {
    if (!open || !listRef.current || activeIndex < 0) return
    const item = listRef.current.querySelector<HTMLLIElement>(
      `[data-index="${activeIndex}"]`
    )
    item?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function handleSelect(opt: SelectOption) {
    onChange(opt.value)
    setOpen(false)
    // Return focus to trigger so keyboard users stay oriented
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      {/* Hidden native <select> keeps form-style a11y intact for screen readers */}
      <label htmlFor={id} className="sr-only">{ariaLabel}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="sr-only"
        tabIndex={-1}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 border border-gray-300 dark:border-[#5f6368] rounded-lg pl-3 pr-2 py-2 text-sm bg-white dark:bg-[#3d3d3d] text-gray-700 dark:text-gray-200 hover:border-[#1a73e8] dark:hover:border-[#8ab4f8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8] transition-colors min-h-[40px]"
      >
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
        {selected?.swatch && (
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: selected.swatch }}
            aria-hidden="true"
          />
        )}
        <span className="flex-1 text-left truncate">
          {selected?.label ?? placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[44px] z-50 max-h-[280px] overflow-y-auto bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#3d3d3d] rounded-xl shadow-xl py-1 focus:outline-none"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value
              const isActive = i === activeIndex
              return (
                <li
                  key={opt.value}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => handleSelect(opt)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors min-h-[36px] ${
                    isActive
                      ? 'bg-[#e8f0fe] dark:bg-[#3d3d3d] text-[#1a73e8] dark:text-[#8ab4f8]'
                      : 'text-gray-700 dark:text-gray-200'
                  } ${isSelected ? 'font-medium' : ''}`}
                >
                  {opt.swatch && (
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: opt.swatch }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
