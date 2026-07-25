import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

// Axe configuration: fail on A and AA violations, warn on AAA (except contrast which is AAA required)
const axeOptions = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  },
  rules: {
    // Region rule can false-positive in isolated component tests
    region: { enabled: false },
  },
}

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next-intl to avoid NextIntlClientProvider context requirement
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
}))

// Mock audit module
vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: { ALLERGY: 'ALLERGY', PATIENT: 'PATIENT', ENCOUNTER: 'ENCOUNTER' },
}))

// Mock db to avoid Dexie initialization in jsdom
vi.mock('../lib/db', () => ({
  db: {
    syncQueue: { where: () => ({ anyOf: () => ({ count: () => 0 }), equals: () => ({ count: () => 0 }) }), filter: () => ({ count: () => 0 }) },
    encounters: { toArray: () => [], get: () => null, where: () => ({ equals: () => ({ toArray: () => [] }) }) },
    patients: { toArray: () => [], get: () => null },
    allergies: { toArray: () => [], get: () => null },
  },
}))

// Mock Supabase
vi.mock('../lib/supabase-browser', () => ({
  createBrowserClient: () => ({
    auth: { getSession: () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}))

describe('OPD Lite Accessibility (axe-core)', () => {
  it('StaleDataBanner has no A/AA violations', async () => {
    const { StaleDataBanner } = await import('@ultranos/ui-kit')
    const { container } = render(
      <StaleDataBanner
        lastSyncedAt={new Date(Date.now() - 60 * 60 * 1000).toISOString()}
        failedCount={2}
        onSyncNow={() => {}}
      />,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('AllergyBanner with active allergies has no A/AA violations', async () => {
    const { useAllergyStore } = await import('@/stores/allergy-store')
    useAllergyStore.setState({
      allergies: [
        {
          id: 'a1',
          resourceType: 'AllergyIntolerance',
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const, code: 'active' }] },
          verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const, code: 'confirmed' }] },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '387207008', display: 'Penicillin' }], text: 'Penicillin' },
          patient: { reference: 'Patient/p1' },
          _ultranos: { createdAt: new Date().toISOString() },
        },
      ],
      isLoading: false,
      loadError: null,
    })

    const { AllergyBanner } = await import('@/components/clinical/AllergyBanner')
    const { container } = render(<AllergyBanner patientId="p1" />)
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('form with labeled inputs has no A/AA violations', async () => {
    const { container } = render(
      <form aria-label="Test form">
        <div>
          <label htmlFor="patient-name">Patient Name</label>
          <input id="patient-name" type="text" required aria-required="true" />
        </div>
        <div>
          <label htmlFor="patient-dob">Date of Birth</label>
          <input id="patient-dob" type="date" required aria-required="true" />
        </div>
        <button type="submit">Save</button>
      </form>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('navigation landmarks have no A/AA violations', async () => {
    const { container } = render(
      <div>
        <a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="/dashboard" aria-current="page">Dashboard</a></li>
            <li><a href="/encounters">Encounters</a></li>
          </ul>
        </nav>
        <main id="main-content">
          <h1>Dashboard</h1>
          <p>Welcome to OPD Lite</p>
        </main>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('buttons meet minimum requirements for accessibility', async () => {
    const { container } = render(
      <div>
        <button type="button" aria-label="Close dialog">
          <svg aria-hidden="true" width="24" height="24"><path d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
        <button type="submit">Save Encounter</button>
        <button type="button" disabled aria-disabled="true">Locked</button>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('error state form fields use aria-invalid and aria-errormessage', async () => {
    const { container } = render(
      <form aria-label="Validation test">
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            aria-invalid="true"
            aria-errormessage="email-error"
          />
          <span id="email-error" role="alert">Please enter a valid email address</span>
        </div>
      </form>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('ARIA live regions for sync status have no violations', async () => {
    const { container } = render(
      <div>
        <div aria-live="polite" role="status">
          <span>Sync complete — all data up to date</span>
        </div>
        <div role="alert" aria-live="assertive">
          <span>Warning: Drug interaction detected</span>
        </div>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })

  it('images and icons have proper alt text or aria-hidden', async () => {
    const { container } = render(
      <div>
        <img src="/logo.png" alt="Ultranos OPD Lite" />
        <img src="/decorative-line.png" alt="" aria-hidden="true" />
        <svg aria-hidden="true" width="20" height="20"><circle cx="10" cy="10" r="5" /></svg>
        <svg role="img" aria-label="Sync status: connected" width="20" height="20"><circle cx="10" cy="10" r="5" /></svg>
      </div>,
    )
    const results = await axe(container, axeOptions)
    expect(results).toHaveNoViolations()
  })
})
