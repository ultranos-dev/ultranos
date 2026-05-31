'use client'

import { useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import {
  LayoutGrid,
  Scan,
  FileText,
  List,
  Clock,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Settings,
  Package,
  PackageCheck,
  BookOpen,
  Users,
  UserPlus,
  ClipboardCheck,
  Share2,
  BarChart3,
  Receipt,
  Banknote,
} from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSyncStore } from '@/stores/sync-store'
import { SyncPulse } from './pharmacy/SyncPulse'
import { SyncCapacityBanner } from './pharmacy/SyncCapacityBanner'
import { SessionExpiryBanner } from './pharmacy/SessionExpiryBanner'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { stopSyncDrain } from '@/lib/sync-drain-init'
import { stopKrlSync } from '@/lib/krl-sync-worker'
import { stopAuditDrain } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useExpiryWatchdog } from '@/hooks/useExpiryWatchdog'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

const icons = {
  dashboard: <LayoutGrid size={20} />,
  scan: <Scan size={20} />,
  paperRx: <FileText size={20} />,
  queue: <List size={20} />,
  history: <Clock size={20} />,
  controlled: <ShieldAlert size={20} />,
  unverified: <AlertTriangle size={20} />,
  sync: <RefreshCw size={20} />,
  settings: <Settings size={20} />,
  inventory: <Package size={20} />,
  receive: <PackageCheck size={20} />,
  catalog: <BookOpen size={20} />,
  pos: <Receipt size={20} />,
  cashDrawer: <Banknote size={20} />,
  accounts: <Users size={20} />,
  suppliers: <UserPlus size={20} />,
  stockCount: <ClipboardCheck size={20} />,
  transfers: <Share2 size={20} />,
  reports: <BarChart3 size={20} />,
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
  useKeyboardShortcuts()
  useCatalogSync()
  useExpiryWatchdog()

  const handleSignOut = useCallback(async () => {
    encryptionKeyStore.wipe()
    stopSyncDrain()
    stopKrlSync()
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
    // Inventory group
    { label: t('stockOverview'), href: '/inventory', icon: icons.inventory, active: pathname === '/inventory', group: 'inventory' },
    { label: t('receiveStock'), href: '/inventory/receive', icon: icons.receive, active: pathname === '/inventory/receive', group: 'inventory' },
    { label: t('catalog'), href: '/inventory/catalog', icon: icons.catalog, active: pathname === '/inventory/catalog', group: 'inventory' },
    { label: t('suppliers'), href: '/inventory/suppliers', icon: icons.suppliers, active: pathname === '/inventory/suppliers', group: 'inventory' },
    { label: t('stockCount'), href: '/inventory/count', icon: icons.stockCount, active: pathname === '/inventory/count', group: 'inventory' },
    { label: t('transfers'), href: '/inventory/transfers', icon: icons.transfers, active: pathname === '/inventory/transfers', group: 'inventory' },
    // Financial group
    { label: t('pos'), href: '/pos', icon: icons.pos, active: pathname === '/pos', group: 'financial' },
    { label: t('cashDrawer'), href: '/pos/cash-drawer', icon: icons.cashDrawer, active: pathname === '/pos/cash-drawer', group: 'financial' },
    { label: t('patientAccounts'), href: '/pos/accounts', icon: icons.accounts, active: pathname === '/pos/accounts', group: 'financial' },
    // Clinical group
    { label: t('controlled'), href: '/controlled', icon: icons.controlled, active: pathname === '/controlled', group: 'clinical' },
    { label: t('unverified'), href: '/unverified', icon: icons.unverified, active: pathname === '/unverified', group: 'clinical' },
    // System group
    { label: t('reports'), href: '/reports', icon: icons.reports, active: pathname === '/reports', group: 'system' },
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
      languageSelector={(collapsed: boolean) => <LanguageSelectorClient collapsed={collapsed} />}
      persistKey="pharmacy-lite-sidebar-collapsed"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
      >
        Skip to content
      </a>
      <main id="main-content" className="px-4 py-6 sm:px-6 lg:px-8">
        <SyncCapacityBanner />
        <SessionExpiryBanner />
        {children}
      </main>
    </Sidebar>
  )
}
