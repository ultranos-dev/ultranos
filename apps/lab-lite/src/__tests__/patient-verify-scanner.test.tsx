import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { PatientVerifyScanner } from '../components/PatientVerifyScanner'

const mockVerifyPatient = vi.fn()

vi.mock('@/lib/trpc', () => ({
  verifyPatient: (...args: unknown[]) => mockVerifyPatient(...args),
}))

// Mock offline-verify — cacheVerifiedPatient/getCachedPatient use Dexie (IndexedDB)
// which is unavailable in jsdom without additional setup. The QR flow under test is
// the online path, so these helpers are no-ops in this context.
vi.mock('@/lib/offline-verify', () => ({
  verifyQrOffline: vi.fn().mockResolvedValue({ valid: false, reason: 'test' }),
  cacheVerifiedPatient: vi.fn().mockResolvedValue(undefined),
  getCachedPatient: vi.fn().mockResolvedValue(null),
}))

// Mock html5-qrcode
const mockStart = vi.fn()
const mockStop = vi.fn().mockResolvedValue(undefined)
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
  })),
}))

const defaultProps = {
  onVerified: vi.fn(),
  onError: vi.fn(),
  token: 'test-jwt-token',
}

describe('PatientVerifyScanner', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the scan button initially', () => {
    render(<PatientVerifyScanner {...defaultProps} />)
    expect(screen.getByText('Scan Patient QR Code')).toBeDefined()
  })

  it('starts scanner when scan button is clicked', async () => {
    mockStart.mockResolvedValue(undefined)

    render(<PatientVerifyScanner {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Scan Patient QR Code'))
    })

    expect(mockStart).toHaveBeenCalled()
  })

  it('parses Health Passport QR payload and calls verifyPatient with QR_SCAN method', async () => {
    mockVerifyPatient.mockResolvedValue({
      firstName: 'Layla',
      age: 42,
      patientRef: 'ref-qr',
    })

    // Capture the scan success callback
    mockStart.mockImplementation(async (_camera: any, _config: any, onSuccess: (text: string) => void) => {
      // Simulate QR scan with Health Passport payload.
      // exp must be a future Unix timestamp (seconds); 9999999999 ≈ year 2286.
      setTimeout(() => {
        onSuccess(JSON.stringify({ pid: 'patient-uuid-qr', iat: 1700000000, exp: 9999999999 }))
      }, 10)
    })

    render(<PatientVerifyScanner {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Scan Patient QR Code'))
    })

    await waitFor(() => {
      expect(mockVerifyPatient).toHaveBeenCalledWith('patient-uuid-qr', 'QR_SCAN', 'test-jwt-token')
    })

    // After verifyPatient resolves, the component shows a verification card with a
    // "Confirm Patient" button. onVerified is only called after explicit confirmation
    // (two-step UX: verify then confirm). Click the confirm button.
    await waitFor(() => {
      expect(screen.getByText('Confirm Patient')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Confirm Patient'))

    await waitFor(() => {
      expect(defaultProps.onVerified).toHaveBeenCalledWith({
        firstName: 'Layla',
        age: 42,
        patientRef: 'ref-qr',
      })
    })
  })

  it('handles non-JSON QR payload as raw patient ID', async () => {
    mockVerifyPatient.mockResolvedValue({
      firstName: 'Omar',
      age: 55,
      patientRef: 'ref-raw',
    })

    mockStart.mockImplementation(async (_camera: any, _config: any, onSuccess: (text: string) => void) => {
      setTimeout(() => {
        onSuccess('raw-patient-id-123')
      }, 10)
    })

    render(<PatientVerifyScanner {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Scan Patient QR Code'))
    })

    await waitFor(() => {
      expect(mockVerifyPatient).toHaveBeenCalledWith('raw-patient-id-123', 'QR_SCAN', 'test-jwt-token')
    })
  })

  it('calls onError when verification fails after scan', async () => {
    mockVerifyPatient.mockRejectedValue(new Error('Patient not found'))

    mockStart.mockImplementation(async (_camera: any, _config: any, onSuccess: (text: string) => void) => {
      setTimeout(() => {
        onSuccess(JSON.stringify({ pid: 'unknown-pid' }))
      }, 10)
    })

    render(<PatientVerifyScanner {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Scan Patient QR Code'))
    })

    await waitFor(() => {
      expect(defaultProps.onError).toHaveBeenCalledWith('Patient not found')
    })
  })

  it('shows Cancel Scan button while scanning', async () => {
    mockStart.mockResolvedValue(undefined)

    render(<PatientVerifyScanner {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Scan Patient QR Code'))
    })

    expect(screen.getByText('Cancel Scan')).toBeDefined()
  })
})
