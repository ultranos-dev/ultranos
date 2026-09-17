'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { stopSyncDrain } from '@/lib/sync-drain-init'
import { stopKrlSync } from '@/lib/krl-sync-worker'
import { stopAuditDrain } from '@/lib/audit'
import { clearPhiTables, purgeSyncedQueueEntries } from '@/lib/phi-cleanup'
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
import { formatUserRole } from '@ultranos/ui-kit'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { getHubApiUrl } from '@/lib/trpc'

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const session = useAuthSessionStore((s) => s.session)

  const email = session?.email ?? ''
  const name = session?.name || email.split('@')[0] || 'Pharmacist'
  const role = session?.role ?? ''
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)

  // Load the signed-in pharmacist's avatar for the sidebar. Falls back to initials.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sess } = await getSupabaseBrowserClient().auth.getSession()
        const token = sess.session?.access_token
        if (!token) return
        const input = encodeURIComponent(JSON.stringify({ json: {} }))
        const res = await fetch(`${getHubApiUrl()}/users.getProfile?input=${input}`, {
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
    // PHI cleanup order: stores → tables → key → auth → redirect
    await Promise.all([clearPhiTables(), purgeSyncedQueueEntries()])
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
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
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
                <Avatar src={avatarSrc} name={name} size={32} className="shrink-0" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
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
