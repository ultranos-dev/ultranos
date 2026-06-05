'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutGrid,
  Upload,
  UserPlus,
  UserCheck,
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
  Network,
  FileText,
  FlaskConical,
  Microscope,
  RefreshCw,
  TrendingUp,
  Award,
  Wrench,
  Trophy,
} from '@ultranos/ui-kit/icons'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavLab } from '@/components/sidebar/NavLab'
import { NavLabUser } from '@/components/sidebar/NavLabUser'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { getPendingAuthorizationCount } from '@/lib/db'
import { usePendingHandovers } from '@/hooks/usePendingHandovers'
import type { SidebarNavItem } from '@ultranos/ui-kit'

// ── Badge hooks ───────────────────────────────────────────────────────────────

function useQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.uploadQueue.where('status').anyOf(['pending', 'failed']).count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

function usePatientQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.table('queueEntries').where('status').equals('waiting').count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

function useAuthorizationQueueBadge(labRole: LabRole | null): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!labRole || !canAccessAuthorizationQueue(labRole)) return
    let active = true
    async function check() {
      try {
        const c = await getPendingAuthorizationCount()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [labRole])
  return count
}

function useOrdersBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.orders.where('status').equals('RECEIVED').count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const session = useAuthSessionStore((s) => s.session)
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

  const canAccessNetwork =
    session?.labRole === LabRole.LAB_MANAGER || session?.labRole === LabRole.SUPERVISOR
  const canAccessCostAnalysis = session?.labRole === LabRole.LAB_MANAGER
  const canAccessAuth = session?.labRole
    ? canAccessAuthorizationQueue(session.labRole as LabRole)
    : false

  const navItems: SidebarNavItem[] = [
    // Primary
    { label: t('dashboard'), href: '/', icon: <LayoutGrid size={20} />, active: pathname === '/', group: 'primary' },
    { label: t('orders'), href: '/orders', icon: <ClipboardList size={20} />, active: pathname === '/orders', badge: ordersBadge, group: 'primary' },
    { label: t('worklist'), href: '/worklist', icon: <ClipboardList size={20} />, active: pathname === '/worklist', group: 'primary' },
    { label: t('upload'), href: '/upload', icon: <Upload size={20} />, active: pathname === '/upload', badge: uploadQueueBadge, group: 'primary' },
    { label: t('reports'), href: '/reports', icon: <FileText size={20} />, active: pathname.startsWith('/reports') && pathname !== '/reports/daily', group: 'primary' },
    { label: t('dailyLog'), href: '/reports/daily', icon: <FileText size={20} />, active: pathname === '/reports/daily', group: 'primary' },
    { label: t('registerPatient'), href: '/patients/register', icon: <UserPlus size={20} />, active: pathname === '/patients/register', group: 'primary' },
    // Clinical
    { label: t('history'), href: '/history', icon: <History size={20} />, active: pathname === '/history', group: 'clinical' },
    { label: t('queue'), href: '/queue', icon: <ListOrdered size={20} />, active: pathname.startsWith('/queue'), badge: patientQueueBadge, group: 'clinical' },
    { label: t('consent'), href: '/consent', icon: <ShieldCheck size={20} />, active: pathname === '/consent', group: 'clinical' },
    { label: t('sops'), href: '/sops', icon: <BookOpen size={20} />, active: pathname === '/sops', group: 'clinical' },
    { label: t('visualAtlas'), href: '/atlas', icon: <Microscope size={20} />, active: pathname.startsWith('/atlas'), group: 'clinical' },
    { label: t('peerNetwork'), href: '/peer-network', icon: <MessageCircle size={20} />, active: pathname === '/peer-network', group: 'clinical' },
    { label: t('safetyReporting'), href: '/safety-reporting', icon: <AlertTriangle size={20} />, active: pathname === '/safety-reporting', group: 'clinical' },
    { label: t('equipment'), href: '/equipment', icon: <Wrench size={20} />, active: pathname.startsWith('/equipment'), group: 'clinical' },
    { label: t('shiftHandover'), href: '/shift-handover', icon: <RefreshCw size={20} />, active: pathname.startsWith('/shift-handover'), badge: handoverBadge, group: 'clinical' },
    { label: t('qualityDashboard'), href: '/quality', icon: <TrendingUp size={20} />, active: pathname.startsWith('/quality'), group: 'clinical' },
    { label: t('teamAchievements'), href: '/achievements', icon: <Trophy size={20} />, active: pathname.startsWith('/achievements'), group: 'clinical' },
    { label: t('certification'), href: '/certification', icon: <Award size={20} />, active: pathname.startsWith('/certification'), group: 'clinical' },
    { label: t('mentorship'), href: '/mentorship', icon: <UserCheck size={20} />, active: pathname.startsWith('/mentorship'), group: 'clinical' as const },
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
    ...(canAccessAuth
      ? [{ label: t('authorizationQueue'), href: '/authorization', icon: <ClipboardCheck size={20} />, active: pathname.startsWith('/authorization'), badge: authQueueBadge, group: 'clinical' as const }]
      : []),
    // System
    { label: t('notifications'), href: '/notifications', icon: <Bell size={20} />, active: pathname === '/notifications', group: 'system' },
    ...(canAccessNetwork
      ? [
          { label: t('readinessBoard'), href: '/readiness', icon: <BarChart3 size={20} />, active: pathname.startsWith('/readiness'), group: 'system' as const },
          { label: t('network'), href: '/network', icon: <Globe size={20} />, active: pathname.startsWith('/network'), group: 'system' as const },
          { label: t('networkInventory'), href: '/inventory/network', icon: <Network size={20} />, active: pathname.startsWith('/inventory/network'), group: 'system' as const },
        ]
      : []),
    { label: t('settings'), href: '/settings', icon: <Settings size={20} />, active: pathname === '/settings', group: 'system' },
  ]

  const displayName = session?.email?.split('@')[0] ?? 'Technician'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-2">
        <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          Lab Lite
        </span>
      </SidebarHeader>
      <SidebarContent>
        <NavLab items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavLabUser
          name={displayName}
          email={session?.email}
          role={session?.role ?? ''}
          initials={initials}
          onSignOut={handleSignOut}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
