import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/calendars — all calendars for current user
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const calendars = await prisma.calendar.findMany({
    where: { userId: session.user.id },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(calendars)
}

// POST /api/calendars — create calendar
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, color } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const calendar = await prisma.calendar.create({
    data: {
      name,
      color: color ?? '#1a73e8',
      userId: session.user.id,
    },
  })

  return NextResponse.json(calendar)
}
