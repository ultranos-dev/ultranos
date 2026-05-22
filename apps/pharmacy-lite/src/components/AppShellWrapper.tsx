'use client'

import { useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSyncStore } from '@/stores/sync-store'
import { SyncPulse } from './pharmacy/SyncPulse'
import { SyncCapacityBanner } from './pharmacy/SyncCapacityBanner'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { stopAuditDrain } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'

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
  scan: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  ),
  paperRx: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  controlled: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  unverified: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  sync: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
} as const

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')
}

export function AppShellWrapper({ children }: { children: ReactNode }) {
  const session = useAuthSessionStore((s) => s.session)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const failedCount = useSyncStore((s) => s.failedCount)

  const handleSignOut = useCallback(async () => {
    encryptionKeyStore.wipe()
    stopAuditDrain()
    useAuthSessionStore.getState().clearSession()
    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }, [])

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname === '/login') {
    return <>{children}</>
  }

  const navItems: SidebarNavItem[] = [
    // Primary group
    { label: t('dashboard'), href: '/', icon: icons.dashboard, active: pathname === '/', group: 'primary' },
    { label: t('scanRx'), href: '/scan', icon: icons.scan, active: pathname === '/scan', group: 'primary' },
    { label: t('paperRx'), href: '/paper-rx', icon: icons.paperRx, active: pathname === '/paper-rx', group: 'primary' },
    { label: t('queue'), href: '/queue', icon: icons.queue, active: pathname === '/queue', badge: pendingCount || null, group: 'primary' },
    { label: t('history'), href: '/history', icon: icons.history, active: pathname === '/history', group: 'primary' },
    // Clinical group
    { label: t('controlled'), href: '/controlled', icon: icons.controlled, active: pathname === '/controlled', group: 'clinical' },
    { label: t('unverified'), href: '/unverified', icon: icons.unverified, active: pathname === '/unverified', group: 'clinical' },
    // System group
    { label: t('syncQueue'), href: '/sync', icon: icons.sync, active: pathname === '/sync', badge: failedCount || null, group: 'system' },
    { label: t('settings'), href: '/settings', icon: icons.settings, active: pathname === '/settings', group: 'system' },
  ]

  const displayName = session.name || session.email?.split('@')[0] || 'Pharmacist'
  const initials = getInitials(displayName)

  return (
    <Sidebar
      appName="Pharmacy Lite"
      navItems={navItems}
      user={{
        name: displayName,
        email: session.email,
        role: session.role,
        initials,
      }}
      onSignOut={handleSignOut}
      syncIndicator={<SyncPulse />}
      persistKey="pharmacy-lite-sidebar-collapsed"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
      >
        Skip to content
      </a>
      <main id="main-content" className="mx-auto max-w-2xl px-4 py-6">
        <SyncCapacityBanner />
        {children}
      </main>
    </Sidebar>
  )
}
