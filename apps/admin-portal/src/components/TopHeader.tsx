'use client'

import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useState } from 'react'
import Link from 'next/link'
import { Search, Bell, Moon, Sun } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/button'

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-8">
      {/* Left: page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <Button variant="outline" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>

        {/* Notifications placeholder */}
        <Button variant="outline" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>

        {/* Date */}
        <span className="hidden lg:block text-sm text-muted-foreground">{dateStr}</span>

        {/* User avatar */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20"
            aria-label="User menu"
          >
            {initials}
          </Button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl border border-border bg-popover p-2 shadow-card">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{email}</p>
                  <p className="text-xs text-muted-foreground">Administrator</p>
                </div>
                <div className="my-1 border-t border-border" />
                <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl" asChild>
                  <Link href="/settings">
                    Settings
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start rounded-xl px-3 py-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
