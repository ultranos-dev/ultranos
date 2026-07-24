import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ============================================================
// Expiring Consents Page Tests
// Verifies: EmptyState when list is empty, Skeleton rows while
// loading, status pill classes for day thresholds, and table
// rendering when data is present.
// ============================================================

// Mock next-intl — return the key as the translated string
vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'en',
}))

// Mock hub-url
vi.mock('../lib/hub-url', () => ({
  getHubTrpcUrl: () => 'https://hub.test',
}))

// Mock formatDate from ui-kit
vi.mock('@ultranos/ui-kit', () => ({
  formatDate: (date: string) => date,
}))

// Mock Skeleton from ui-kit so it renders a recognisable element
vi.mock('@ultranos/ui-kit/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// Mock EmptyState from ui-kit
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}))

// Mock CalendarClock icon
vi.mock('@ultranos/ui-kit/icons', () => ({
  CalendarClock: () => <svg data-testid="icon-calendar-clock" />,
}))

// Mock Button
vi.mock('../components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

// ---- helpers ----------------------------------------------------------------

function makeConsent(overrides: Partial<{
  id: string
  patient_ref: string
  provision_end: string
  consent_version: string
  grantor_role: string
}> = {}) {
  return {
    id: 'c-1',
    patient_ref: 'Patient/p-001',
    provision_end: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    consent_version: 'v1',
    grantor_role: 'patient',
    ...overrides,
  }
}

function mockFetch(consents: ReturnType<typeof makeConsent>[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      result: { data: { json: { consents } } },
    }),
  } as unknown as Response)
}

// Dynamic import AFTER all vi.mock() calls
const { default: ExpiringConsentsPage } = await import(
  '../app/[locale]/(app)/expiring-consents/page'
)

// ---- tests ------------------------------------------------------------------

describe('ExpiringConsentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('empty state', () => {
    it('renders EmptyState when the consent list is empty', async () => {
      mockFetch([])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      // Key strings (useTranslations returns the key)
      expect(screen.getByText('emptyTitle')).toBeInTheDocument()
      expect(screen.getByText('emptyDescription')).toBeInTheDocument()
    })

    it('does NOT render the table when the list is empty', async () => {
      mockFetch([])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows Skeleton rows while loading', async () => {
      // Never resolves — keeps loading state
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
      render(<ExpiringConsentsPage />)

      // Skeletons should appear immediately (loading=true on mount)
      const skeletons = screen.getAllByTestId('skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(5)
    })

    it('hides skeleton rows after data loads', async () => {
      mockFetch([makeConsent()])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.queryAllByTestId('skeleton')).toHaveLength(0)
      })
    })
  })

  describe('table rendering', () => {
    it('renders a table row for each returned consent', async () => {
      mockFetch([
        makeConsent({ id: 'c-1', patient_ref: 'Patient/p-001' }),
        makeConsent({ id: 'c-2', patient_ref: 'Patient/p-002' }),
      ])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.getByText('p-001')).toBeInTheDocument()
        expect(screen.getByText('p-002')).toBeInTheDocument()
      })
    })

    it('strips the Patient/ prefix from patient_ref', async () => {
      mockFetch([makeConsent({ patient_ref: 'Patient/pat-xyz' })])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.getByText('pat-xyz')).toBeInTheDocument()
        expect(screen.queryByText('Patient/pat-xyz')).not.toBeInTheDocument()
      })
    })
  })

  describe('days-until-expiry status pill', () => {
    it('applies destructive pill class when <= 30 days', async () => {
      const soon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      mockFetch([makeConsent({ id: 'c-soon', provision_end: soon })])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        const pill = screen.getByText('15')
        // The pill should carry destructive styling
        expect(pill.className).toMatch(/bg-destructive/)
        expect(pill.className).toMatch(/text-destructive/)
      })
    })

    it('applies warning pill class when > 30 and <= 60 days', async () => {
      const mid = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
      mockFetch([makeConsent({ id: 'c-mid', provision_end: mid })])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        const pill = screen.getByText('45')
        expect(pill.className).toMatch(/bg-warning/)
        expect(pill.className).toMatch(/text-warning/)
      })
    })

    it('applies muted pill class when > 60 days', async () => {
      const far = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString()
      mockFetch([makeConsent({ id: 'c-far', provision_end: far })])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        const pill = screen.getByText('75')
        expect(pill.className).toMatch(/bg-muted/)
        expect(pill.className).toMatch(/text-muted-foreground/)
      })
    })
  })

  describe('column headers', () => {
    it('renders i18n column header keys via useTranslations', async () => {
      mockFetch([makeConsent()])
      render(<ExpiringConsentsPage />)

      await waitFor(() => {
        expect(screen.getAllByText('colPatientId').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('colExpiryDate').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('colDaysUntilExpiry').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('colVersion').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('colGrantorRole').length).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
