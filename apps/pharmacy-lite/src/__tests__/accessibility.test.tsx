import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

const axeOptions = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  },
  rules: {
    region: { enabled: false },
  },
}

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock db
vi.mock('../lib/db', () => ({
  db: {
    syncQueue: { where: () => ({ anyOf: () => ({ count: () => 0 }), equals: () => ({ count: () => 0 }) }), filter: () => ({ count: () => 0 }) },
    prescriptions: { toArray: () => [], get: () => null },
    dispensings: { toArray: () => [], get: () => null },
  },
}))

// Mock Supabase
vi.mock('../lib/supabase-browser', () => ({
  createBrowserClient: () => ({
    auth: { getSession: () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}))

describe('Pharmacy Lite Accessibility (axe-core)', () => {
  it('StaleDataBanner has no A/AA violations', async () => {
    const { StaleDataBanner } = await import('@ultranos/ui-kit')
    const { container } = render(
      <StaleDataBanner
        lastSyncedAt={new Date(Date.now() - 60 * 60 * 1000).toISOString()}
        failedCount={1}
        onSyncNow={() => {}}
      />,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('form with labeled inputs has no A/AA violations', async () => {
    const { container } = render(
      <form aria-label="Dispensing form">
        <div>
          <label htmlFor="rx-id">Prescription ID</label>
          <input id="rx-id" type="text" required aria-required="true" />
        </div>
        <div>
          <label htmlFor="qty">Quantity Dispensed</label>
          <input id="qty" type="number" min="1" required aria-required="true" />
        </div>
        <button type="submit">Confirm Dispensing</button>
      </form>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('navigation structure has no A/AA violations', async () => {
    const { container } = render(
      <div>
        <a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
        <header>
          <nav aria-label="Main navigation">
            <a href="/dashboard" aria-current="page">Dashboard</a>
            <a href="/scan">Scan</a>
            <a href="/history">History</a>
          </nav>
        </header>
        <main id="main-content">
          <h1>Pharmacy Dashboard</h1>
        </main>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('icon-only buttons have aria-labels', async () => {
    const { container } = render(
      <div>
        <button type="button" aria-label="Scan QR code">
          <svg aria-hidden="true" width="24" height="24"><rect width="24" height="24" /></svg>
        </button>
        <button type="button" aria-label="Print label">
          <svg aria-hidden="true" width="24" height="24"><rect width="24" height="24" /></svg>
        </button>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('error state form uses aria-invalid and linked error messages', async () => {
    const { container } = render(
      <form aria-label="Validation test">
        <div>
          <label htmlFor="qty-field">Quantity</label>
          <input
            id="qty-field"
            type="number"
            aria-invalid="true"
            aria-errormessage="qty-error"
          />
          <span id="qty-error" role="alert">Quantity must be at least 1</span>
        </div>
      </form>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })
})
