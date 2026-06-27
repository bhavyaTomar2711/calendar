'use client'

import { SessionProvider } from 'next-auth/react'

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <div className="h-screen flex flex-col overflow-hidden">{children}</div>
    </SessionProvider>
  )
}
