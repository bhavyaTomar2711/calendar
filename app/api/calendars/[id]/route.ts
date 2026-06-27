import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PUT /api/calendars/[id] — rename / recolor
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<'/api/calendars/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const { name, color } = body

  const calendar = await prisma.calendar.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!calendar) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  const updated = await prisma.calendar.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/calendars/[id] — delete + cascade events
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/calendars/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const calendar = await prisma.calendar.findFirst({
    where: { id, userId: session.user.id },
    include: { _count: { select: { events: true } } },
  })

  if (!calendar) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  // Cascade delete events first (SQLite doesn't always enforce FK cascades)
  await prisma.event.deleteMany({
    where: { calendarId: id, userId: session.user.id },
  })

  await prisma.calendar.delete({ where: { id } })

  return NextResponse.json({
    deleted: true,
    eventsDeleted: calendar._count.events,
  })
}
