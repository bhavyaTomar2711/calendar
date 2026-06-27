import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/tasks/[id]
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  return NextResponse.json(task)
}

// PUT /api/tasks/[id]
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const { title, description, dueUtc, color, completed } = body ?? {}

  const existing = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    }
    updateData.title = title.trim()
  }

  if (description !== undefined) {
    updateData.description = description ?? null
  }

  if (dueUtc !== undefined) {
    if (dueUtc === null || dueUtc === '') {
      updateData.dueUtc = null
    } else {
      const d = new Date(dueUtc)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid dueUtc' }, { status: 400 })
      }
      updateData.dueUtc = d
    }
  }

  if (color !== undefined) {
    updateData.color = color ?? null
  }

  if (completed !== undefined) {
    const next = !!completed
    updateData.completed = next
    // Auto-stamp completion time when transitioning false → true.
    // Never auto-clear on false → true un-complete (keep the original stamp).
    if (next && !existing.completed) {
      updateData.completedAt = new Date()
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
  })
  return NextResponse.json(updated)
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const existing = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  await prisma.task.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
