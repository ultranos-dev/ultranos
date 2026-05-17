import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const { Sidebar } = await import('../components/Sidebar')

describe('Sidebar', () => {
  it('renders all 5 navigation sections', () => {
    render(<Sidebar />)

    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Providers')).toBeTruthy()
    expect(screen.getByText('Labs')).toBeTruthy()
    expect(screen.getByText('Alerts')).toBeTruthy()
    expect(screen.getByText('Audit Log')).toBeTruthy()
  })

  it('renders the Ultranos Admin heading', () => {
    render(<Sidebar />)
    expect(screen.getByText('Ultranos Admin')).toBeTruthy()
  })

  it('highlights the active section', () => {
    render(<Sidebar />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page')
  })

  it('renders navigation links with correct hrefs', () => {
    render(<Sidebar />)

    const links = [
      { text: 'Dashboard', href: '/dashboard' },
      { text: 'Providers', href: '/providers' },
      { text: 'Labs', href: '/labs' },
      { text: 'Alerts', href: '/alerts' },
      { text: 'Audit Log', href: '/audit' },
    ]

    for (const link of links) {
      const el = screen.getByText(link.text).closest('a')
      expect(el?.getAttribute('href')).toBe(link.href)
    }
  })
})
