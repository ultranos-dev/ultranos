import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { EndShiftDialog } from '../components/shift/EndShiftDialog'
import { useAuthSessionStore } from '../stores/auth-session-store'
import type { LabRole } from '@ultranos/shared-types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock handover service so tests don't need a full Dexie environment
const mockGenerate = vi.fn()
const mockFinalize = vi.fn()
vi.mock('../lib/handover-service', () => ({
  generateHandoverReport: (...args: unknown[]) => mockGenerate(...args),
  finalizeHandover: (...args: unknown[]) => mockFinalize(...args),
}))

const MOCK_REPORT = {
  id: 'report-001',
  outgoingTechId: 'tech-001',
  outgoingTechName: 'Alice',
  incomingTechId: null,
  status: 'PENDING' as const,
  createdAt: new Date().toISOString(),
  acknowledgedAt: null,
  pendingSamples: { stat: 1, routine: 3, sampleIds: [] },
  equipmentAlerts: [],
  qcStatus: [],
  incompleteOrders: [],
  outgoingNotes: '',
  incomingNotes: null,
  shiftDate: '2026-05-31',
}

describe('EndShiftDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockResolvedValue(MOCK_REPORT)
    mockFinalize.mockResolvedValue(undefined)
    useAuthSessionStore.getState().setSession({
      userId: 'tech-001',
      practitionerId: 'p-001',
      role: 'LAB_TECH',
      sessionId: 's-001',
      email: 'alice@lab.test',
      labRole: 'LAB_TECH' as LabRole,
    })
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <EndShiftDialog isOpen={false} onClose={vi.fn()} onConfirmed={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows loading state then renders report data', async () => {
    render(<EndShiftDialog isOpen={true} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    // Initially loading
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // After report loads
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument() // stat count
      expect(screen.getByText('3')).toBeInTheDocument() // routine count
    })
  })

  it('renders the notes textarea and allows editing', async () => {
    render(<EndShiftDialog isOpen={true} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /notes/i })).toBeInTheDocument()
    })

    const textarea = screen.getByRole('textbox', { name: /notes/i })
    fireEvent.change(textarea, { target: { value: 'Freezer alarm active' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('Freezer alarm active')
  })

  it('advances to confirm step on "Review & Confirm"', async () => {
    render(<EndShiftDialog isOpen={true} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => screen.getByText('Review & Confirm'))
    fireEvent.click(screen.getByText('Review & Confirm'))

    expect(screen.getByText('confirmEndShift')).toBeInTheDocument()
  })

  it('calls finalizeHandover and onConfirmed when confirmed', async () => {
    const onConfirmed = vi.fn()
    render(<EndShiftDialog isOpen={true} onClose={vi.fn()} onConfirmed={onConfirmed} />)

    await waitFor(() => screen.getByText('Review & Confirm'))
    fireEvent.click(screen.getByText('Review & Confirm'))

    const confirmBtn = await screen.findByText('endShift')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalledWith('report-001', '')
      expect(onConfirmed).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error message when generation fails', async () => {
    mockGenerate.mockRejectedValue(new Error('DB failure'))
    render(<EndShiftDialog isOpen={true} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/failed to generate/i)).toBeInTheDocument()
    })
  })
})
