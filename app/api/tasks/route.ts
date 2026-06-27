import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/tasks?completed=true|false&dueFrom=ISO&dueTo=ISO
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const completedParam = searchParams.get('completed')
  const dueFrom = searchParams.get('dueFrom')
  const dueTo = searchParams.get('dueTo')

  // Default: only show incomplete tasks (the sidebar's active list).
  // Pass completed=true to fetch finished tasks; omit to fetch all.
  const where: Record<string, unknown> = { userId: session.user.id }
  if (completedParam === 'true') where.completed = true
  else if (completedParam === 'false') where.completed = false

  if (dueFrom || dueTo) {
    const range: { gte?: Date; lte?: Date } = {}
    if (dueFrom) {
      const d = new Date(dueFrom)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid dueFrom' }, { status: 400 })
      }
      range.gte = d
    }
    if (dueTo) {
      const d = new Date(dueTo)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid dueTo' }, { status: 400 })
      }
      range.lte = d
    }
    where.dueUtc = range
  }

  // Order: dated tasks ascending by due date, then undated at the bottom
  // (SQLite sorts NULLs first by default; we re-sort below for nulls-last).
  const raw = await prisma.task.findMany({
    where,
    orderBy: [{ dueUtc: 'asc' }, { createdAt: 'desc' }],
  })

  const sorted = raw.sort((a, b) => {
    if (!a.dueUtc && !b.dueUtc) {
      return b.createdAt.getTime() - a.createdAt.getTime()
    }
    if (!a.dueUtc) return 1
    if (!b.dueUtc) return -1
    return a.dueUtc.getTime() - b.dueUtc.getTime()
  })

  return NextResponse.json(sorted)
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, dueUtc, color } = body ?? {}

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  let dueDate: Date | null = null
  if (dueUtc) {
    dueDate = new Date(dueUtc)
    if (isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dueUtc' }, { status: 400 })
    }
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description ?? null,
      dueUtc: dueDate,
      color: color ?? null,
      userId: session.user.id,
    },
  })

  return NextResponse.json(task)
}
