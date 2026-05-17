'use client'

import { useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AppShell, type NavItem } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { SyncPulse } from './pharmacy/SyncPulse'
import { SyncCapacityBanner } from './pharmacy/SyncCapacityBanner'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { stopAuditDrain } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export function AppShellWrapper({ children }: { children: ReactNode }) {
  const session = useAuthSessionStore((s) => s.session)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const pathname = usePathname()

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

  // Don't render AppShell on login page
  if (!isAuthenticated || !session || pathname === '/login') {
    return <>{children}</>
  }

  const navItems: NavItem[] = [
    { label: 'Home', href: '/', active: pathname === '/' },
    { label: 'Scan', href: '/scan', active: pathname === '/scan' },
    { label: 'Queue', href: '/queue', active: pathname === '/queue' },
    { label: 'History', href: '/history', active: pathname === '/history' },
    { label: 'Sync', href: '/sync', active: pathname === '/sync' },
  ]

  const initials = session.email
    ? session.email
        .split('@')[0]!
        .split(/[._-]/)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .slice(0, 2)
        .join('')
    : '??'

  return (
    <AppShell
      appName="Pharmacy Lite"
      navItems={navItems}
      user={{
        name: session.name || session.email?.split('@')[0] || 'Pharmacist',
        email: session.email,
        role: session.role,
        initials,
      }}
      onSignOut={handleSignOut}
      syncIndicator={<SyncPulse />}
      settingsHref="/settings"
    >
      <main className="mx-auto max-w-2xl px-4 py-6">
        <SyncCapacityBanner />
        {children}
      </main>
    </AppShell>
  )
}
