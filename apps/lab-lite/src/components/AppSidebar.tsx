'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { getPendingAuthorizationCount } from '@/lib/db'

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
  clipboardList: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="8" y1="19" x2="10" y2="19" />
    </svg>
  ),
  banknote: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  ),
  receipt: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 10h8M8 14h4" />
    </svg>
  ),
  scale: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 3v18" />
      <path d="M2 7h4l2 7H4L2 7zM16 7h4l2 7h-4l-2-7z" />
    </svg>
  ),
  shieldCheck: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  bookOpen: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  messageCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  alertTriangle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  // Priority worklist — list with arrow, directional → mirrors in RTL
  worklist: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" />
      <polyline points="3 12 4 13 6 11" />
      <polyline points="3 18 4 19 6 17" />
    </svg>
  ),
  // Authorization — clipboard with checkmark; semantic icon, does NOT mirror in RTL
  authorization: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  // Bar chart — semantic icon, does NOT mirror in RTL
  barChart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  // Calculator — semantic icon, does NOT mirror in RTL
  calculator: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8" y2="10" />
      <line x1="12" y1="10" x2="12" y2="10" />
      <line x1="16" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="8" y2="14" />
      <line x1="12" y1="14" x2="12" y2="14" />
      <line x1="16" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="8" y2="18" />
      <line x1="12" y1="18" x2="12" y2="18" />
      <line x1="16" y1="18" x2="16" y2="18" />
    </svg>
  ),
  // Network/globe — semantic icon, must NOT mirror in RTL (not directional)
  network: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  // Flask — semantic lab icon, does NOT mirror in RTL
  flask: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6v7l4.5 7.5A2 2 0 0 1 17.76 21H6.24a2 2 0 0 1-1.74-3L9 10V3z" />
      <line x1="6" y1="3" x2="18" y2="3" />
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

/** Hook to count waiting patients in the patient queue. */
function usePatientQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function check() {
      try {
        const db = getDb()
        const c = await db
          .table('queueEntries')
          .where('status')
          .equals('waiting')
          .count()
        if (active) setCount(c > 0 ? c : null)
      } catch {
        // Dexie unavailable — no badge
      }
    }

    check()
    const interval = setInterval(check, 10_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return count
}

/** Hook to count PENDING authorization results (for supervisor badge). */
function useAuthorizationQueueBadge(labRole: LabRole | null): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!labRole || !canAccessAuthorizationQueue(labRole)) return

    let active = true

    async function check() {
      try {
        const c = await getPendingAuthorizationCount()
        if (active) setCount(c > 0 ? c : null)
      } catch {
        // Dexie unavailable — no badge
      }
    }

    check()
    const interval = setInterval(check, 10_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [labRole])

  return count
}

/** Hook to count RECEIVED orders (pending acknowledgement/triage). */
function useOrdersBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function check() {
      try {
        const db = getDb()
        const c = await db.orders
          .where('status')
          .equals('RECEIVED')
          .count()
        if (active) setCount(c > 0 ? c : null)
      } catch {
        // Dexie unavailable — no badge
      }
    }

    check()
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
  const uploadQueueBadge = useQueueBadge()
  const ordersBadge = useOrdersBadge()
  const patientQueueBadge = usePatientQueueBadge()
  const authQueueBadge = useAuthorizationQueueBadge(session?.labRole as LabRole | null)

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

  // Network nav is only visible to lab managers and supervisors
  const canAccessNetwork =
    session.labRole === LabRole.LAB_MANAGER || session.labRole === LabRole.SUPERVISOR

  // Cost analysis is only visible to lab managers (sensitive business info)
  const canAccessCostAnalysis = session.labRole === LabRole.LAB_MANAGER

  // Authorization queue is visible to SENIOR_TECH, SUPERVISOR, and LAB_MANAGER
  const canAccessAuth = session.labRole
    ? canAccessAuthorizationQueue(session.labRole as LabRole)
    : false

  const navItems: SidebarNavItem[] = [
    // Primary
    { label: t('dashboard'), href: '/', icon: icons.dashboard, active: pathname === '/', group: 'primary' },
    { label: t('orders'), href: '/orders', icon: icons.clipboardList, active: pathname === '/orders', badge: ordersBadge, group: 'primary' },
    { label: t('worklist'), href: '/worklist', icon: icons.worklist, active: pathname === '/worklist', group: 'primary' },
    { label: t('upload'), href: '/upload', icon: icons.upload, active: pathname === '/upload', badge: uploadQueueBadge, group: 'primary' },
    { label: t('registerPatient'), href: '/patients/register', icon: icons.userPlus, active: pathname === '/patients/register', group: 'primary' },
    // Clinical
    { label: t('history'), href: '/history', icon: icons.history, active: pathname === '/history', group: 'clinical' },
    { label: t('queue'), href: '/queue', icon: icons.queue, active: pathname.startsWith('/queue'), badge: patientQueueBadge, group: 'clinical' },
    { label: t('consent'), href: '/consent', icon: icons.shieldCheck, active: pathname === '/consent', group: 'clinical' },
    { label: t('sops'), href: '/sops', icon: icons.bookOpen, active: pathname === '/sops', group: 'clinical' },
    { label: t('peerNetwork'), href: '/peer-network', icon: icons.messageCircle, active: pathname === '/peer-network', group: 'clinical' },
    { label: t('safetyReporting'), href: '/safety-reporting', icon: icons.alertTriangle, active: pathname === '/safety-reporting', group: 'clinical' },
    // Finance
    { label: t('newPayment'), href: '/finance/payment', icon: icons.banknote, active: pathname === '/finance/payment', group: 'finance' },
    { label: t('receipts'), href: '/finance/receipts', icon: icons.receipt, active: pathname === '/finance/receipts', group: 'finance' },
    { label: t('reconciliation'), href: '/finance/reconciliation', icon: icons.scale, active: pathname === '/finance/reconciliation', group: 'finance' },
    { label: t('reagents'), href: '/finance/reagents', icon: icons.flask, active: pathname.startsWith('/finance/reagents'), group: 'finance' },
    ...(canAccessCostAnalysis
      ? [
          { label: t('costAnalysis'), href: '/finance/cost-analysis', icon: icons.barChart, active: pathname === '/finance/cost-analysis', group: 'finance' as const },
          { label: t('costSettings'), href: '/finance/cost-settings', icon: icons.calculator, active: pathname === '/finance/cost-settings', group: 'finance' as const },
        ]
      : []),
    // Authorization queue — clinical group, only for authorized roles
    ...(canAccessAuth
      ? [{ label: t('authorizationQueue'), href: '/authorization', icon: icons.authorization, active: pathname.startsWith('/authorization'), badge: authQueueBadge, group: 'clinical' as const }]
      : []),
    // System
    { label: t('notifications'), href: '/notifications', icon: icons.bell, active: pathname === '/notifications', group: 'system' },
    ...(canAccessNetwork
      ? [{ label: t('network'), href: '/network', icon: icons.network, active: pathname.startsWith('/network'), group: 'system' as const }]
      : []),
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
      syncIndicator={
        <>
          <OnlineStatusIndicator />
          <DataBudgetIndicator />
        </>
      }
      languageSelector={(collapsed: boolean) => <LanguageSelectorClient collapsed={collapsed} />}
      persistKey="lab-lite-sidebar-collapsed"
    >
      {children}
    </Sidebar>
  )
}
