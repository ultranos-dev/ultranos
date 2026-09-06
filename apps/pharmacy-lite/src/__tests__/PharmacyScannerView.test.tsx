import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock html5-qrcode (camera not available in jsdom)
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(),
}))

// Mock prescription verification
vi.mock('@/lib/prescription-verify', () => ({
  verifyPrescriptionQr: vi.fn(),
  fetchAndCachePractitionerKey: vi.fn(),
}))

// Mock fulfillment store
const mockLoadPrescriptions = vi.fn()
vi.mock('@/stores/fulfillment-store', () => ({
  useFulfillmentStore: Object.assign(
    vi.fn(() => ({
      phase: 'empty',
      items: [],
      loadPrescriptions: mockLoadPrescriptions,
      reset: vi.fn(),
    })),
    { getState: vi.fn(() => ({ loadPrescriptions: mockLoadPrescriptions, reset: vi.fn() })) },
  ),
}))

// Mock auth session store
const mockGetAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' } }),
    ),
    {
      getState: vi.fn(() => ({
        session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' },
        getAccessToken: mockGetAccessToken,
      })),
    },
  ),
}))

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(() => 'http://hub'),
}))

// Mock the global prescription-status client (Story 3.4 invalidation check)
vi.mock('@/lib/prescription-status-client', () => ({
  checkPrescriptionStatus: vi.fn(),
}))

import { verifyPrescriptionQr, fetchAndCachePractitionerKey } from '@/lib/prescription-verify'
import { checkPrescriptionStatus } from '@/lib/prescription-status-client'
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'
import type { SignedPrescriptionBundle } from '@ultranos/shared-types'

const mockVerifyQr = vi.mocked(verifyPrescriptionQr)
const _mockFetchKey = vi.mocked(fetchAndCachePractitionerKey)
const mockCheckStatus = vi.mocked(checkPrescriptionStatus)

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function makeQrData(): string {
  const bundle: SignedPrescriptionBundle = {
    payload: JSON.stringify([{
      id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg', dos: { qty: 1, unit: 'capsule' },
      dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
    }]),
    sig: uint8ToBase64(new Uint8Array(64).fill(1)),
    pub: uint8ToBase64(new Uint8Array(32).fill(2)),
    issued_at: '2026-04-28T10:00:00Z',
    expiry: '2026-05-28T10:00:00Z',
  }
  return JSON.stringify(bundle)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadPrescriptions.mockClear()
  // Default: prescription is globally available (not yet dispensed elsewhere).
  mockCheckStatus.mockResolvedValue({
    prescriptionId: 'rx-001',
    status: 'AVAILABLE',
    medicationDisplay: 'Amoxicillin 500mg',
    authoredOn: '2026-04-28T10:00:00Z',
    dispensedAt: null,
  })
})

