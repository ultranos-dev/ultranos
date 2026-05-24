'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

// Inline SVG icons — no icon library (matches codebase pattern)
const icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  upload: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  userPlus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v4l3 3" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  queue: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
} as const

/** Hook to count pending + failed items in the Dexie upload queue. */
function useQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function check() {
      try {
        const db = getDb()
        const c = await db.uploadQueue
          .where('status')
          .anyOf(['pending', 'failed'])
          .count()
        if (active) setCount(c > 0 ? c : null)
      } catch {
        // Dexie unavailable — no badge
      }
    }

    check()
    // Re-check every 10 seconds
    const interval = setInterval(check, 10_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return count
}

export function AppSidebar({ children }: { children: ReactNode }) {
  const session = useAuthSessionStore((s) => s.session)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const queueBadge = useQueueBadge()

  const handleSignOut = useCallback(async () => {
    useAuthSessionStore.getState().clearSession()
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }, [])

  // Don't render sidebar on login or offline pages
  if (
    !isAuthenticated ||
    !session ||
    pathname === '/login' ||
    pathname === '/offline'
  ) {
    return <>{children}</>
  }

  const navItems: SidebarNavItem[] = [
    // Primary
    { label: t('dashboard'), href: '/', icon: icons.dashboard, active: pathname === '/', group: 'primary' },
    { label: t('upload'), href: '/upload', icon: icons.upload, active: pathname === '/upload', group: 'primary' },
    { label: t('registerPatient'), href: '/patients/register', icon: icons.userPlus, active: pathname === '/patients/register', group: 'primary' },
    // Clinical
    { label: t('history'), href: '/history', icon: icons.history, active: pathname === '/history', group: 'clinical' },
    { label: t('queue'), href: '/queue', icon: icons.queue, active: pathname === '/queue', badge: queueBadge, group: 'clinical' },
    // System
    { label: t('notifications'), href: '/notifications', icon: icons.bell, active: pathname === '/notifications', group: 'system' },
    { label: t('settings'), href: '/settings', icon: icons.settings, active: pathname === '/settings', group: 'system' },
  ]

  const displayName = session.email?.split('@')[0] || 'Technician'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <Sidebar
      appName="Lab Lite"
      navItems={navItems}
      user={{
        name: displayName,
        email: session.email,
        role: session.role,
        initials,
      }}
      onSignOut={handleSignOut}
      syncIndicator={<OnlineStatusIndicator />}
      languageSelector={<LanguageSelectorClient />}
      persistKey="lab-lite-sidebar-collapsed"
    >
      {children}
    </Sidebar>
  )
}
