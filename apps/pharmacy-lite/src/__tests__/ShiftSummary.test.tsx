import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockGetShiftSummary } = vi.hoisted(() => ({
  mockGetShiftSummary: vi.fn(),
}))

vi.mock('@/lib/history-data', () => ({
  getShiftSummary: mockGetShiftSummary,
}))

import { ShiftSummary } from '@/components/pharmacy/ShiftSummary'

describe('ShiftSummary', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShiftSummary.mockResolvedValue({
      totalPrescriptions: 12,
      totalMedicationItems: 18,
      syncSuccessRate: 92,
      unresolvedFailures: [],
    })
  })

  it('renders loading state initially', () => {
    // Return a promise that never resolves to keep loading state
    mockGetShiftSummary.mockReturnValue(new Promise(() => {}))
    render(<ShiftSummary onClose={onClose} />)
    expect(screen.getByTestId('shift-summary-loading')).toBeInTheDocument()
  })

  it('displays prescription count', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('stat-prescriptions')).toHaveTextContent('12')
    })
  })

  it('displays medication items count', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('stat-items')).toHaveTextContent('18')
    })
  })

  it('displays sync success rate', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('stat-sync-rate')).toHaveTextContent('92%')
    })
  })

  it('displays 100% sync rate in green', async () => {
    mockGetShiftSummary.mockResolvedValue({
      totalPrescriptions: 5,
      totalMedicationItems: 5,
      syncSuccessRate: 100,
      unresolvedFailures: [],
    })

    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      const rateEl = screen.getByTestId('stat-sync-rate')
      expect(rateEl).toHaveTextContent('100%')
      expect(rateEl.className).toContain('text-green-700')
    })
  })

  it('shows unresolved failures when present', async () => {
    mockGetShiftSummary.mockResolvedValue({
      totalPrescriptions: 3,
      totalMedicationItems: 4,
      syncSuccessRate: 67,
      unresolvedFailures: [
        {
          id: 'fail-1',
          patientFirstName: 'Ahmad',
          medicationNames: ['Metformin 500mg'],
          whenHandedOver: '2026-05-12T09:00:00.000Z',
          pharmacistDisplay: 'Dr. Reza',
          syncStatus: 'failed',
        },
      ],
    })

    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('unresolved-failures')).toBeInTheDocument()
    })
    expect(screen.getByText('Metformin 500mg')).toBeInTheDocument()
  })

  it('hides unresolved failures section when none', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-stats')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('unresolved-failures')).not.toBeInTheDocument()
  })

  it('calls onClose when close button clicked', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-close')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('shift-summary-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when overlay background clicked', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-overlay')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('shift-summary-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders as accessible dialog', async () => {
    render(<ShiftSummary onClose={onClose} />)
    await waitFor(() => {
      const overlay = screen.getByTestId('shift-summary-overlay')
      expect(overlay).toHaveAttribute('role', 'dialog')
      expect(overlay).toHaveAttribute('aria-modal', 'true')
    })
  })
})