describe('PharmacyScannerView', () => {
  it('renders scan button (AC 1)', () => {
    render(<PharmacyScannerView />)
    expect(screen.getByTestId('start-scanner-btn')).toBeInTheDocument()
  })

  it('renders manual QR paste input', () => {
    render(<PharmacyScannerView />)
    expect(screen.getByTestId('qr-paste-input')).toBeInTheDocument()
  })

  it('shows Fraud Warning on invalid signature (AC 3)', async () => {
    mockVerifyQr.mockResolvedValue({ status: 'invalid_signature' })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('fraud-warning')).toBeInTheDocument()
    })

    expect(screen.getByText(/fraud warning/i)).toBeInTheDocument()
  })

  it('shows verified prescriptions on successful verification (AC 2, 4)', async () => {
    mockVerifyQr.mockResolvedValue({
      status: 'verified',
      prescriptions: [{
        id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin',
        medT: 'Amoxicillin 500mg Capsule',
        dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
        dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
      }],
      practitionerName: 'Dr. Ahmad',
    })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('verification-success')).toBeInTheDocument()
    })

    expect(screen.getByText('Amoxicillin')).toBeInTheDocument()
    expect(screen.getByText(/Dr\. Ahmad/)).toBeInTheDocument()
  })

  it('shows expired warning for expired prescriptions', async () => {
    mockVerifyQr.mockResolvedValue({
      status: 'expired',
      expiry: '2026-01-01T00:00:00Z',
    })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('expired-warning')).toBeInTheDocument()
    })
  })

  it('shows unknown clinician warning with Hub fetch option when online', async () => {
    mockVerifyQr.mockResolvedValue({
      status: 'unknown_clinician',
      fallbackAvailable: true,
    })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('unknown-clinician-warning')).toBeInTheDocument()
    })

    expect(screen.getByTestId('fetch-key-btn')).toBeInTheDocument()
  })

  it('loads prescriptions into fulfillment store and shows proceed button (AC 4)', async () => {
    const rxList = [{
      id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
    }]

    mockVerifyQr.mockResolvedValue({
      status: 'verified',
      prescriptions: rxList,
      practitionerName: 'Dr. Ahmad',
    })

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('proceed-to-review-btn'))

    // Global invalidation check runs first (AVAILABLE) → then load + navigate.
    await waitFor(() => expect(onNavigate).toHaveBeenCalled())
    expect(mockCheckStatus).toHaveBeenCalled()
    expect(mockLoadPrescriptions).toHaveBeenCalledWith(rxList, 'Dr. Ahmad')
  })

  it('blocks navigation when the prescription was already dispensed elsewhere (Story 3.4)', async () => {
    const rxList = [{
      id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
    }]
    mockVerifyQr.mockResolvedValue({ status: 'verified', prescriptions: rxList, practitionerName: 'Dr. Ahmad' })
    mockCheckStatus.mockResolvedValue({
      prescriptionId: 'rx-001',
      status: 'FULFILLED',
      medicationDisplay: 'Amoxicillin 500mg',
      authoredOn: '2026-04-28T10:00:00Z',
      dispensedAt: '2026-05-01T09:00:00Z',
    })

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))

    await waitFor(() => expect(screen.getByTestId('already-dispensed-warning')).toBeInTheDocument())
    // Fail-closed: no navigation, no load into fulfillment.
    expect(onNavigate).not.toHaveBeenCalled()
    expect(mockLoadPrescriptions).not.toHaveBeenCalled()
  })

  it('warns but allows proceeding when the Hub is unreachable (offline-first, Story 3.4)', async () => {
    const rxList = [{
      id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
    }]
    mockVerifyQr.mockResolvedValue({ status: 'verified', prescriptions: rxList, practitionerName: 'Dr. Ahmad' })
    mockCheckStatus.mockRejectedValue(new TypeError('Failed to fetch'))

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))

    // Warning shown, dispense NOT auto-blocked — pharmacist may proceed explicitly.
    await waitFor(() => expect(screen.getByTestId('status-check-unavailable')).toBeInTheDocument())
    expect(onNavigate).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('proceed-anyway-btn'))
    expect(mockLoadPrescriptions).toHaveBeenCalledWith(rxList, 'Dr. Ahmad')
    expect(onNavigate).toHaveBeenCalled()
  })

  it('renders offline warning for key_untrusted_offline with no Proceed option (Story 26.7 AC 4, 5.6)', async () => {
    mockVerifyQr.mockResolvedValue({ status: 'key_untrusted_offline' })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('key-untrusted-offline-warning')).toBeInTheDocument()
    })

    // AC 4: Verify the warning message is shown
    expect(screen.getByText(/hub offline/i)).toBeInTheDocument()
    expect(screen.getByText(/dispensing is blocked/i)).toBeInTheDocument()

    // AC 3.4: No "Proceed Anyway" button — fail-closed mandatory
    expect(screen.queryByText(/proceed anyway/i)).not.toBeInTheDocument()

    // Verify "Wait and Retry" and "Cancel" options are present
    expect(screen.getByTestId('retry-revalidation-btn')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-offline-btn')).toBeInTheDocument()
  })

  it('renders key_revoked warning with no dispensing option', async () => {
    mockVerifyQr.mockResolvedValue({ status: 'key_revoked' })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('key-revoked-warning')).toBeInTheDocument()
    })

    expect(screen.getByText(/key has been revoked/i)).toBeInTheDocument()
    expect(screen.getByText(/must not be dispensed/i)).toBeInTheDocument()
  })

  it('shows parse error for malformed QR data', async () => {
    mockVerifyQr.mockResolvedValue({
      status: 'parse_error',
      message: 'Invalid QR code format',
    })

    const user = userEvent.setup()
    render(<PharmacyScannerView />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: 'garbage' } })
    await user.click(screen.getByTestId('verify-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('scan-error')).toBeInTheDocument()
    })
  })
})
