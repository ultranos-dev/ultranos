import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { HandoverAcknowledgment } from '../components/shift/HandoverAcknowledgment'
import type { HandoverReport } from '../lib/db'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockAcknowledge = vi.fn()
vi.mock('../lib/handover-service', () => ({
  acknowledgeHandover: (...args: unknown[]) => mockAcknowledge(...args),
}))

const MOCK_REPORT: HandoverReport = {
  id: 'report-001',
  outgoingTechId: 'tech-001',
  outgoingTechName: 'Alice',
  incomingTechId: null,
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  acknowledgedAt: null,
  pendingSamples: { stat: 2, routine: 4, sampleIds: [] },
  equipmentAlerts: [{ instrumentId: 'inst-1', instrumentName: 'Centrifuge A', alertType: 'TEMPERATURE_EXCURSION' }],
  qcStatus: [{ analyte: 'Glucose', status: 'PASS' }],
  incompleteOrders: [],
  outgoingNotes: 'Freezer alarm still active',
  incomingNotes: null,
  shiftDate: '2026-05-31',
}

describe('HandoverAcknowledgment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAcknowledge.mockResolvedValue(undefined)
  })

  it('renders the sticky banner with outgoing tech name and time', () => {
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('shows pending sample counts in the banner', () => {
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )
    // Total = 2 + 4 = 6 pending samples in summary
    expect(screen.getByText(/6 pending sample/)).toBeInTheDocument()
  })

  it('expands to show full report details when clicking "View details"', async () => {
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('View details'))

    await waitFor(() => {
      expect(screen.getByText('Centrifuge A — TEMPERATURE_EXCURSION')).toBeInTheDocument()
      expect(screen.getByText('Freezer alarm still active')).toBeInTheDocument()
    })
  })

  it('renders the optional notes textarea when expanded', async () => {
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('View details'))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /optional/i })).toBeInTheDocument()
    })
  })

  it('calls acknowledgeHandover and onAcknowledged when button clicked', async () => {
    const onAcknowledged = vi.fn()
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={onAcknowledged}
      />,
    )

    fireEvent.click(screen.getByText('View details'))
    await waitFor(() => screen.getByText('acknowledge'))

    const notes = screen.getByRole('textbox', { name: /optional/i })
    fireEvent.change(notes, { target: { value: 'Understood' } })

    fireEvent.click(screen.getByText('acknowledge'))

    await waitFor(() => {
      expect(mockAcknowledge).toHaveBeenCalledWith('report-001', 'tech-002', 'Understood')
      expect(onAcknowledged).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error if acknowledgment fails', async () => {
    mockAcknowledge.mockRejectedValue(new Error('Network error'))
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('View details'))
    await waitFor(() => screen.getByText('acknowledge'))
    fireEvent.click(screen.getByText('acknowledge'))

    await waitFor(() => {
      expect(screen.getByText(/failed to acknowledge/i)).toBeInTheDocument()
    })
  })

  it('cannot be dismissed without acknowledgment (no close button)', () => {
    render(
      <HandoverAcknowledgment
        report={MOCK_REPORT}
        incomingTechId="tech-002"
        onAcknowledged={vi.fn()}
      />,
    )
    // No dismiss or X button should exist
    expect(screen.queryByRole('button', { name: /dismiss|close|skip/i })).toBeNull()
  })
})
