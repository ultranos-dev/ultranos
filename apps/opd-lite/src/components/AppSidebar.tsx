'use client'

import { useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEncounterStore } from '@/stores/encounter-store'
import { useVitalsStore } from '@/stores/vitals-store'
import { useDiagnosisStore } from '@/stores/diagnosis-store'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { useAllergyStore } from '@/stores/allergy-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { clearSigningKeys } from '@/lib/signing-key-store'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { SyncPulse } from '@/components/SyncPulse'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { useNavBadges } from '@/hooks/useNavBadges'
import {
  LayoutGrid,
  Calendar,
  Users,
  UserPlus,
  Bell,
  AlertTriangle,
  UserSearch,
  FileWarning,
  Shield,
  Settings,
} from '@ultranos/ui-kit/icons'

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')
}

export function AppSidebar({ children }: { children: ReactNode }) {
  const session = useAuthSessionStore((s) => s.session)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const badges = useNavBadges()

  const handleSignOut = useCallback(async () => {
    // Clear PHI stores (order matters — PHI before keys before auth)
    useEncounterStore.getState().clearPhiState()
    useVitalsStore.getState().clearPhiState()
    useDiagnosisStore.getState().clearPhiState()
    useSoapNoteStore.getState().clearPhiState()
    usePrescriptionStore.getState().clearPhiState()
    useAllergyStore.getState().clearPhiState()

    auditPhiAccess(AuditAction.LOGOUT, AuditResourceType.USER_ACCOUNT, 'user-logout')
    await clearPhiTables()

    encryptionKeyStore.wipe()
    clearSigningKeys()
    useAuthSessionStore.getState().clearSession()

    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }, [])

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname === '/login') {
    return <>{children}</>
  }

  const navItems: SidebarNavItem[] = [
    { label: t('dashboard'), href: '/', icon: <LayoutGrid size={20} />, active: pathname === '/', group: 'core' },
    { label: t('appointments'), href: '/appointments', icon: <Calendar size={20} />, active: pathname === '/appointments', badge: badges.todayAppointments, group: 'core' },
    { label: t('patients'), href: '/patients', icon: <Users size={20} />, active: pathname === '/patients', group: 'core' },
    { label: t('registerPatient'), href: '/register-patient', icon: <UserPlus size={20} />, active: pathname === '/register-patient', group: 'core' },
    { label: t('notifications'), href: '/notifications', icon: <Bell size={20} />, active: pathname === '/notifications', badge: badges.notifications, group: 'clinical' },
    { label: t('conflicts'), href: '/conflicts', icon: <AlertTriangle size={20} />, active: pathname === '/conflicts', badge: badges.conflicts, group: 'clinical' },
    { label: t('duplicateReviews'), href: '/duplicate-review', icon: <UserSearch size={20} />, active: pathname === '/duplicate-review', badge: badges.duplicateReviews, group: 'clinical' },
    { label: t('expiringConsents'), href: '/expiring-consents', icon: <FileWarning size={20} />, active: pathname === '/expiring-consents', badge: badges.expiringConsents, group: 'clinical' },
    { label: t('kyc'), href: '/kyc', icon: <Shield size={20} />, active: pathname === '/kyc', group: 'admin' },
    { label: t('settings'), href: '/settings', icon: <Settings size={20} />, active: pathname === '/settings', group: 'system' },
  ]

  // session.name is used in UserDropdown.tsx — field exists at runtime but
  // is not yet declared in the AuthSession interface (pre-existing gap).
  const displayName =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).name as string | undefined ||
    session.email?.split('@')[0] ||
    'Clinician'
  const initials = getInitials(displayName)

  return (
    <Sidebar
      appName="OPD Lite"
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
      persistKey="opd-lite-sidebar-collapsed"
    >
      {children}
    </Sidebar>
  )
}
