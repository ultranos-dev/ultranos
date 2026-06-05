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
}))

import { navGroups } from '../components/sidebar/nav-config'
import { NavMain } from '../components/sidebar/nav-main'

describe('navGroups', () => {
  it('has exactly 4 groups', () => {
    expect(navGroups).toHaveLength(4)
  })

  it('group titles are Core, Clinical, Admin, System', () => {
    const titles = navGroups.map((g) => g.title)
    expect(titles).toEqual(['Core', 'Clinical', 'Admin', 'System'])
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
  it('renders all group labels', () => {
    render(<NavMain groups={navGroups} />)
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Clinical')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
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
})
