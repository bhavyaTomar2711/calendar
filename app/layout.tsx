import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Google Calendar Clone',
  description:
    'A full-featured Google Calendar clone built with Next.js, Prisma, and Tailwind CSS.',
}

// Runs synchronously before paint to apply the saved theme and avoid FOUC.
const themeBootstrap = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
