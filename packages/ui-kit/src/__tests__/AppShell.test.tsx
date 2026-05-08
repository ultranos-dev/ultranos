import { render, screen, fireEvent } from '@testing-library/react'
import { AppShell } from '../AppShell.js'
import type { AppShellProps, AppShellUser, NavItem } from '../AppShell.js'

const mockUser: AppShellUser = {
  name: 'Dr. Ahmad',
  email: 'ahmad@clinic.org',
  role: 'Physician',
  initials: 'DA',
}

const mockNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  { label: 'Patients', href: '/patients' },
  { label: 'Schedule', href: '/schedule' },
]

function renderAppShell(overrides: Partial<AppShellProps> = {}) {
  const props: AppShellProps = {
    appName: 'OPD-Lite',
    navItems: mockNavItems,
    user: mockUser,
    onSignOut: vi.fn(),
    children: <main>Main Content</main>,
    ...overrides,
  }
  return { ...render(<AppShell {...props} />), props }
}

describe('AppShell', () => {
  it('renders app name in navbar', () => {
    renderAppShell()
    expect(screen.getByText('OPD-Lite')).toBeInTheDocument()
  })

  it('renders nav items with correct active state styling', () => {
    renderAppShell()
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
    const patientsLink = screen.getByRole('link', { name: 'Patients' })

    expect(dashboardLink).toBeInTheDocument()
    expect(patientsLink).toBeInTheDocument()
    // Active link has aria-current
    expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    expect(patientsLink).not.toHaveAttribute('aria-current')
  })

  it('renders user avatar with initials when user prop provided', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })
    expect(avatarButton).toBeInTheDocument()
    expect(avatarButton).toHaveTextContent('DA')
  })

  it('does not render avatar/dropdown when user is null', () => {
    renderAppShell({ user: null })
    expect(screen.queryByRole('button', { name: /user menu/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('dropdown opens on avatar click, contains user name, role badge, Settings, Sign Out', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)

    expect(avatarButton).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(screen.getByText('Dr. Ahmad')).toBeInTheDocument()
    expect(screen.getByText('Physician')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('Sign Out button calls onSignOut callback', () => {
    const onSignOut = vi.fn()
    renderAppShell({ onSignOut })
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('hides Sign Out button when onSignOut is not provided', () => {
    renderAppShell({ onSignOut: undefined })
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)

    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it('dropdown closes on click outside', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Click outside
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(avatarButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('dropdown closes on Escape key', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(avatarButton, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(avatarButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('dropdown opens on Enter key on avatar button', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.keyDown(avatarButton, { key: 'Enter' })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(avatarButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('dropdown opens on Space key on avatar button', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.keyDown(avatarButton, { key: ' ' })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(avatarButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('Arrow Down/Up navigates between menu items', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)

    const settingsItem = screen.getByRole('menuitem', { name: /settings/i })
    const signOutItem = screen.getByRole('menuitem', { name: /sign out/i })

    // First item should be focused on open
    expect(document.activeElement).toBe(settingsItem)

    // Arrow Down moves to Sign Out
    fireEvent.keyDown(settingsItem, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(signOutItem)

    // Arrow Up moves back to Settings
    fireEvent.keyDown(signOutItem, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(settingsItem)

    // Arrow Up wraps to last item
    fireEvent.keyDown(settingsItem, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(signOutItem)

    // Arrow Down wraps to first item
    fireEvent.keyDown(signOutItem, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(settingsItem)
  })

  it('Tab on menu item closes dropdown', () => {
    renderAppShell()
    const avatarButton = screen.getByRole('button', { name: /user menu/i })

    fireEvent.click(avatarButton)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    const settingsItem = screen.getByRole('menuitem', { name: /settings/i })
    fireEvent.keyDown(settingsItem, { key: 'Tab' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders syncIndicator and notificationBell slot content', () => {
    renderAppShell({
      syncIndicator: <span data-testid="sync-pulse">Syncing...</span>,
      notificationBell: <span data-testid="notif-bell">3</span>,
    })

    expect(screen.getByTestId('sync-pulse')).toBeInTheDocument()
    expect(screen.getByTestId('notif-bell')).toBeInTheDocument()
  })

  it('hamburger menu toggles nav visibility (simulated mobile)', () => {
    renderAppShell()
    const hamburger = screen.getByRole('button', { name: /toggle navigation/i })
    expect(hamburger).toBeInTheDocument()

    // Initially nav links are in the DOM but hamburger controls mobile visibility
    fireEvent.click(hamburger)
    // After toggle, mobile nav should be visible
    expect(hamburger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(hamburger)
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
  })

  it('mobile nav closes on link click', () => {
    renderAppShell()
    const hamburger = screen.getByRole('button', { name: /toggle navigation/i })

    fireEvent.click(hamburger)
    expect(hamburger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('link', { name: 'Patients' }))
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders children as main content', () => {
    renderAppShell()
    expect(screen.getByText('Main Content')).toBeInTheDocument()
  })

  it('has proper navigation landmark', () => {
    renderAppShell()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
  })

  // Snapshot tests
  it('snapshot: default render with all props', () => {
    const { container } = renderAppShell()
    expect(container).toMatchSnapshot()
  })

  it('snapshot: render with user=null (unauthenticated state)', () => {
    const { container } = renderAppShell({ user: null, onSignOut: undefined })
    expect(container).toMatchSnapshot()
  })

  it('snapshot: RTL render with all props', () => {
    const { container } = render(
      <div dir="rtl">
        <AppShell
          appName="OPD-Lite"
          navItems={mockNavItems}
          user={mockUser}
          onSignOut={vi.fn()}
        >
          <main>Main Content</main>
        </AppShell>
      </div>,
    )
    expect(container).toMatchSnapshot()
  })

  it('snapshot: RTL render with user=null', () => {
    const { container } = render(
      <div dir="rtl">
        <AppShell appName="OPD-Lite" navItems={mockNavItems} user={null}>
          <main>Main Content</main>
        </AppShell>
      </div>,
    )
    expect(container).toMatchSnapshot()
  })
})
