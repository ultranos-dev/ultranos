'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Home,
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
import { LabHeader } from '@/components/sidebar/LabHeader'
import type { LabNavGroup } from '@/components/sidebar/nav-config'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { clearPhiTables, purgeSyncedQueueEntries } from '@/lib/phi-cleanup'
import { clearSessionEncryptionKey } from '@/lib/consent-crypto'
import { stopUploadDrain } from '@/lib/upload-drain-init'
import { stopAuditDrain } from '@/lib/audit-client'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { getPendingAuthorizationCount } from '@/lib/db'
import { usePendingHandovers } from '@/hooks/usePendingHandovers'
import { isCollectionOnlyMode } from '@/lib/collection-mode'

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
  const t = useTranslations('sidebar')
  const locale = useLocale()
  const side = ['ar', 'prs', 'ps'].includes(locale) ? 'right' : 'left'
  const uploadQueueBadge = useQueueBadge()
  const ordersBadge = useOrdersBadge()
  const patientQueueBadge = usePatientQueueBadge()
  const authQueueBadge = useAuthorizationQueueBadge(session?.labRole as LabRole | null)
  const { pendingHandovers } = usePendingHandovers()
  const handoverBadge = pendingHandovers.length > 0 ? pendingHandovers.length : null

  // D7→P: collection-only mode hides restricted workflow sections
  const [isCollectionOnly, setIsCollectionOnly] = useState<boolean>(false)
  useEffect(() => {
    let cancelled = false
    isCollectionOnlyMode()
      .then((v) => { if (!cancelled) setIsCollectionOnly(v) })
      .catch(() => { /* default: full mode */ })
    return () => { cancelled = true }
  }, [])

  const handleSignOut = useCallback(async () => {
    // PHI cleanup order: tables → key → stop workers → auth → redirect
    await Promise.all([clearPhiTables(), purgeSyncedQueueEntries()])
    clearSessionEncryptionKey()
    stopUploadDrain()
    stopAuditDrain()
    useAuthSessionStore.getState().clearSession()
    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }, [])

  const canAccessNetwork =
    session?.labRole === LabRole.LAB_MANAGER || session?.labRole === LabRole.SUPERVISOR
  const canAccessCostAnalysis = session?.labRole === LabRole.LAB_MANAGER
  const canAccessAuth = session?.labRole
    ? canAccessAuthorizationQueue(session.labRole as LabRole)
    : false

  // D7→P: In collection-only mode only Dashboard, Patients, and Upload Queue are accessible.
  // All result-entry, QC, inventory, team, finance, and admin sections are restricted.
  const navGroups: LabNavGroup[] = isCollectionOnly
    ? [
        {
          title: '',
          items: [{ title: t('dashboard'), url: '/', icon: Home }],
        },
        {
          title: 'Patients',
          items: [
            { title: t('registerPatient'), url: '/patients/register', icon: UserPlus },
            { title: t('queue'), url: '/queue', icon: ListOrdered, badge: patientQueueBadge },
            { title: t('history'), url: '/history', icon: History },
            { title: t('consent'), url: '/consent', icon: ShieldCheck },
          ],
        },
        {
          title: 'Lab Workflow',
          items: [
            { title: t('upload'), url: '/upload', icon: Upload, badge: uploadQueueBadge },
          ],
        },
      ]
    : [
        {
          title: '',
          items: [
            { title: t('dashboard'), url: '/', icon: Home },
          ],
        },
        {
          title: 'Lab Workflow',
          items: [
            { title: t('orders'), url: '/orders', icon: ClipboardList, badge: ordersBadge },
            { title: t('worklist'), url: '/worklist', icon: ClipboardList },
            { title: t('upload'), url: '/upload', icon: Upload, badge: uploadQueueBadge },
            { title: t('reports'), url: '/reports', icon: FileText },
            { title: t('dailyLog'), url: '/reports/daily' },
          ],
        },
        {
          title: 'Patients',
          items: [
            { title: t('registerPatient'), url: '/patients/register', icon: UserPlus },
            { title: t('queue'), url: '/queue', icon: ListOrdered, badge: patientQueueBadge },
            { title: t('history'), url: '/history', icon: History },
            { title: t('consent'), url: '/consent', icon: ShieldCheck },
          ],
        },
        {
          title: 'Quality',
          items: [
            { title: t('qualityDashboard'), url: '/quality', icon: TrendingUp },
            { title: t('safetyReporting'), url: '/safety-reporting', icon: AlertTriangle },
            { title: t('escalations'), url: '/escalations', icon: AlertTriangle },
            { title: t('equipment'), url: '/equipment', icon: Wrench },
            { title: t('sops'), url: '/sops', icon: BookOpen },
            { title: t('visualAtlas'), url: '/atlas', icon: Microscope },
          ],
        },
        {
          title: 'Team',
          items: [
            { title: t('shiftHandover'), url: '/shift-handover', icon: RefreshCw, badge: handoverBadge },
            { title: t('portfolio'), url: '/portfolio', icon: BarChart3 },
            { title: t('mentorship'), url: '/mentorship', icon: UserCheck },
            { title: t('certification'), url: '/certification', icon: Award },
            { title: t('teamAchievements'), url: '/achievements', icon: Trophy },
            { title: t('peerNetwork'), url: '/peer-network', icon: MessageCircle },
            ...(canAccessAuth
              ? [{ title: t('authorizationQueue'), url: '/authorization', icon: ClipboardCheck, badge: authQueueBadge }]
              : []),
          ],
        },
        {
          title: 'Finance',
          items: [
            { title: t('newPayment'), url: '/finance/payment', icon: Banknote },
            { title: t('receipts'), url: '/finance/receipts', icon: Receipt },
            { title: t('reconciliation'), url: '/finance/reconciliation', icon: Scale },
            { title: t('reagents'), url: '/finance/reagents', icon: FlaskConical },
            ...(canAccessCostAnalysis
              ? [
                  { title: t('costAnalysis'), url: '/finance/cost-analysis', icon: BarChart3 },
                  { title: t('costSettings'), url: '/finance/cost-settings', icon: Calculator },
                ]
              : []),
          ],
        },
        {
          title: 'Administration',
          items: [
            { title: t('notifications'), url: '/notifications', icon: Bell },
            ...(canAccessNetwork
              ? [
                  { title: t('readinessBoard'), url: '/readiness', icon: BarChart3 },
                  { title: t('network'), url: '/network', icon: Globe },
                  { title: t('networkInventory'), url: '/inventory/network', icon: Network },
                ]
              : []),
            { title: t('settings'), url: '/settings', icon: Settings },
          ],
        },
      ]

  const displayName = session?.name || session?.email?.split('@')[0] || 'Technician'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <Sidebar collapsible="icon" side={side}>
      <SidebarHeader>
        <LabHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavLab groups={navGroups} />
      </SidebarContent>
      <SidebarFooter>
        <NavLabUser
          name={displayName}
          email={session?.email}
          role={session?.labRole ?? session?.role ?? ''}
          initials={initials}
          onSignOut={handleSignOut}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
