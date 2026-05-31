'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import {
  LayoutGrid,
  Upload,
  UserPlus,
  History,
  ListOrdered,
  Bell,
  Settings,
  ClipboardList,
  ClipboardCheck,
  Banknote,
  Receipt,
  Scale,
  ShieldCheck,
  BookOpen,
  MessageCircle,
  AlertTriangle,
  BarChart3,
  Calculator,
  Globe,
  FlaskConical,
  Microscope,
  RefreshCw,
} from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { getPendingAuthorizationCount } from '@/lib/db'
import { usePendingHandovers } from '@/hooks/usePendingHandovers'

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
  const { pendingHandovers } = usePendingHandovers()
  const handoverBadge = pendingHandovers.length > 0 ? pendingHandovers.length : null

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
    { label: t('dashboard'), href: '/', icon: <LayoutGrid size={20} />, active: pathname === '/', group: 'primary' },
    { label: t('orders'), href: '/orders', icon: <ClipboardList size={20} />, active: pathname === '/orders', badge: ordersBadge, group: 'primary' },
    { label: t('worklist'), href: '/worklist', icon: <ClipboardList size={20} />, active: pathname === '/worklist', group: 'primary' },
    { label: t('upload'), href: '/upload', icon: <Upload size={20} />, active: pathname === '/upload', badge: uploadQueueBadge, group: 'primary' },
    { label: t('registerPatient'), href: '/patients/register', icon: <UserPlus size={20} />, active: pathname === '/patients/register', group: 'primary' },
    // Clinical
    { label: t('history'), href: '/history', icon: <History size={20} />, active: pathname === '/history', group: 'clinical' },
    { label: t('queue'), href: '/queue', icon: <ListOrdered size={20} />, active: pathname.startsWith('/queue'), badge: patientQueueBadge, group: 'clinical' },
    { label: t('consent'), href: '/consent', icon: <ShieldCheck size={20} />, active: pathname === '/consent', group: 'clinical' },
    { label: t('sops'), href: '/sops', icon: <BookOpen size={20} />, active: pathname === '/sops', group: 'clinical' },
    { label: t('visualAtlas'), href: '/atlas', icon: <Microscope size={20} />, active: pathname.startsWith('/atlas'), group: 'clinical' },
    { label: t('peerNetwork'), href: '/peer-network', icon: <MessageCircle size={20} />, active: pathname === '/peer-network', group: 'clinical' },
    { label: t('safetyReporting'), href: '/safety-reporting', icon: <AlertTriangle size={20} />, active: pathname === '/safety-reporting', group: 'clinical' },
    { label: t('shiftHandover'), href: '/shift-handover', icon: <RefreshCw size={20} />, active: pathname.startsWith('/shift-handover'), badge: handoverBadge, group: 'clinical' },
    // Finance
    { label: t('newPayment'), href: '/finance/payment', icon: <Banknote size={20} />, active: pathname === '/finance/payment', group: 'finance' },
    { label: t('receipts'), href: '/finance/receipts', icon: <Receipt size={20} />, active: pathname === '/finance/receipts', group: 'finance' },
    { label: t('reconciliation'), href: '/finance/reconciliation', icon: <Scale size={20} />, active: pathname === '/finance/reconciliation', group: 'finance' },
    { label: t('reagents'), href: '/finance/reagents', icon: <FlaskConical size={20} />, active: pathname.startsWith('/finance/reagents'), group: 'finance' },
    ...(canAccessCostAnalysis
      ? [
          { label: t('costAnalysis'), href: '/finance/cost-analysis', icon: <BarChart3 size={20} />, active: pathname === '/finance/cost-analysis', group: 'finance' as const },
          { label: t('costSettings'), href: '/finance/cost-settings', icon: <Calculator size={20} />, active: pathname === '/finance/cost-settings', group: 'finance' as const },
        ]
      : []),
    // Authorization queue — clinical group, only for authorized roles
    ...(canAccessAuth
      ? [{ label: t('authorizationQueue'), href: '/authorization', icon: <ClipboardCheck size={20} />, active: pathname.startsWith('/authorization'), badge: authQueueBadge, group: 'clinical' as const }]
      : []),
    // System
    { label: t('notifications'), href: '/notifications', icon: <Bell size={20} />, active: pathname === '/notifications', group: 'system' },
    ...(canAccessNetwork
      ? [{ label: t('network'), href: '/network', icon: <Globe size={20} />, active: pathname.startsWith('/network'), group: 'system' as const }]
      : []),
    { label: t('settings'), href: '/settings', icon: <Settings size={20} />, active: pathname === '/settings', group: 'system' },
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
