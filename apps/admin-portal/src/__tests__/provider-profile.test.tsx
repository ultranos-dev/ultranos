/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/providers/profile/p1',
  useParams: () => ({ practitionerId: 'p1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock trpc client
const mockGetProviderProfile = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getProviderProfile: { query: (...args: any[]) => mockGetProviderProfile(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: ProviderProfilePage } = await import('../app/[locale]/providers/profile/[practitionerId]/page')

const baseProfile = {
  practitioner: {
    id: 'p1',
    name: 'Dr. Fatima Al-Rashid',
    email: 'fatima@clinic.com',
    phone: '+964-770-123-4567',
    role: 'DOCTOR',
    kycStatus: 'ACTIVE',
    licenseExpiry: '2027-01-15T00:00:00Z',
    daysRemaining: 240,
    status: 'ACTIVE',
    createdAt: '2025-06-01T00:00:00Z',
  },
  kycSubmissions: [
    { id: 'kyc-abc12345-long-id', status: 'APPROVED', submittedAt: '2025-06-01T00:00:00Z', reviewedAt: '2025-06-03T00:00:00Z' },
  ],
  alerts: [
    { id: 'alert-001', anomalyType: 'HIGH_VOLUME', severity: 'MEDIUM', status: 'DISMISSED', createdAt: '2026-04-10T00:00:00Z' },
  ],
  alertSummary: { total: 1, dismissed: 1, escalated: 0, resolved: 0, unreviewed: 0 },
}

const profileWithManyAlerts = {
  ...baseProfile,
  alerts: [
    { id: 'alert-001', anomalyType: 'HIGH_VOLUME', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-04-10T00:00:00Z' },
    { id: 'alert-002', anomalyType: 'OFF_FORMULARY', severity: 'MEDIUM', status: 'UNREVIEWED', createdAt: '2026-04-12T00:00:00Z' },
    { id: 'alert-003', anomalyType: 'DUPLICATE_RX', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-04-14T00:00:00Z' },
  ],
  alertSummary: { total: 3, dismissed: 0, escalated: 2, resolved: 0, unreviewed: 1 },
}

describe('Provider Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders provider identity (name, email, status)', async () => {
    mockGetProviderProfile.mockResolvedValue(baseProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      const nameElements = screen.getAllByText('Dr. Fatima Al-Rashid')
      expect(nameElements.length).toBeGreaterThanOrEqual(1)
    })

    const emailElements = screen.getAllByText('fatima@clinic.com')
    expect(emailElements.length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('DOCTOR')).toBeTruthy()
    expect(screen.getByText('+964-770-123-4567')).toBeTruthy()
  })

  it('shows alert warning when >= 3 escalated + unreviewed alerts', async () => {
    mockGetProviderProfile.mockResolvedValue(profileWithManyAlerts)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('This provider has multiple unresolved alerts.')).toBeTruthy()
  })

  it('does not show alert warning when < 3 escalated + unreviewed alerts', async () => {
    mockGetProviderProfile.mockResolvedValue(baseProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText('This provider has multiple unresolved alerts.')).toBeNull()
  })

  it('shows back link to providers list', async () => {
    mockGetProviderProfile.mockResolvedValue(baseProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    const backLink = screen.getByText(/Back to Providers/)
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/providers')
  })

  it('renders KYC submission table with View Details link', async () => {
    mockGetProviderProfile.mockResolvedValue(baseProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('View Details')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
  })

  it('renders alert summary line', async () => {
    mockGetProviderProfile.mockResolvedValue(profileWithManyAlerts)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText(/3 total alerts/)).toBeTruthy()
    expect(screen.getByText(/0 dismissed/)).toBeTruthy()
    expect(screen.getByText(/2 escalated/)).toBeTruthy()
  })

  it('shows empty state when no KYC submissions', async () => {
    const emptyKycProfile = { ...baseProfile, kycSubmissions: [] }
    mockGetProviderProfile.mockResolvedValue(emptyKycProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('No KYC submissions found.')).toBeTruthy()
  })

  it('shows empty state when no alerts', async () => {
    const noAlertsProfile = { ...baseProfile, alerts: [], alertSummary: { total: 0, dismissed: 0, escalated: 0, resolved: 0, unreviewed: 0 } }
    mockGetProviderProfile.mockResolvedValue(noAlertsProfile)

    render(<ProviderProfilePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Fatima Al-Rashid').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('No prescribing alerts.')).toBeTruthy()
  })
})
