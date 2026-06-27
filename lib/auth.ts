import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // On first sign-in, create a default "Personal" calendar
      if (user?.id) {
        try {
          const existing = await prisma.calendar.findFirst({
            where: { userId: user.id },
          })
          if (!existing) {
            await prisma.calendar.create({
              data: {
                name: 'Personal',
                color: '#1a73e8',
                userId: user.id,
              },
            })
          }
        } catch {
          // Calendar creation is best-effort; don't block sign-in
        }
      }
      return true
    },
  },
})
