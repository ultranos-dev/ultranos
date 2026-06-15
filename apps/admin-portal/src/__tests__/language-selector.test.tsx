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

// Mock @ultranos/ui-kit/icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  Globe: () => <span data-testid="globe-icon" />,
}))

// Mock dropdown-menu
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode; className?: string; side?: string; align?: string; sideOffset?: number }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode; className?: string }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void; className?: string }) => (
    <button onClick={onSelect}>{children}</button>
  ),
}))

import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

describe('LanguageSelectorClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { protocol: 'http:', pathname: '/dashboard', href: '' },
    })
  })

  it('renders the Globe icon', () => {
    render(<LanguageSelectorClient />)
    expect(screen.getByTestId('globe-icon')).toBeDefined()
  })

  it('renders language options for all 4 supported locales', () => {
    render(<LanguageSelectorClient />)
    expect(screen.getAllByText('English').length).toBeGreaterThan(0)
    expect(screen.getByText('العربية')).toBeDefined()
    expect(screen.getByText('دری')).toBeDefined()
    expect(screen.getByText('پښتو')).toBeDefined()
  })

  it('calls router.refresh after setting locale cookie', () => {
    render(<LanguageSelectorClient />)
    fireEvent.click(screen.getByText('العربية'))
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('sets NEXT_LOCALE cookie when a language is selected', () => {
    render(<LanguageSelectorClient />)
    fireEvent.click(screen.getByText('دری'))
    expect(document.cookie).toContain('NEXT_LOCALE=prs')
  })
})
