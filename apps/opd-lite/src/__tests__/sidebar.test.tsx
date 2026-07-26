import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, isActive }: { children: React.ReactNode; isActive?: boolean }) => (
    <button data-active={isActive}>{children}</button>
  ),
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuSubButton: ({ children, isActive }: { children: React.ReactNode; isActive?: boolean }) => (
    <button data-active={isActive}>{children}</button>
  ),
}))

import { navGroups } from '../components/sidebar/nav-config'
import { NavMain } from '../components/sidebar/nav-main'
import { OpdHeader } from '../components/sidebar/opd-header'

describe('navGroups', () => {
  it('has exactly 5 groups', () => {
    expect(navGroups).toHaveLength(5)
  })

  it('group titles are (empty singleton), Core, Clinical, Admin, System', () => {
    const titles = navGroups.map((g) => g.title)
    expect(titles).toEqual(['', 'Core', 'Clinical', 'Admin', 'System'])
  })

  it('every item has a titleKey, url, and icon', () => {
    for (const group of navGroups) {
      for (const item of group.items) {
        expect(item.titleKey).toBeTruthy()
        expect(item.url).toBeTruthy()
        expect(item.icon).toBeTruthy()
      }
    }
  })

  it('all badgeKeys are valid NavBadgeKey values', () => {
    const validKeys = new Set([
      'todayAppointments',
      'notifications',
      'conflicts',
      'duplicateReviews',
      'expiringConsents',
    ])
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.badgeKey !== undefined) {
          expect(validKeys.has(item.badgeKey)).toBe(true)
        }
      }
    }
  })
})

describe('NavMain', () => {
  it('renders multi-item group labels (singleton groups render no label)', () => {
    // In nav-config: Dashboard (''), Admin, and System are singleton groups → no label.
    // Only Core (2 items) and Clinical (4 items) render SidebarGroupLabel.
    render(<NavMain groups={navGroups} />)
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Clinical')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('System')).not.toBeInTheDocument()
  })

  it('renders badge when count > 0', () => {
    render(<NavMain groups={navGroups} badges={{ notifications: 5 }} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('does not render badge when count is 0', () => {
    render(<NavMain groups={navGroups} badges={{ notifications: 0 }} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows 99+ when badge count exceeds 99', () => {
    render(<NavMain groups={navGroups} badges={{ conflicts: 150 }} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('renders parent items of groups with children (overview sub-item behind collapsible)', () => {
    // The patients group has children (registerPatient) which adds an auto-prepended
    // Overview sub-item rendered via t('overview'). With pathname '/', the collapsible
    // is closed so only the parent renders, but this confirms the nav renders without error.
    render(<NavMain groups={navGroups} />)
    expect(screen.getByText('patients')).toBeInTheDocument()
  })
})

describe('OpdHeader', () => {
  it('renders OPD Lite branding text', () => {
    render(<OpdHeader />)
    expect(screen.getByText('OPD Lite')).toBeInTheDocument()
    expect(screen.getByText('Clinic')).toBeInTheDocument()
  })
})

