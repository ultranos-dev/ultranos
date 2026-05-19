'use client'

import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useState } from 'react'

interface TopHeaderProps {
  title: string
  description?: string
}

export function TopHeader({ title, description }: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const email = useAuthSessionStore((s) => s.session?.email ?? '')
  const [showUserMenu, setShowUserMenu] = useState(false)

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : 'AD'

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

  async function handleSignOut() {
    useAuthSessionStore.getState().clearSession()
    setAccessToken(null)
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface px-8">
      {/* Left: page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label="Search"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Notifications placeholder */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label="Notifications"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06Z" />
            </svg>
          )}
        </button>

        {/* Date */}
        <span className="hidden lg:block text-sm text-text-secondary">{dateStr}</span>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent text-xs font-semibold hover:bg-accent/20 transition-colors duration-200"
            aria-label="User menu"
          >
            {initials}
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl border border-border bg-surface-raised p-2 shadow-card">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-text-primary">{email}</p>
                  <p className="text-xs text-text-secondary">Administrator</p>
                </div>
                <div className="my-1 border-t border-border" />
                <a href="/settings" className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors">
                  Settings
                </a>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger-subtle transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
