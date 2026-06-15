/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('radix-ui', () => ({
  Collapsible: {
    Root: ({ children }: any) => <div>{children}</div>,
    Trigger: ({ children }: any) => <div>{children}</div>,
    Content: ({ children }: any) => <div>{children}</div>,
  },
}))

vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: any) => <span>{children}</span>,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  ChevronRight: () => <svg />,
  Home: () => <svg />,
  User: () => <svg />,
  FlaskConical: () => <svg />,
  Package: () => <svg />,
  Bell: () => <svg />,
  FileText: () => <svg />,
  Clock: () => <svg />,
  Settings: () => <svg />,
  Users: () => <svg />,
  Receipt: () => <svg />,
  Globe: () => <svg />,
  SlidersHorizontal: () => <svg />,
  FileCheck: () => <svg />,
  Cpu: () => <svg />,
  CreditCard: () => <svg />,
  Wallet: () => <svg />,
}))

vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children }: any) => <nav data-testid="sidebar">{children}</nav>,
  SidebarContent: ({ children }: any) => <div>{children}</div>,
  SidebarFooter: ({ children }: any) => <div>{children}</div>,
  SidebarHeader: ({ children }: any) => <div>{children}</div>,
  SidebarRail: () => null,
  SidebarGroup: ({ children }: any) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: any) => <span>{children}</span>,
  SidebarMenu: ({ children }: any) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: any) => <li>{children}</li>,
  SidebarMenuButton: ({ children, asChild, isActive, tooltip, ...props }: any) => <button {...props}>{children}</button>,
  SidebarMenuSub: ({ children }: any) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: any) => <li>{children}</li>,
  SidebarMenuSubButton: ({ children, asChild, isActive, ...props }: any) => <span {...props}>{children}</span>,
  SidebarProvider: ({ children }: any) => <div>{children}</div>,
  SidebarInset: ({ children }: any) => <div>{children}</div>,
  SidebarTrigger: () => null,
  useSidebar: () => ({ isMobile: false, state: 'expanded', open: true }),
}))

vi.mock('@/components/sidebar/location-switcher', () => ({
  LocationSwitcher: () => <div data-testid="location-switcher">Ultranos Admin</div>,
}))

vi.mock('@/components/sidebar/nav-user', () => ({
  NavUser: () => <div data-testid="nav-user">admin@ultranos.com</div>,
}))

const { AppSidebar } = await import('../components/sidebar/app-sidebar')

describe('AppSidebar', () => {
  it('renders navigation items: Dashboard, Providers, Labs, Alerts, Audit Log', () => {
    render(<AppSidebar />)

    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Providers')).toBeTruthy()
    expect(screen.getByText('Labs')).toBeTruthy()
    expect(screen.getByText('Alerts')).toBeTruthy()
    expect(screen.getByText('Audit Log')).toBeTruthy()
  })

  it('renders the location switcher (brand header)', () => {
    render(<AppSidebar />)
    expect(screen.getByTestId('location-switcher')).toBeTruthy()
  })

  it('renders the nav-user footer', () => {
    render(<AppSidebar />)
    expect(screen.getByTestId('nav-user')).toBeTruthy()
  })

  it('renders navigation links with correct hrefs for direct-link items', () => {
    render(<AppSidebar />)

    // Single-item groups render as direct <a> links via SidebarMenuButton asChild + Link.
    // Multi-item groups (Labs, Providers, Alerts) are collapsible triggers — no top-level href.
    // Dashboard is a single-item group. Settings is a single-item group.
    // Audit Log is in the Administration group (has icon, no sub-items) — direct link.
    const directLinks = [
      { text: 'Dashboard', href: '/dashboard' },
      { text: 'Settings', href: '/settings' },
    ]

    for (const link of directLinks) {
      const el = screen.getByText(link.text).closest('a')
      expect(el?.getAttribute('href')).toBe(link.href)
    }
  })
})
