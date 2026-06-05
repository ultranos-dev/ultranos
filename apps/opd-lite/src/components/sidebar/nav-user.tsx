// apps/opd-lite/src/components/sidebar/nav-user.tsx
'use client'

import { useCallback } from 'react'
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
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Moon,
  Sun,
} from '@ultranos/ui-kit/icons'
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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')
}

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const session = useAuthSessionStore((s) => s.session)

  const displayName =
    (session as { name?: string } | null)?.name ??
    session?.email?.split('@')[0] ??
    'Clinician'
  const email = session?.email ?? ''
  const role = session?.role ?? 'clinician'
  const initials = getInitials(displayName)

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
              <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {role}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'light' ? (
                <Moon className="mr-2 size-4" />
              ) : (
                <Sun className="mr-2 size-4" />
              )}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
