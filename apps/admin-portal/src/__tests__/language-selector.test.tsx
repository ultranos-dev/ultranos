import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

// Mock next/navigation
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// Mock useSidebar
vi.mock('@/components/ui/sidebar', () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; asChild?: boolean; children: React.ReactNode }) => <button {...props}>{children}</button>,
  useSidebar: () => ({ isMobile: false }),
}))

// Mock @ultranos/ui-kit/icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  ChevronsUpDown: () => null,
  LogOut: () => null,
  Settings: () => null,
  Moon: () => null,
  Sun: () => null,
  Globe: () => <span data-testid="globe-icon" />,
}))

// Mock @ultranos/ui-kit (for getDirection)
vi.mock('@ultranos/ui-kit', () => ({
  getDirection: (locale: string) => ['ar', 'prs', 'ps'].includes(locale) ? 'rtl' : 'ltr',
}))

// Mock dropdown-menu
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode; className?: string; side?: string; align?: string; sideOffset?: number }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode; className?: string }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick, onSelect }: { children: React.ReactNode; onClick?: () => void; onSelect?: () => void; className?: string; asChild?: boolean }) => (
    <button onClick={onClick ?? onSelect}>{children}</button>
  ),
}))

// Mock auth and theme
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (sel: (s: { session: { email: string } | null }) => unknown) =>
    sel({ session: { email: 'admin@test.com' } }),
}))
vi.mock('@/lib/supabase', () => ({ getSupabaseBrowserClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/lib/trpc', () => ({ setAccessToken: vi.fn() }))
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }))
vi.mock('@/components/SessionTimer', () => ({ SessionTimer: () => null }))

import { NavUser } from '@/components/sidebar/nav-user'

describe('NavUser language selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { protocol: 'http:', pathname: '/dashboard', href: '' },
    })
  })

  it('renders the Globe icon for the language selector', () => {
    render(<NavUser />)
    expect(screen.getByTestId('globe-icon')).toBeDefined()
  })

  it('renders language options for all 4 supported locales', () => {
    render(<NavUser />)
    expect(screen.getByText('English')).toBeDefined()
    expect(screen.getByText('العربية')).toBeDefined()
    expect(screen.getByText('دری')).toBeDefined()
    expect(screen.getByText('پښتو')).toBeDefined()
  })

  it('calls router.refresh after setting locale cookie', () => {
    render(<NavUser />)
    fireEvent.click(screen.getByText('العربية'))
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('applies lang attributes to all language spans', () => {
    const { container } = render(<NavUser />)
    expect(container.querySelector('span[lang="en"]')).not.toBeNull()
    expect(container.querySelector('span[lang="ar"]')).not.toBeNull()
    expect(container.querySelector('span[lang="fa-AF"]')).not.toBeNull()
    expect(container.querySelector('span[lang="ps"]')).not.toBeNull()
  })
})
