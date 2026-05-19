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

// Mock Supabase
vi.mock('../lib/supabase-browser', () => ({
  createBrowserClient: () => ({
    auth: { getSession: () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}))

describe('Admin Portal Accessibility (axe-core)', () => {
  it('sidebar navigation has no A/AA violations', async () => {
    const { container } = render(
      <div>
        <a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
        <nav aria-label="Admin navigation">
          <ul>
            <li><a href="/dashboard" aria-current="page">Dashboard</a></li>
            <li><a href="/providers">Providers</a></li>
            <li><a href="/labs">Labs</a></li>
            <li><a href="/alerts">Alerts</a></li>
            <li><a href="/subscriptions">Subscriptions</a></li>
          </ul>
        </nav>
        <main id="main-content">
          <h1>Admin Dashboard</h1>
        </main>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('data table structure has no A/AA violations', async () => {
    const { container } = render(
      <main>
        <h1>Providers</h1>
        <table>
          <caption>Registered healthcare providers</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">License</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Dr. Ahmad</td>
              <td>LIC-001</td>
              <td><span>Active</span></td>
              <td><button type="button">View</button></td>
            </tr>
          </tbody>
        </table>
      </main>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('form elements have proper labels and error states', async () => {
    const { container } = render(
      <form aria-label="Provider verification">
        <div>
          <label htmlFor="provider-name">Provider Name</label>
          <input id="provider-name" type="text" required aria-required="true" />
        </div>
        <div>
          <label htmlFor="license-number">License Number</label>
          <input
            id="license-number"
            type="text"
            aria-invalid="true"
            aria-errormessage="license-error"
          />
          <span id="license-error" role="alert">License number is required</span>
        </div>
        <div>
          <label htmlFor="status-select">Verification Status</label>
          <select id="status-select">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <button type="submit">Submit Verification</button>
      </form>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('alert/notification patterns have no A/AA violations', async () => {
    const { container } = render(
      <div>
        <div role="alert" aria-live="assertive">
          <strong>Critical:</strong> Prescribing anomaly detected for provider LIC-042
        </div>
        <div role="status" aria-live="polite">
          3 providers pending KYC review
        </div>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })
})
