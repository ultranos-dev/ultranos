'use client'

import { ChevronsUpDown, LogOut, Moon, Sun } from '@ultranos/ui-kit/icons'
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
import { useTheme } from '@/components/ThemeProvider'
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

interface NavLabUserProps {
  name: string
  email: string | undefined
  role: string
  initials: string
  onSignOut: () => void
}

export function NavLabUser({ name, email, role, initials, onSignOut }: NavLabUserProps) {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()

  return (
    <SidebarMenu>
      {/* Sync indicators — hidden when sidebar is collapsed to icon mode */}
      <SidebarMenuItem>
        <div className="flex items-center gap-1.5 px-2 py-1 group-data-[collapsible=icon]:hidden">
          <OnlineStatusIndicator />
          <div className="ms-auto shrink-0">
            <LanguageSelectorClient collapsed={true} />
          </div>
        </div>
      </SidebarMenuItem>

      {/* User dropdown */}
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  {email && (
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  )}
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={onSignOut}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
