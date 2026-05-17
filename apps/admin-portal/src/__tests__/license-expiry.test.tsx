import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/providers/expiry',
}))

// Mock tRPC client
const mockListExpiringProviders = vi.fn()
const mockRenewProviderLicense = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listExpiringProviders: { query: (...args: any[]) => mockListExpiringProviders(...args) },
      renewProviderLicense: { mutate: (...args: any[]) => mockRenewProviderLicense(...args) },
    },
  },
}))

const { default: LicenseExpiryPage } = await import('../app/providers/expiry/page')

describe('License Expiry View Page', () => {
  it('renders the page heading and filter buttons', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [],
      total: 0,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    expect(screen.getByText('License Expiry')).toBeTruthy()
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText(/7 days/)).toBeTruthy()
    expect(screen.getByText(/30 days/)).toBeTruthy()
    expect(screen.getByText(/60 days/)).toBeTruthy()
  })

  it('renders table columns correctly', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [],
      total: 0,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      expect(screen.getByText('Provider Name')).toBeTruthy()
      expect(screen.getByText('License Number')).toBeTruthy()
      expect(screen.getByText('Issuing Body')).toBeTruthy()
      expect(screen.getByText('Expiry Date')).toBeTruthy()
      expect(screen.getByText('Days Remaining')).toBeTruthy()
      expect(screen.getByText('KYC Status')).toBeTruthy()
    })
  })

  it('renders color-coded urgency badges — red for <=7d', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [
        {
          practitionerId: 'p1',
          name: 'Dr. Smith',
          licenseNumber: 'LIC-001',
          issuingBody: 'HAAD',
          expiryDate: '2026-05-20',
          daysRemaining: 5,
          kycStatus: 'ACTIVE',
        },
      ],
      total: 1,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      const badge = screen.getByText('5d')
      expect(badge).toBeTruthy()
      expect(badge.className).toContain('bg-red-100')
      expect(badge.className).toContain('text-red-800')
    })
  })

  it('renders color-coded urgency badges — orange for <=30d', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [
        {
          practitionerId: 'p2',
          name: 'Dr. Ali',
          licenseNumber: 'LIC-002',
          issuingBody: 'MOH_UAE',
          expiryDate: '2026-06-10',
          daysRemaining: 25,
          kycStatus: 'ACTIVE',
        },
      ],
      total: 1,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      const badge = screen.getByText('25d')
      expect(badge).toBeTruthy()
      expect(badge.className).toContain('bg-orange-100')
      expect(badge.className).toContain('text-orange-800')
    })
  })

  it('renders color-coded urgency badges — yellow for <=60d', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [
        {
          practitionerId: 'p3',
          name: 'Dr. Kumar',
          licenseNumber: 'LIC-003',
          issuingBody: 'JMC',
          expiryDate: '2026-07-01',
          daysRemaining: 45,
          kycStatus: 'ACTIVE',
        },
      ],
      total: 1,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      const badge = screen.getByText('45d')
      expect(badge).toBeTruthy()
      expect(badge.className).toContain('bg-yellow-100')
      expect(badge.className).toContain('text-yellow-800')
    })
  })

  it('opens renewal modal when clicking Renew button', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [
        {
          practitionerId: 'p1',
          name: 'Dr. Smith',
          licenseNumber: 'LIC-001',
          issuingBody: 'HAAD',
          expiryDate: '2026-05-20',
          daysRemaining: 5,
          kycStatus: 'SUSPENDED',
        },
      ],
      total: 1,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Renew'))

    // Modal renders with form inputs
    const expiryInput = await screen.findByLabelText('New Expiry Date')
    expect(expiryInput).toBeTruthy()
    const docInput = await screen.findByLabelText('Renewal Document URL')
    expect(docInput).toBeTruthy()
  })

  it('shows confirmation dialog before submitting renewal', async () => {
    mockListExpiringProviders.mockResolvedValue({
      providers: [
        {
          practitionerId: 'p1',
          name: 'Dr. Smith',
          licenseNumber: 'LIC-001',
          issuingBody: 'HAAD',
          expiryDate: '2026-05-20',
          daysRemaining: 5,
          kycStatus: 'SUSPENDED',
        },
      ],
      total: 1,
      cursor: 0,
      limit: 25,
    })

    render(<LicenseExpiryPage />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Renew'))

    await waitFor(() => {
      expect(screen.getByLabelText('New Expiry Date')).toBeTruthy()
    })

    // Fill in the form
    fireEvent.change(screen.getByLabelText('New Expiry Date'), {
      target: { value: '2027-05-01' },
    })
    fireEvent.change(screen.getByLabelText('Renewal Document URL'), {
      target: { value: 'https://docs.example.com/renewal.pdf' },
    })

    // Click the "Renew License" button in the modal
    const renewButtons = screen.getAllByText('Renew License')
    const modalRenewButton = renewButtons[renewButtons.length - 1]
    fireEvent.click(modalRenewButton)

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText(/PENDING_VERIFICATION/)).toBeTruthy()
      expect(screen.getByText('Confirm Renewal')).toBeTruthy()
    })
  })
})
