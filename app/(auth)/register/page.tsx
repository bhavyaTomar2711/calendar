'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    let res: Response
    try {
      res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
    } catch (err) {
      setLoading(false)
      setError('Network error. Please try again.')
      return
    }

    if (!res.ok) {
      let msg = 'Registration failed'
      try {
        const data = await res.json()
        msg = data.error ?? msg
      } catch {
        // Non-JSON response (e.g. an HTML redirect page) — fall back to generic message
      }
      setError(msg)
      setLoading(false)
      return
    }

    // Auto sign in after registration
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Account created but sign-in failed. Please log in manually.')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8"
      style={{ background: '#f3f4f6' }}
    >
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden grid lg:grid-cols-[1.1fr_1fr] min-h-[640px]">
        {/* ── Left: image panel ───────────────────────────────────── */}
        <aside className="relative hidden lg:block bg-white rounded-r-3xl overflow-hidden">
          <img
            src="/login image.png"
            alt="Calendar illustration"
            className="absolute inset-3 w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] object-cover rounded-2xl"
          />
        </aside>

        {/* ── Right: register form ────────────────────────────────── */}
        <main className="flex flex-col justify-center px-10 sm:px-14 lg:px-20 py-12">
          {/* Brand */}
          <div className="flex items-center gap-2.5 mb-12">
            <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" aria-hidden="true">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" fill="#1a73e8"/>
              <path d="M5 10h14v10H5z" fill="#e8f0fe"/>
              <path d="M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="#1a73e8"/>
            </svg>
            <span className="text-2xl font-semibold text-gray-800 tracking-tight">
              Calendar
            </span>
          </div>

          {/* Heading */}
          <div className="mb-10">
            <h2 className="text-4xl font-semibold text-gray-900 tracking-tight leading-tight">
              Create your account
            </h2>
            <p className="text-gray-500 mt-2 text-base">
              Get started in seconds — free, no credit card required.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100"
              >
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full border border-gray-300 rounded-xl pl-11 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-xl pl-11 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-xs text-[#1a73e8] hover:text-[#1557b0] font-medium focus:outline-none focus-visible:underline"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full border border-gray-300 rounded-xl pl-11 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white py-3.5 rounded-xl text-base font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-sm text-gray-500 mt-10 text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-[#1a73e8] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}