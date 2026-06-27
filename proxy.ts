import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)

// Routes that are reachable without an authenticated session.
// Page routes render the auth UI; API routes here must guard themselves.
const publicPrefixes = ['/login', '/register', '/api/auth', '/api/register']

function isPublicPath(pathname: string): boolean {
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) return NextResponse.next()

  const session = await auth()

  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
