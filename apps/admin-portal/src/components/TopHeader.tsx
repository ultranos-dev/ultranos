'use client'

import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useState } from 'react'
import { Search, Bell, Moon, Sun } from '@ultranos/ui-kit/icons'

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
          <Search className="h-4 w-4" />
        </button>

        {/* Notifications placeholder */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
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
