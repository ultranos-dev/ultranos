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
    uploads: { toArray: () => [], get: () => null },
  },
}))

// Mock Supabase
vi.mock('../lib/supabase-browser', () => ({
  createBrowserClient: () => ({
    auth: { getSession: () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}))

describe('Lab Lite Accessibility (axe-core)', () => {
  it('StaleDataBanner has no A/AA violations', async () => {
    const { StaleDataBanner } = await import('@ultranos/ui-kit')
    const { container } = render(
      <StaleDataBanner
        lastSyncedAt={new Date(Date.now() - 60 * 60 * 1000).toISOString()}
        failedCount={3}
        onSyncNow={() => {}}
      />,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('upload form with labeled inputs has no A/AA violations', async () => {
    const { container } = render(
      <form aria-label="Result upload form">
        <div>
          <label htmlFor="patient-name">Patient Name</label>
          <input id="patient-name" type="text" required aria-required="true" readOnly />
        </div>
        <div>
          <label htmlFor="patient-age">Patient Age</label>
          <input id="patient-age" type="text" required aria-required="true" readOnly />
        </div>
        <div>
          <label htmlFor="test-type">Test Type</label>
          <select id="test-type" required aria-required="true">
            <option value="">Select test type</option>
            <option value="cbc">Complete Blood Count</option>
            <option value="bmp">Basic Metabolic Panel</option>
          </select>
        </div>
        <div>
          <label htmlFor="result-file">Result File</label>
          <input id="result-file" type="file" accept=".pdf,.jpg,.png" />
        </div>
        <button type="submit">Upload Result</button>
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
            <a href="/" aria-current="page">Dashboard</a>
            <a href="/upload">Upload</a>
            <a href="/history">History</a>
          </nav>
        </header>
        <main id="main-content">
          <h1>Lab Dashboard</h1>
        </main>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('notification panel has proper ARIA structure', async () => {
    const { container } = render(
      <div>
        <button type="button" aria-label="Notifications (3 unread)" aria-haspopup="true" aria-expanded="true">
          <svg aria-hidden="true" width="20" height="20"><circle cx="10" cy="10" r="5" /></svg>
          <span aria-hidden="true">3</span>
        </button>
        <div role="region" aria-label="Notifications">
          <h2>Notifications</h2>
          <ul>
            <li>
              <p>Result approved by Dr. Smith</p>
              <time dateTime="2026-05-17T10:00:00Z">10 min ago</time>
            </li>
          </ul>
        </div>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })
})
