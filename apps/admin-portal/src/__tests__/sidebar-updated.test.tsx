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
  NavUser: () => (
    <div data-testid="nav-user">
      <span>admin@ultranos.com</span>
      <button>Sign Out</button>
    </div>
  ),
}))

const { AppSidebar } = await import('../components/sidebar/app-sidebar')

describe('AppSidebar — updated nav items and footer', () => {
  it('renders "Users" nav item', () => {
    render(<AppSidebar />)
    expect(screen.getByText('Users')).toBeTruthy()
  })

  it('renders "Subscriptions" nav item', () => {
    render(<AppSidebar />)
    expect(screen.getByText('Subscriptions')).toBeTruthy()
  })

  it('renders "Sign Out" button in footer', () => {
    render(<AppSidebar />)
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeTruthy()
  })

  it('displays admin email in footer', () => {
    render(<AppSidebar />)
    expect(screen.getByText('admin@ultranos.com')).toBeTruthy()
  })

  it('renders "Create User" nav item', () => {
    render(<AppSidebar />)
    expect(screen.getByText('Create User')).toBeTruthy()
  })

  it('does NOT render a standalone "Staff" nav item', () => {
    render(<AppSidebar />)
    const staffLinks = screen.queryAllByRole('link', { name: 'Staff' })
    expect(staffLinks).toHaveLength(0)
  })
})
