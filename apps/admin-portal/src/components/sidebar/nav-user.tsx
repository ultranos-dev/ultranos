'use client'

import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useTheme } from '@/components/ThemeProvider'
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
import { SessionTimer } from '@/components/SessionTimer'

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const email = useAuthSessionStore((s) => s.session?.email ?? '')

  const initials = email
    ? (email.split('@')[0] ?? '').slice(0, 2).toUpperCase()
    : 'AD'

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
              <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{email}</span>
                <SessionTimer />
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
                <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{email}</span>
                  <span className="truncate text-xs text-muted-foreground">Administrator</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="me-2 size-4" /> : <Sun className="me-2 size-4" />}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
