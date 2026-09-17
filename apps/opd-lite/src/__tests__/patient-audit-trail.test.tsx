import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock ui-kit icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  ChevronDown: () => <svg data-testid="chevron-down" />,
  History: () => <svg data-testid="icon-history" />,
  AlertTriangle: () => <svg data-testid="icon-alert-triangle" />,
}))

// Mock formatRelativeTime
vi.mock('@ultranos/ui-kit', () => ({
  formatRelativeTime: (_iso: string) => '2m ago',
}))

// Mock hub url
vi.mock('@/lib/hub-url', () => ({
  getHubBaseUrl: () => 'http://hub.test',
}))

// Mock Card
vi.mock('@/components/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
}))

// Mock Button
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}))

// Mock EmptyState
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title, 'data-testid': testId }: { title: string; 'data-testid'?: string }) => (
    <div data-testid={testId ?? 'empty-state'}><p>{title}</p></div>
  ),
}))

// Controllable Supabase session mock
const supabaseSession = { token: 'valid-token' as string | null }
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: supabaseSession.token
            ? { access_token: supabaseSession.token }
            : null,
        },
      }),
    },
  }),
}))

// Fetch is mocked per test
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

const { PatientAuditTrail } = await import('@/components/patient/PatientAuditTrail')

const PATIENT_ID = 'pat-audit-001'

function makeAuditResponse(entries: unknown[] = []) {
  return JSON.stringify({
    result: {
      data: {
        json: {
          entries,
          nextCursor: null,
          hasMore: false,
        },
      },
    },
  })
}

describe('PatientAuditTrail — 4-state error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseSession.token = 'valid-token'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(makeAuditResponse()),
    })
  })

  function openAuditTrail() {
    const toggle = screen.getByRole('button', { name: /auditTrail/i })
    fireEvent.click(toggle)
  }

  it('shows unavailable state (not blank) when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network failure'))

    render(<PatientAuditTrail patientId={PATIENT_ID} userRole="DOCTOR" />)
    openAuditTrail()

    await waitFor(() => {
      expect(screen.getByTestId('audit-trail-error')).toBeInTheDocument()
    })
    // Must NOT be blank — the unavailable message is shown
    expect(screen.getByText('auditUnavailable')).toBeInTheDocument()
  })

  it('shows unavailable state (not blank) when HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    render(<PatientAuditTrail patientId={PATIENT_ID} userRole="DOCTOR" />)
    openAuditTrail()

    await waitFor(() => {
      expect(screen.getByTestId('audit-trail-error')).toBeInTheDocument()
    })
  })

  it('shows unavailable state when session token is absent', async () => {
    supabaseSession.token = null

    render(<PatientAuditTrail patientId={PATIENT_ID} userRole="DOCTOR" />)
    openAuditTrail()

    await waitFor(() => {
      expect(screen.getByTestId('audit-trail-error')).toBeInTheDocument()
    })
  })

  it('shows empty state (not unavailable) when loaded zero entries', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(makeAuditResponse([])),
    })

    render(<PatientAuditTrail patientId={PATIENT_ID} userRole="DOCTOR" />)
    openAuditTrail()

    await waitFor(() => {
      expect(screen.getByText('auditEmpty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('audit-trail-error')).not.toBeInTheDocument()
  })

  it('shows entries when fetch succeeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(makeAuditResponse([
        {
          id: 'e1',
          action: 'UPDATE',
          actorName: 'Dr Ahmed',
          actorRole: 'DOCTOR',
          fieldsUpdated: ['nameGiven'],
          operation: 'update',
          timestamp: new Date().toISOString(),
        },
      ])),
    })

    render(<PatientAuditTrail patientId={PATIENT_ID} userRole="DOCTOR" />)
    openAuditTrail()

    await waitFor(() => {
      expect(screen.getByText('Dr Ahmed')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('audit-trail-error')).not.toBeInTheDocument()
  })
})
