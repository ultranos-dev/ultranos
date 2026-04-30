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

import { verifyPrescriptionQr, fetchAndCachePractitionerKey } from '@/lib/prescription-verify'
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'
import type { SignedPrescriptionBundle } from '@ultranos/shared-types'

const mockVerifyQr = vi.mocked(verifyPrescriptionQr)
const mockFetchKey = vi.mocked(fetchAndCachePractitionerKey)

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
    render(<PharmacyScannerView authToken="test-token" hubBaseUrl="http://hub" />)

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

    expect(mockLoadPrescriptions).toHaveBeenCalledWith(rxList, 'Dr. Ahmad')
    expect(onNavigate).toHaveBeenCalled()
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
