import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, password } = body

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 }
    )
  }

  const hashed = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: { name, email, password: hashed },
  })

  // Create default Personal calendar
  await prisma.calendar.create({
    data: {
      name: 'Personal',
      color: '#1a73e8',
      userId: user.id,
    },
  })

  return NextResponse.json({ id: user.id, email: user.email, name: user.name })
}
