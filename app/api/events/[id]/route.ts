import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { truncateRRule, appendExdateToRRule } from '@/lib/utils/recurrence'

// GET /api/events/[id]
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const event = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json(event)
}

// PUT /api/events/[id]
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
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
    scope, // 'this' | 'following' | 'all'
    _occStart, // ISO string — when dragging a recurring occurrence, identifies which one
  } = body

  const start = startUtc ? new Date(startUtc) : undefined
  const end = endUtc ? new Date(endUtc) : undefined

  if (start && end && start > end) {
    return NextResponse.json(
      { error: 'startUtc must be before endUtc' },
      { status: 400 }
    )
  }

  const existing = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const updateData = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(location !== undefined && { location }),
    ...(start && { startUtc: start }),
    ...(end && { endUtc: end }),
    ...(isAllDay !== undefined && { isAllDay }),
    ...(color !== undefined && { color }),
    ...(calendarId !== undefined && { calendarId }),
    ...(recurrenceRule !== undefined && { recurrenceRule }),
  }

  // Handle recurring event edit scopes
  if (existing.recurrenceRule || existing.recurrenceId) {
    const parentId = existing.recurrenceId ?? existing.id

    if (scope === 'this') {
      // Create an exception for this specific occurrence
      const exception = await prisma.event.create({
        data: {
          title: title ?? existing.title,
          description: description ?? existing.description,
          location: location ?? existing.location,
          startUtc: start ?? existing.startUtc,
          endUtc: end ?? existing.endUtc,
          isAllDay: isAllDay ?? existing.isAllDay,
          color: color ?? existing.color,
          calendarId: calendarId ?? existing.calendarId,
          userId: session.user.id,
          recurrenceId: parentId,
          isException: true,
        },
      })
      return NextResponse.json(exception)
    }

    if (scope === 'following' && start) {
      // Truncate parent RRULE and create new series
      const parent = await prisma.event.findFirst({
        where: { id: parentId, userId: session.user.id },
      })

      if (parent?.recurrenceRule) {
        // Truncate the original series to end before this occurrence
        const dayBefore = new Date(start.getTime() - 86400000)
        const truncated = truncateRRule(parent.recurrenceRule, dayBefore)

        await prisma.event.update({
          where: { id: parentId },
          data: { recurrenceRule: truncated },
        })

        // Create new series from this date
        const newSeries = await prisma.event.create({
          data: {
            title: title ?? parent.title,
            description: description ?? parent.description,
            location: location ?? parent.location,
            startUtc: start,
            endUtc: end ?? new Date(start.getTime() + (parent.endUtc.getTime() - parent.startUtc.getTime())),
            isAllDay: isAllDay ?? parent.isAllDay,
            color: color ?? parent.color,
            calendarId: calendarId ?? parent.calendarId,
            userId: session.user.id,
            recurrenceRule: recurrenceRule ?? parent.recurrenceRule,
          },
        })
        return NextResponse.json(newSeries)
      }
    }

    if (scope === 'all') {
      // Update the parent event directly
      const updated = await prisma.event.update({
        where: { id: parentId },
        data: updateData,
      })
      return NextResponse.json(updated)
    }
  }

  // Non-recurring or default update
  const updated = await prisma.event.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}

// DELETE /api/events/[id]?scope=this|following|all
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'this'
  const occStartParam = searchParams.get('occStart')

  // For occurrences of a recurring series, `id` is the parent id and
  // `occStart` is the ISO date of the specific occurrence to act on.
  // For the parent itself, `id` is the parent and `occStart` is omitted
  // (we default to the parent's own startUtc).
  const targetStartUtc = occStartParam ? new Date(occStartParam) : null

  const existing = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // For an occurrence of a recurring series, find the parent rule + start time
  // so we can build the correct exception / split.
  const parentId = existing.recurrenceId ?? existing.id
  const parent = existing.recurrenceId
    ? await prisma.event.findFirst({
        where: { id: parentId, userId: session.user.id },
      })
    : existing

  // scope=this: delete only this occurrence by storing an EXDATE on the
  // parent RRULE so rrule expansion skips it. We don't actually persist an
  // exception row — RRULE expansion handles the deletion on read.
  if (scope === 'this' && parent?.recurrenceRule) {
    const exdate = targetStartUtc ?? existing.startUtc
    const updatedRule = appendExdateToRRule(parent.recurrenceRule, exdate)
    await prisma.event.update({
      where: { id: parentId },
      data: { recurrenceRule: updatedRule },
    })
    return NextResponse.json({ deleted: true, scope: 'this' })
  }

  // scope=following: truncate parent RRULE so it stops before this date.
  if (scope === 'following' && parent?.recurrenceRule) {
    const cutoff = targetStartUtc ?? existing.startUtc
    const dayBefore = new Date(cutoff.getTime() - 86400000)
    const truncated = truncateRRule(parent.recurrenceRule, dayBefore)
    await prisma.event.update({
      where: { id: parentId },
      data: { recurrenceRule: truncated },
    })
    return NextResponse.json({ deleted: true, scope: 'following' })
  }

  // scope=all (or non-recurring): hard delete parent + all exceptions.
  await prisma.event.deleteMany({
    where: {
      userId: session.user.id,
      OR: [{ id: parentId }, { recurrenceId: parentId }],
    },
  })
  return NextResponse.json({ deleted: true, scope: 'all' })
}
