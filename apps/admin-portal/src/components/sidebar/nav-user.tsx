'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken, trpc } from '@/lib/trpc'
import { useTheme } from '@/components/ThemeProvider'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Moon,
  Sun,
} from '@ultranos/ui-kit/icons'
import { formatUserRole } from '@ultranos/ui-kit'
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

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const session = useAuthSessionStore((s) => s.session)

  const email = session?.email ?? ''
  const name = session?.name || email.split('@')[0] || 'Admin'
  const role = session?.role ?? ''
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)

  // Load the current admin's avatar (auth-metadata key for pure admins,
  // practitioner key otherwise) and sign it for display. Falls back to initials.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const p = (await trpc.admin.getProfile.query()) as { avatarUrl?: string | null }
        if (!p?.avatarUrl) return
        const { data } = await getSupabaseBrowserClient()
          .storage.from('staff-photos')
          .createSignedUrl(p.avatarUrl, 3600)
        if (!cancelled && data?.signedUrl) setAvatarSrc(data.signedUrl)
      } catch {
        // Non-blocking — falls back to the initials avatar
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSignOut() {
    useAuthSessionStore.getState().clearSession()
    setAccessToken(null)
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }

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
              <ChevronsUpDown className="ms-auto size-4" />
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
              {theme === 'light' ? <Moon className="me-2 size-4" /> : <Sun className="me-2 size-4" />}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="me-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
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
