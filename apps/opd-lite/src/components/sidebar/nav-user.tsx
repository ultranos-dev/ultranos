// apps/opd-lite/src/components/sidebar/nav-user.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/ThemeProvider'
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
import { getHubTrpcUrl } from '@/lib/hub-url'
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Moon,
  Sun,
} from '@ultranos/ui-kit/icons'
import { useLocale } from 'next-intl'
import { formatUserRole, getDirection } from '@ultranos/ui-kit'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import Link from 'next/link'

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const session = useAuthSessionStore((s) => s.session)
  const locale = useLocale()
  const isRtl = getDirection(locale) === 'rtl'

  const email = session?.email ?? ''
  const name = session?.name || email.split('@')[0] || 'Clinician'
  const role = session?.role ?? ''
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)

  // Load the signed-in clinician's avatar for the sidebar. Falls back to initials.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sess } = await getSupabaseBrowserClient().auth.getSession()
        const token = sess.session?.access_token
        if (!token) return
        const input = encodeURIComponent(JSON.stringify({ json: {} }))
        const res = await fetch(`${getHubTrpcUrl()}/users.getProfile?input=${input}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const body = (await res.json()) as { result?: { data?: { json?: { avatarUrl?: string | null } } } }
        const key = body?.result?.data?.json?.avatarUrl
        if (!key) return
        const { data } = await getSupabaseBrowserClient().storage.from('staff-photos').createSignedUrl(key, 3600)
        if (!cancelled && data?.signedUrl) setAvatarSrc(data.signedUrl)
      } catch {
        // Non-blocking — falls back to the initials avatar
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSignOut = useCallback(async () => {
    // Clear PHI stores first (order matters — PHI before keys before auth)
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

    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }, [])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar src={avatarSrc} name={name} size={32} className="shrink-0" />
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
              </div>
              <ChevronsUpDown className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            side={isMobile ? 'top' : isRtl ? 'left' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                <Avatar src={avatarSrc} name={name} size={32} className="shrink-0" />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'light' ? (
                <Moon className="me-2 size-4" />
              ) : (
                <Sun className="me-2 size-4" />
              )}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="me-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={handleSignOut}
            >
              <LogOut className="me-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
