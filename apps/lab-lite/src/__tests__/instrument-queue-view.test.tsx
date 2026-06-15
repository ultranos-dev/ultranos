/**
 * Story 51.4 — Equipment Booking & Scheduling
 * Tests for InstrumentQueueView component
 *
 * AC covered:
 * AC 2: Queue renders with correct positions
 * AC 4: Next-in-line notification shown
 * AC 5: Manager override controls shown only for LAB_MANAGER
 * AC 6: Start Run / Complete Run flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { InstrumentQueueView } from '../components/equipment/InstrumentQueueView'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetInstruments = vi.fn()
const mockGetInstrumentQueue = vi.fn()
const mockStartBatch = vi.fn()
const mockCompleteBatch = vi.fn()
const mockCancelBatch = vi.fn()
const mockReorderQueue = vi.fn()
const mockGetActiveInstrumentNotifications = vi.fn()
const mockDismissInstrumentNotification = vi.fn()

vi.mock('../lib/equipment-service', () => ({
  getInstruments: (...args: any[]) => mockGetInstruments(...args),
  getInstrumentQueue: (...args: any[]) => mockGetInstrumentQueue(...args),
  startBatch: (...args: any[]) => mockStartBatch(...args),
  completeBatch: (...args: any[]) => mockCompleteBatch(...args),
  cancelBatch: (...args: any[]) => mockCancelBatch(...args),
  reorderQueue: (...args: any[]) => mockReorderQueue(...args),
  getActiveInstrumentNotifications: (...args: any[]) => mockGetActiveInstrumentNotifications(...args),
  dismissInstrumentNotification: (...args: any[]) => mockDismissInstrumentNotification(...args),
}))

vi.mock('../lib/audit-client', () => ({
  emitEquipmentAuditEvent: vi.fn(),
}))

const mockSession = {
  userId: 'user-1',
  practitionerId: 'tech-1',
  labRole: 'LAB_TECH',
  email: 'alice@lab.com',
}

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) =>
    selector({ session: mockSession, isAuthenticated: true }),
}))

const testInstrument = {
  id: 'inst-1',
  name: 'CBC Analyzer',
  type: 'Hematology Analyzer',
  model: 'Sysmex XN-1000',
  serialNumber: null,
  avgRunTimeMinutes: 15,
  status: 'IN_SERVICE',
  outOfServiceReason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function makeQueuedBatch(position: number, techId: string, techName: string, status = 'QUEUED') {
  return {
    id: `batch-${position}`,
    instrumentId: 'inst-1',
    techId,
    techName,
    sampleIds: [],
    sampleCount: 3,
    testType: 'CBC',
    estimatedRunMinutes: 15,
    position,
    status,
    cancelReason: null,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    estimatedStartTime: new Date(),
    estimatedCompletionTime: new Date(Date.now() + 15 * 60_000),
  }
}

const messages = {
  equipment: {
    instruments: 'Instruments',
    inService: 'In Service',
    outOfService: 'Out of Service',
    queue: 'Queue',
    queueBatch: 'Queue My Batch',
    currentBatch: 'Current Batch',
    emptyQueue: 'No batches in queue.',
    estimatedStart: 'Est. Start',
    estimatedCompletion: 'Est. Completion',
    startRun: 'Start Run',
    completeRun: 'Complete Run',
    cancelBatch: 'Cancel',
    moveUp: 'Move up',
    moveDown: 'Move down',
    nextInLine: 'Your batch for {instrument} is next. Prepare your samples.',
    avgRunTime: 'Avg. Run Time (min)',
    samples: 'samples',
    cancelReasonPrompt: 'Reason for cancelling:',
    overdue: 'Overdue',
    progress: 'Progress',
    statusQueued: 'Queued',
    statusRunning: 'Running',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    noInstruments: 'No instruments',
  },
}

function renderWithI18n(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSession.labRole = 'LAB_TECH'
  mockSession.practitionerId = 'tech-1'
  mockGetInstruments.mockResolvedValue([testInstrument])
  mockGetInstrumentQueue.mockResolvedValue([])
  mockGetActiveInstrumentNotifications.mockResolvedValue([])
  mockStartBatch.mockResolvedValue(undefined)
  mockCompleteBatch.mockResolvedValue(undefined)
  mockCancelBatch.mockResolvedValue(undefined)
  mockReorderQueue.mockResolvedValue(undefined)
  mockDismissInstrumentNotification.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstrumentQueueView (AC 2, 4, 5, 6)', () => {
  it('renders instrument selector and Queue My Batch button', async () => {
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('instrument-selector')).toBeInTheDocument()
      expect(screen.getByTestId('queue-my-batch-btn')).toBeInTheDocument()
    })
  })

  it('shows empty queue message when no batches', async () => {
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('empty-queue-message')).toBeInTheDocument()
    })
  })

  it('renders queue with correct position numbers', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice'),
      makeQueuedBatch(2, 'tech-2', 'Bob'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('queue-list')).toBeInTheDocument()
      expect(screen.getByTestId('batch-position-batch-1')).toHaveTextContent('1')
      expect(screen.getByTestId('batch-position-batch-2')).toHaveTextContent('2')
    })
  })

  it('shows Start Run for the current batch owner', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice', 'QUEUED'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('start-run-batch-1')).toBeInTheDocument()
    })
  })

  it('does NOT show Start Run for non-owner tech', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-99', 'Bob', 'QUEUED'), // different tech
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.queryByTestId('start-run-batch-1')).not.toBeInTheDocument()
    })
  })

  it('calls startBatch when Start Run is clicked', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice', 'QUEUED'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => screen.getByTestId('start-run-batch-1'))
    fireEvent.click(screen.getByTestId('start-run-batch-1'))
    await waitFor(() => {
      expect(mockStartBatch).toHaveBeenCalledWith('batch-1')
    })
  })

  it('shows Complete Run for running batch owner', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice', 'RUNNING'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('complete-run-batch-1')).toBeInTheDocument()
    })
  })

  it('does NOT show manager reorder controls for LAB_TECH', async () => {
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice'),
      makeQueuedBatch(2, 'tech-2', 'Bob'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => screen.getByTestId('queue-list'))
    expect(screen.queryByTestId('move-up-batch-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('move-down-batch-1')).not.toBeInTheDocument()
  })

  it('shows manager reorder controls for LAB_MANAGER', async () => {
    mockSession.labRole = 'LAB_MANAGER'
    mockGetInstrumentQueue.mockResolvedValue([
      makeQueuedBatch(1, 'tech-1', 'Alice'),
      makeQueuedBatch(2, 'tech-2', 'Bob'),
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      // Move-down on first batch should be visible
      expect(screen.getByTestId('move-down-batch-1')).toBeInTheDocument()
      // Move-up on second batch should be visible
      expect(screen.getByTestId('move-up-batch-2')).toBeInTheDocument()
    })
  })

  it('displays next-in-line notification for current tech', async () => {
    mockGetActiveInstrumentNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        techId: 'tech-1',
        instrumentId: 'inst-1',
        instrumentName: 'CBC Analyzer',
        batchId: 'batch-2',
        type: 'NEXT_IN_LINE' as const,
        message: 'Your batch for CBC Analyzer is next.',
        estimatedStartTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        dismissed: false,
      },
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => {
      expect(screen.getByTestId('instrument-notifications')).toBeInTheDocument()
      expect(screen.getByTestId('notif-notif-1')).toBeInTheDocument()
    })
  })

  it('calls dismissInstrumentNotification when dismiss button is clicked', async () => {
    mockGetActiveInstrumentNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        techId: 'tech-1',
        instrumentId: 'inst-1',
        instrumentName: 'CBC Analyzer',
        batchId: 'batch-2',
        type: 'NEXT_IN_LINE' as const,
        message: 'Your batch for CBC Analyzer is next.',
        estimatedStartTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        dismissed: false,
      },
    ])
    renderWithI18n(<InstrumentQueueView />)
    await waitFor(() => screen.getByTestId('notif-notif-1'))
    const dismissBtn = screen.getByTestId('notif-notif-1').querySelector('button')!
    fireEvent.click(dismissBtn)
    await waitFor(() => {
      expect(mockDismissInstrumentNotification).toHaveBeenCalledWith('notif-1')
    })
  })
})
