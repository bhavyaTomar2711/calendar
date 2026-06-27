import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { truncateRRule } from '@/lib/utils/recurrence'

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

// DELETE /api/events/[id]?scope=this|all
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

  const existing = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (scope === 'all' && (existing.recurrenceRule || existing.recurrenceId)) {
    const parentId = existing.recurrenceId ?? existing.id
    // Delete parent and all exceptions
    await prisma.event.deleteMany({
      where: {
        userId: session.user.id,
        OR: [{ id: parentId }, { recurrenceId: parentId }],
      },
    })
    return NextResponse.json({ deleted: true, scope: 'all' })
  }

  // Delete just this event / exception
  await prisma.event.delete({ where: { id } })
  return NextResponse.json({ deleted: true, scope: 'this' })
}
