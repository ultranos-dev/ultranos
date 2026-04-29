import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the status client
vi.mock('@/lib/prescription-status-client', () => ({
  checkPrescriptionStatus: vi.fn(),
  completePrescription: vi.fn(),
}))

// Mock html5-qrcode (camera not available in jsdom)
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(),
}))

import { checkPrescriptionStatus, completePrescription } from '@/lib/prescription-status-client'
import { PrescriptionScanner } from '@/components/pharmacy/PrescriptionScanner'

const mockCheck = vi.mocked(checkPrescriptionStatus)
const mockComplete = vi.mocked(completePrescription)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PrescriptionScanner', () => {
  it('renders scan button and manual input', () => {
    render(<PrescriptionScanner />)

    expect(screen.getByTestId('start-scanner-btn')).toBeInTheDocument()
    expect(screen.getByTestId('manual-prescription-input')).toBeInTheDocument()
    expect(screen.getByTestId('manual-check-btn')).toBeInTheDocument()
  })

  it('shows AVAILABLE status with green banner and dispense button', async () => {
    mockCheck.mockResolvedValue({
      prescriptionId: 'rx-001',
      status: 'AVAILABLE',
      medicationDisplay: 'Amoxicillin 500mg',
      authoredOn: '2026-04-20T10:00:00Z',
      dispensedAt: null,
    })

    const user = userEvent.setup()
    render(<PrescriptionScanner authToken="test-token" />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-001')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('status-available')).toBeInTheDocument()
    })

    expect(screen.getByText('Prescription Valid')).toBeInTheDocument()
    expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument()
    expect(screen.getByTestId('dispense-btn')).toBeEnabled()
  })

  it('requires auth token for status check', async () => {
    const user = userEvent.setup()
    render(<PrescriptionScanner />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-001')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('scan-error')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Authentication required to verify prescriptions.'),
    ).toBeInTheDocument()
  })

  it('shows FULFILLED status with red banner and blocked dispense', async () => {
    mockCheck.mockResolvedValue({
      prescriptionId: 'rx-002',
      status: 'FULFILLED',
      medicationDisplay: 'Ibuprofen 400mg',
      authoredOn: '2026-04-18T10:00:00Z',
      dispensedAt: '2026-04-19T14:00:00Z',
    })

    const user = userEvent.setup()
    render(<PrescriptionScanner authToken="test-token" />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-002')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('status-fulfilled')).toBeInTheDocument()
    })

    expect(screen.getByText('Already Fulfilled')).toBeInTheDocument()
    expect(screen.getByTestId('dispense-btn-blocked')).toBeDisabled()
  })

  it('shows VOIDED status with red banner and blocked dispense', async () => {
    mockCheck.mockResolvedValue({
      prescriptionId: 'rx-003',
      status: 'VOIDED',
      medicationDisplay: 'Metformin 850mg',
      authoredOn: '2026-04-17T10:00:00Z',
      dispensedAt: null,
    })

    const user = userEvent.setup()
    render(<PrescriptionScanner authToken="test-token" />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-003')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('status-voided')).toBeInTheDocument()
    })

    expect(screen.getByText('Prescription Voided')).toBeInTheDocument()
    expect(screen.getByText('This prescription cannot be dispensed.')).toBeInTheDocument()
    expect(screen.getByTestId('dispense-btn-blocked')).toBeDisabled()
  })

  it('shows offline warning when network is unavailable (AC 4)', async () => {
    mockCheck.mockRejectedValue(new TypeError('Failed to fetch'))

    const user = userEvent.setup()
    render(<PrescriptionScanner authToken="test-token" />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-001')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('offline-warning')).toBeInTheDocument()
    })

    expect(screen.getByText('Status Cannot Be Verified')).toBeInTheDocument()
    expect(
      screen.getByText(/prescription status cannot be verified globally/i),
    ).toBeInTheDocument()
  })

  it('completes prescription on dispense button click (AC 5)', async () => {
    mockCheck.mockResolvedValue({
      prescriptionId: 'rx-001',
      status: 'AVAILABLE',
      medicationDisplay: 'Amoxicillin 500mg',
      authoredOn: '2026-04-20T10:00:00Z',
      dispensedAt: null,
    })

    mockComplete.mockResolvedValue({
      success: true,
      prescriptionId: 'rx-001',
      previousStatus: 'AVAILABLE',
      newStatus: 'FULFILLED',
      dispensedAt: '2026-04-29T12:00:00Z',
    })

    const onDispensed = vi.fn()
    const user = userEvent.setup()
    render(
      <PrescriptionScanner authToken="test-token" onDispensed={onDispensed} />,
    )

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-001')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('dispense-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('dispense-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('dispensed-confirmation')).toBeInTheDocument()
    })

    expect(screen.getByText('Prescription Dispensed')).toBeInTheDocument()
    expect(onDispensed).toHaveBeenCalledWith('rx-001')
    expect(mockComplete).toHaveBeenCalledWith('rx-001', 'test-token', expect.anything())
  })

  it('shows error for non-network failures', async () => {
    mockCheck.mockRejectedValue(new Error('Prescription not found'))

    const user = userEvent.setup()
    render(<PrescriptionScanner authToken="test-token" />)

    await user.type(screen.getByTestId('manual-prescription-input'), 'rx-bad')
    await user.click(screen.getByTestId('manual-check-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('scan-error')).toBeInTheDocument()
    })

    expect(screen.getByText('Prescription not found')).toBeInTheDocument()
  })

  it('disables check button when input is empty', () => {
    render(<PrescriptionScanner />)
    expect(screen.getByTestId('manual-check-btn')).toBeDisabled()
  })
})
