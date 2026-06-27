import { RRule, RRuleSet, rrulestr } from 'rrule'
import { addDays } from 'date-fns'

export interface EventLike {
  id: string
  title: string
  startUtc: Date
  endUtc: Date
  isAllDay: boolean
  recurrenceRule?: string | null
  recurrenceId?: string | null
  isException?: boolean
  color?: string | null
  calendarId: string
  userId: string
  description?: string | null
  location?: string | null
  [key: string]: unknown
}

/**
 * Expand a recurring event into individual instances within [windowStart, windowEnd].
 * Returns an array of virtual event objects (not persisted).
 */
export function expandRecurring(
  event: EventLike,
  windowStart: Date,
  windowEnd: Date,
  exceptions: EventLike[] = []
): EventLike[] {
  if (!event.recurrenceRule) return [event]

  try {
    const rule = rrulestr(`DTSTART:${formatDTSTART(event.startUtc)}\n${event.recurrenceRule}`)
    const duration = event.endUtc.getTime() - event.startUtc.getTime()

    // Get all occurrences in window
    const occurrences = rule.between(windowStart, windowEnd, true)

    // Build set of exception dates (converted to day strings for comparison)
    const exceptionDates = new Set(
      exceptions.map((e) => {
        // Match by original start time stored in recurrenceId or by date
        return e.startUtc.toISOString().split('T')[0]
      })
    )

    return occurrences
      .filter((occDate) => {
        const dateStr = occDate.toISOString().split('T')[0]
        return !exceptionDates.has(dateStr)
      })
      .map((occDate) => ({
        ...event,
        id: `${event.id}_${occDate.toISOString()}`,
        startUtc: occDate,
        endUtc: new Date(occDate.getTime() + duration),
        recurrenceId: event.id,
        isException: false,
      }))
  } catch (err) {
    console.error('Failed to expand recurrence rule:', err)
    return [event]
  }
}

/**
 * Truncate an RRULE with an UNTIL date.
 * Returns the modified RRULE string.
 */
export function truncateRRule(ruleStr: string, untilDate: Date): string {
  // Remove existing UNTIL or COUNT
  const cleaned = ruleStr
    .replace(/;?UNTIL=[^;]*/g, '')
    .replace(/;?COUNT=\d+/g, '')
    .replace(/^;/, '')

  const untilStr = untilDate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

  return `${cleaned};UNTIL=${untilStr}`
}

/**
 * Parse frequency label for UI display.
 */
export function getRRuleLabel(ruleStr: string): string {
  if (!ruleStr) return 'Does not repeat'
  try {
    const rule = RRule.fromString(ruleStr)
    return rule.toText()
  } catch {
    return ruleStr
  }
}

/**
 * Format a date as DTSTART value for RRULE.
 */
function formatDTSTART(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

/**
 * Common recurrence presets for the UI dropdown.
 */
export const RECURRENCE_PRESETS = [
  { label: 'Does not repeat', value: '' },
  { label: 'Daily', value: 'FREQ=DAILY' },
  { label: 'Weekly', value: 'FREQ=WEEKLY' },
  { label: 'Monthly', value: 'FREQ=MONTHLY' },
  { label: 'Annually', value: 'FREQ=YEARLY' },
  {
    label: 'Every weekday (Mon–Fri)',
    value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  },
]
