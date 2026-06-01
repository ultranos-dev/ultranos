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

vi.mock('@/components/SessionTimer', () => ({
  SessionTimer: () => <span data-testid="session-timer">Session: 3h 45m</span>,
}))

const { Sidebar } = await import('../components/Sidebar')

describe('Sidebar — updated nav items and footer', () => {
  it('renders "Users" nav item', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('Users')).toBeTruthy()
  })

  it('renders "Subscriptions" nav item', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('Subscriptions')).toBeTruthy()
  })

  it('renders "Sign Out" button', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeTruthy()
  })

  it('displays admin email in footer', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('admin@ultranos.com')).toBeTruthy()
  })

  it('renders "Create User" nav item', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('Create User')).toBeTruthy()
  })

  it('renders session timer in footer', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByTestId('session-timer')).toBeTruthy()
  })

  it('does NOT render a standalone "Staff" nav item', () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />)
    const staffLinks = screen.queryAllByRole('link', { name: 'Staff' })
    expect(staffLinks).toHaveLength(0)
  })
})
