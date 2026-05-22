import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../Sidebar.js'
import type { SidebarProps, SidebarNavItem, SidebarUser } from '../Sidebar.js'

const mockUser: SidebarUser = {
  name: 'Dr. Ahmad',
  email: 'ahmad@clinic.org',
  role: 'Physician',
  initials: 'DA',
}

const mockNavItems: SidebarNavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <span data-testid="icon-dashboard">D</span>,
    active: true,
    group: 'core',
  },
  {
    label: 'Patients',
    href: '/patients',
    icon: <span data-testid="icon-patients">P</span>,
    group: 'core',
  },
  {
    label: 'Notifications',
    href: '/notifications',
    icon: <span data-testid="icon-notif">N</span>,
    badge: 5,
    group: 'clinical',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <span data-testid="icon-settings">S</span>,
    group: 'system',
  },
]

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    appName: 'OPD Lite',
    navItems: mockNavItems,
    user: mockUser,
    onSignOut: vi.fn(),
    children: <main>Main Content</main>,
    ...overrides,
  }
  return { ...render(<Sidebar {...props} />), props }
}

describe('Sidebar', () => {
  it('renders app name', () => {
    renderSidebar()
    expect(screen.getByText('OPD Lite')).toBeInTheDocument()
  })

  it('renders nav items as links with correct labels', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Patients/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Notifications/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument()
  })

  it('renders aria-current="page" on active item', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Patients/i })).not.toHaveAttribute('aria-current')
  })

  it('renders badge count on nav item', () => {
    renderSidebar()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders badge as 99+ when count exceeds 99', () => {
    const items = [{ ...mockNavItems[2]!, badge: 150 }]
    renderSidebar({ navItems: items })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('does not render badge when value is 0', () => {
    const items = [{ ...mockNavItems[2]!, badge: 0 }]
    renderSidebar({ navItems: items })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('does not render badge when value is null', () => {
    const items = [{ ...mockNavItems[2]!, badge: null }]
    renderSidebar({ navItems: items })
    expect(screen.getByRole('link', { name: /Notifications/i })).toBeInTheDocument()
  })

  it('renders group dividers between different groups', () => {
    const { container } = renderSidebar()
    const dividers = container.querySelectorAll('[data-testid="group-divider"]')
    // 3 groups (core, clinical, system) = 2 dividers
    expect(dividers).toHaveLength(2)
  })

  it('collapse toggle hides labels, keeps icons', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.click(toggle)
    expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapse toggle restores labels on second click', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders user section with name and role', () => {
    renderSidebar()
    expect(screen.getByText('Dr. Ahmad')).toBeInTheDocument()
    expect(screen.getByText('Physician')).toBeInTheDocument()
  })

  it('sign out button calls onSignOut', () => {
    const onSignOut = vi.fn()
    renderSidebar({ onSignOut })
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('renders syncIndicator slot', () => {
    renderSidebar({ syncIndicator: <span data-testid="sync">Sync</span> })
    expect(screen.getByTestId('sync')).toBeInTheDocument()
  })

  it('renders languageSelector slot', () => {
    renderSidebar({ languageSelector: <span data-testid="lang">EN</span> })
    expect(screen.getByTestId('lang')).toBeInTheDocument()
  })

  it('renders children as main content area', () => {
    renderSidebar()
    expect(screen.getByText('Main Content')).toBeInTheDocument()
  })

  it('has navigation landmark with label', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
  })

  it('keyboard: Enter activates collapse toggle', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.keyDown(toggle, { key: 'Enter' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('keyboard: Space activates collapse toggle', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.keyDown(toggle, { key: ' ' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('snapshot: expanded sidebar LTR', () => {
    const { container } = renderSidebar()
    expect(container).toMatchSnapshot()
  })

  it('snapshot: expanded sidebar RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <Sidebar
          appName="OPD Lite"
          navItems={mockNavItems}
          user={mockUser}
          onSignOut={vi.fn()}
        >
          <main>Main Content</main>
        </Sidebar>
      </div>,
    )
    expect(container).toMatchSnapshot()
  })
})
