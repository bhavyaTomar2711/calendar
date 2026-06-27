import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expandRecurring, type EventLike } from '@/lib/utils/recurrence'

// GET /api/events?start=ISO&end=ISO&calendarId=optional&q=search
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')
  const calendarId = searchParams.get('calendarId')
  const query = searchParams.get('q')?.trim() ?? ''

  // Text search has its own path: no time window required, results ordered by
  // upcoming start time. Matches Google Calendar's "Search" behavior.
  if (query) {
    const events = await prisma.event.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { location: { contains: query } },
        ],
      },
      orderBy: { startUtc: 'asc' },
      take: 50,
    })
    return NextResponse.json(events)
  }

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: 'start and end query params are required' },
      { status: 400 }
    )
  }

  const windowStart = new Date(startParam)
  const windowEnd = new Date(endParam)

  if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  if (windowStart > windowEnd) {
    return NextResponse.json(
      { error: 'start must be before end' },
      { status: 400 }
    )
  }

  const where: Record<string, unknown> = {
    userId: session.user.id,
    // Fetch events that overlap the window, including parent recurring events
    OR: [
      // Non-recurring events that overlap the window
      {
        recurrenceRule: null,
        startUtc: { lte: windowEnd },
        endUtc: { gte: windowStart },
      },
      // Recurring parent events (could have occurrences in window)
      { recurrenceRule: { not: null }, isException: false },
      // Exception instances in window
      {
        isException: true,
        startUtc: { lte: windowEnd },
        endUtc: { gte: windowStart },
      },
    ],
  }

  if (calendarId) {
    where.calendarId = calendarId
  }

  const events = await prisma.event.findMany({ where })
  type PrismaEvent = (typeof events)[number]

  // Separate recurring parent events from regular and exception events
const recurring = events.filter(e => e.recurrenceRule && !e.isException)
const exceptions = events.filter(e => e.isException)
const regular = events.filter(e => !e.recurrenceRule && !e.isException)

  // Expand recurring events
  const expanded: typeof events = []
  for (const event of recurring) {
    const eventExceptions = exceptions.filter(
      (ex) => ex.recurrenceId === event.id
    )
    const eventLike: EventLike = {
      id: event.id,
      title: event.title,
      startUtc: event.startUtc,
      endUtc: event.endUtc,
      isAllDay: event.isAllDay,
      recurrenceRule: event.recurrenceRule,
      recurrenceId: event.recurrenceId,
      isException: event.isException,
      color: event.color,
      calendarId: event.calendarId,
      userId: event.userId,
      description: event.description,
      location: event.location,
    }
    const exceptionsLike: EventLike[] = eventExceptions.map((ex) => ({
      id: ex.id,
      title: ex.title,
      startUtc: ex.startUtc,
      endUtc: ex.endUtc,
      isAllDay: ex.isAllDay,
      recurrenceRule: ex.recurrenceRule,
      recurrenceId: ex.recurrenceId,
      isException: ex.isException,
      color: ex.color,
      calendarId: ex.calendarId,
      userId: ex.userId,
      description: ex.description,
      location: ex.location,
    }))
    const instances = expandRecurring(eventLike, windowStart, windowEnd, exceptionsLike)
    expanded.push(...(instances as typeof events))
  }

  const allEvents = [...regular, ...expanded, ...exceptions]

  return NextResponse.json(allEvents)
}

// POST /api/events
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    title,
    description,
    location,
    startUtc,
    endUtc,
    isAllDay,
    color,
    calendarId,
    recurrenceRule,
  } = body

  if (!title || !startUtc || !endUtc || !calendarId) {
    return NextResponse.json(
      { error: 'title, startUtc, endUtc, calendarId are required' },
      { status: 400 }
    )
  }

  const start = new Date(startUtc)
  const end = new Date(endUtc)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  if (start > end) {
    return NextResponse.json(
      { error: 'startUtc must be before endUtc' },
      { status: 400 }
    )
  }

  // Verify calendar belongs to user
  const calendar = await prisma.calendar.findFirst({
    where: { id: calendarId, userId: session.user.id },
  })
  if (!calendar) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  // Overlap detection — warn but don't block
  const overlapping = await prisma.event.findMany({
    where: {
      calendarId,
      userId: session.user.id,
      isException: false,
      startUtc: { lt: end },
      endUtc: { gt: start },
    },
  })

  const event = await prisma.event.create({
    data: {
      title,
      description,
      location,
      startUtc: start,
      endUtc: end,
      isAllDay: isAllDay ?? false,
      color,
      calendarId,
      userId: session.user.id,
      recurrenceRule,
    },
  })

  return NextResponse.json({
    event,
    overlapping: overlapping.length > 0,
    conflicts: overlapping,
  })
}
