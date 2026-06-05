'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useTheme } from '@/components/ThemeProvider'
import { getDirection } from '@ultranos/ui-kit'
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Moon,
  Sun,
  Globe,
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

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
  { code: 'ps', nativeLabel: 'پښتو' },
]

const ARABIC_FONT_STYLE = { fontFamily: 'var(--font-family-sans-ar)' } as const

export function NavUser() {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const email = useAuthSessionStore((s) => s.session?.email ?? '')
  const locale = useLocale() as SupportedLocale
  const router = useRouter()

  const initials = email
    ? (email.split('@')[0] ?? '').slice(0, 2).toUpperCase()
    : 'AD'

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router],
  )

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
                  <span className="truncate font-semibold">{email}</span>
                  <span className="truncate text-xs text-muted-foreground">Administrator</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="mr-2 size-4" /> : <Sun className="mr-2 size-4" />}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground font-normal">
              <Globe className="size-3.5" />
              Language
            </DropdownMenuLabel>
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onSelect={() => setLocale(lang.code)}
                className={locale === lang.code ? 'font-medium text-primary' : undefined}
              >
                <span
                  lang={lang.code}
                  style={getDirection(lang.code) === 'rtl' ? ARABIC_FONT_STYLE : undefined}
                >
                  {lang.nativeLabel}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
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
