import { toZonedTime, fromZonedTime, format } from 'date-fns-tz'
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  isSameDay,
  differenceInMinutes,
} from 'date-fns'

/**
 * Get the user's local IANA timezone string.
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Convert a UTC Date to the user's local timezone.
 */
export function toUserTz(utcDate: Date, tz: string): Date {
  return toZonedTime(utcDate, tz)
}

/**
 * Convert a local-timezone Date back to UTC.
 */
export function fromUserTz(localDate: Date, tz: string): Date {
  return fromZonedTime(localDate, tz)
}

/**
 * Format a date in the user's timezone.
 */
export function formatInTz(date: Date, fmt: string, tz: string): string {
  return format(toZonedTime(date, tz), fmt, { timeZone: tz })
}

/**
 * Snap minutes delta to the nearest 15-minute increment.
 */
export function snapTo15Min(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/**
 * Get minutes from midnight for a given date in a timezone.
 */
export function getMinutesFromMidnight(date: Date, tz: string): number {
  const zoned = toZonedTime(date, tz)
  return zoned.getHours() * 60 + zoned.getMinutes()
}

/**
 * Get the week date range for a given date.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 0 }),
    end: endOfWeek(date, { weekStartsOn: 0 }),
  }
}

/**
 * Get the month date range (including padding days for 6-row grid).
 */
export function getMonthGridRange(date: Date): { start: Date; end: Date } {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  return {
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
  }
}

/**
 * Build an array of 7 day dates for a given week start.
 */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/**
 * Build a 6×7 grid of dates for the month view.
 */
export function getMonthGrid(date: Date): Date[][] {
  const { start } = getMonthGridRange(date)
  const grid: Date[][] = []
  for (let week = 0; week < 6; week++) {
    const row: Date[] = []
    for (let day = 0; day < 7; day++) {
      row.push(addDays(start, week * 7 + day))
    }
    grid.push(row)
  }
  return grid
}

/**
 * Navigate a date by view type.
 */
export function navigateDate(
  date: Date,
  direction: 1 | -1,
  view: 'day' | 'week' | 'month'
): Date {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addWeeks(date, direction)
  return addMonths(date, direction)
}

/**
 * Check if two time ranges overlap.
 */
export function doRangesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2
}

/**
 * Calculate event top position (%) for a 60px-per-hour grid.
 */
export function eventTopPx(startUtc: Date, tz: string): number {
  return getMinutesFromMidnight(startUtc, tz)
}

/**
 * Calculate event height in px for a 60px-per-hour grid (1px per minute).
 */
export function eventHeightPx(startUtc: Date, endUtc: Date): number {
  const mins = Math.max(differenceInMinutes(endUtc, startUtc), 30)
  return mins
}

/**
 * Get abbreviated timezone label, e.g. "GMT+5:30"
 */
export function getTzLabel(tz: string): string {
  try {
    const offset = format(new Date(), 'xxx', { timeZone: tz })
    return `GMT${offset}`
  } catch {
    return tz
  }
}
