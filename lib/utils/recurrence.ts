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

  const duration = event.endUtc.getTime() - event.startUtc.getTime()

  // Parse EXDATE entries (comma-separated date stamps after EXDATE=) so we
  // can use RRuleSet, which is the only way the rrule library honors them.
  const exdates: Date[] = []
  const exdateMatches = event.recurrenceRule.match(/EXDATE=([^;]*)/g)
  if (exdateMatches) {
    for (const m of exdateMatches) {
      const list = m.replace(/^EXDATE=/, '').split(',')
      for (const stamp of list) {
        const d = parseRRuleDate(stamp.trim())
        if (d) exdates.push(d)
      }
    }
  }

  let occurrences: Date[]
  try {
    if (exdates.length > 0) {
      // RRule (not RRuleSet) rejects EXDATE in its parser — use RRuleSet
      // when we have exceptions so the dates are actually skipped.
      const set = new RRuleSet()
      // Parse the rule via rrulestr (drops any EXDATE in the input)
      const cleanedRule = event.recurrenceRule.replace(/;?EXDATE=[^;]*/g, '').replace(/^;/, '')
      const rrule = rrulestr(`DTSTART:${formatDTSTART(event.startUtc)}\n${cleanedRule}`)
      if (rrule instanceof RRule) set.rrule(rrule)
      for (const d of exdates) set.exdate(d)
      occurrences = set.between(windowStart, windowEnd, true)
    } else {
      const rule = rrulestr(`DTSTART:${formatDTSTART(event.startUtc)}\n${event.recurrenceRule}`)
      occurrences = rule.between(windowStart, windowEnd, true)
    }
  } catch (err) {
    console.error('Failed to expand recurrence rule:', err)
    return [event]
  }

  // Build set of exception dates from any explicit exception rows the
  // caller passed in. EXDATE-based skipping is already done above.
  const exceptionDates = new Set<string>()
  for (const e of exceptions) {
    exceptionDates.add(e.startUtc.toISOString().split('T')[0])
  }

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
}

/** Parse an RRULE date stamp (YYYYMMDDTHHMMSSZ or YYYYMMDD) to a Date. */
function parseRRuleDate(stamp: string): Date | null {
  if (!stamp) return null
  // Convert "20260627T093000Z" → "20260627T09:30:00Z"
  const normalized = stamp.length >= 15
    ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}${stamp.slice(15) || 'Z'}`
    : `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00Z`
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
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
 * Append an EXDATE (exception date) to an RRULE so the rrule expansion
 * skips that one occurrence. Returns the modified RRULE string. Used for
 * "delete this event only" on a recurring series — we don't persist a
 * separate exception row, we just tell rrule to skip the date.
 */
export function appendExdateToRRule(ruleStr: string, exdate: Date): string {
  const exdateStr = exdate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

  // Strip any existing EXDATE list and re-add ours.
  const cleaned = ruleStr.replace(/;?EXDATE=[^;]*/g, '').replace(/^;/, '')

  // EXDATE takes a list — if we already had one, append with a comma.
  const existing = ruleStr.match(/EXDATE=([^;]*)/)
  if (existing) {
    const merged = `${existing[1]},${exdateStr}`
    return cleaned.replace(/EXDATE=[^;]*/g, `EXDATE=${merged}`)
  }
  return `${cleaned};EXDATE=${exdateStr}`
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
