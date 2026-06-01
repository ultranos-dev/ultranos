/**
 * Send-Outs Dashboard Page Tests — Story 54.4 / Tasks 14.7, 14.9
 *
 * Covers: table renders with data, overdue alert banner, status filter,
 * empty state, Update Status and Import Result action buttons,
 * and RTL layout snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { SendOut, ReferenceLab } from '../types/reference-lab'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetOverdueSendOuts = vi.fn()
const mockGetDb = vi.fn()
const mockSession = { userId: 'user-001', labRole: 'LAB_TECH' }

vi.mock('../lib/sendout-tat', () => ({
  getOverdueSendOuts: mockGetOverdueSendOuts,
}))

vi.mock('@/lib/sendout-tat', () => ({
  getOverdueSendOuts: mockGetOverdueSendOuts,
}))

vi.mock('../lib/db', () => ({ getDb: mockGetDb }))
vi.mock('@/lib/db', () => ({ getDb: mockGetDb }))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  AlertTriangle: ({ size, className }: { size: number; className?: string }) => (
    <span data-testid="alert-icon" data-size={size} className={className} />
  ),
  Clock: ({ size }: { size: number }) => <span data-testid="clock-icon" data-size={size} />,
  X: () => <button data-testid="close-btn" />,
  Send: () => <span data-testid="send-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
  FileText: () => <span data-testid="filetext-icon" />,
  ChevronRight: () => <span data-testid="chevron-icon" />,
}))

// Stub child modals to keep page tests focused
vi.mock('@/components/sendout/StatusUpdateModal', () => ({
  StatusUpdateModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="status-update-modal">
      <button onClick={onClose}>close-status-modal</button>
    </div>
  ),
}))

vi.mock('@/components/sendout/ResultImportModal', () => ({
  ResultImportModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="result-import-modal">
      <button onClick={onClose}>close-result-modal</button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO_SENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

function makeSendOut(overrides: Partial<SendOut> = {}): SendOut {
  const now = new Date().toISOString()
  return {
    id: 'so-001',
    sampleId: 'sample-001',
    referenceLabId: 'lab-001',
    testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    clinicalContext: 'hyperlipidemia',
    status: 'sent',
    sentAt: ISO_SENT,
    receivedAt: null,
    processingStartedAt: null,
    resultsAvailableAt: null,
    cancelledAt: null,
    shippingManifestId: 'manifest-001',
    referralFormId: 'referral-001',
    resultId: null,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

function makeLab(overrides: Partial<ReferenceLab> = {}): ReferenceLab {
  const now = new Date().toISOString()
  return {
    id: 'lab-001',
    name: 'Kabul Reference Lab',
    accreditationNumber: 'AFG-LAB-001',
    address: 'Kabul',
    supportedTests: ['2085-9'],
    averageTATDays: { '2085-9': 5 },
    isActive: true,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

function setupDb(sendOuts: SendOut[], labs: ReferenceLab[]) {
  mockGetDb.mockReturnValue({
    send_outs: {
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(sendOuts),
        }),
      }),
    },
    reference_labs: {
      toArray: vi.fn().mockResolvedValue(labs),
      get: vi.fn().mockResolvedValue(labs[0] ?? null),
    },
  })
}

async function renderPage() {
  const { default: SendOutsPage } = await import('../app/[locale]/sendouts/page')
  return render(<SendOutsPage />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOverdueSendOuts.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendOutsPage — table rendering', () => {
  it('renders page heading', async () => {
    setupDb([], [])
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Send-Outs')).toBeInTheDocument()
    })
  })

  it('renders empty state when no send-outs', async () => {
    setupDb([], [])
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText(/No send-outs found/)).toBeInTheDocument()
    })
  })

  it('renders send-out row with lab name and test', async () => {
    const so = makeSendOut()
    const lab = makeLab()
    setupDb([so], [lab])
    await renderPage()

    // Lab name appears in both the filter dropdown and the table row
    await waitFor(() => {
      expect(screen.getAllByText('Kabul Reference Lab').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Cholesterol')).toBeInTheDocument()
  })

  it('shows status badge for send-out', async () => {
    setupDb([makeSendOut({ status: 'received' })], [makeLab()])
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Received')).toBeInTheDocument()
    })
  })
})

describe('SendOutsPage — overdue alert banner', () => {
  it('shows overdue alert when there are overdue send-outs', async () => {
    const overdueOut = makeSendOut({ id: 'so-overdue' })
    mockGetOverdueSendOuts.mockResolvedValue([overdueOut])
    setupDb([makeSendOut()], [makeLab()])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })

  it('hides overdue alert when nothing is overdue', async () => {
    mockGetOverdueSendOuts.mockResolvedValue([])
    setupDb([makeSendOut()], [makeLab()])

    await renderPage()

    // Wait for data to load (lab name appears in filter dropdown and/or table)
    await waitFor(() => screen.getAllByText('Kabul Reference Lab'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows correct count in overdue alert', async () => {
    mockGetOverdueSendOuts.mockResolvedValue([
      makeSendOut({ id: 'so-1' }),
      makeSendOut({ id: 'so-2' }),
    ])
    setupDb([makeSendOut()], [makeLab()])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText(/2 send-outs are overdue/i)).toBeInTheDocument()
    })
  })
})

describe('SendOutsPage — status filter', () => {
  it('filters to show only matching status rows', async () => {
    const sent = makeSendOut({ id: 'so-sent', status: 'sent' })
    const received = makeSendOut({ id: 'so-recv', status: 'received' })
    setupDb([sent, received], [makeLab()])

    await renderPage()
    await waitFor(() => screen.getAllByText(/Kabul Reference Lab/))

    const filterSelect = screen.getByRole('combobox', { name: /Filter by status/ })
    fireEvent.change(filterSelect, { target: { value: 'received' } })

    // The 'Received' status badge should appear in the table
    const receivedBadge = screen.getByRole('cell', { name: 'Received' })
    expect(receivedBadge).toBeInTheDocument()
    // The 'Sent' status badge in the table body should not appear (it's filtered out)
    expect(screen.queryByRole('cell', { name: 'Sent' })).not.toBeInTheDocument()
  })
})

describe('SendOutsPage — action buttons', () => {
  it('shows Update Status button for active send-outs', async () => {
    setupDb([makeSendOut({ status: 'sent' })], [makeLab()])
    await renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Update Status/ })).toBeInTheDocument()
    })
  })

  it('hides Update Status for results-available send-outs', async () => {
    setupDb([makeSendOut({ status: 'results-available' })], [makeLab()])
    await renderPage()

    await waitFor(() => screen.getByText('Results Available'))

    expect(screen.queryByRole('button', { name: /Update Status/ })).not.toBeInTheDocument()
  })

  it('opens status update modal on button click', async () => {
    setupDb([makeSendOut({ status: 'sent' })], [makeLab()])
    await renderPage()

    const btn = await waitFor(() => screen.getByRole('button', { name: /Update Status/ }))
    fireEvent.click(btn)

    expect(screen.getByTestId('status-update-modal')).toBeInTheDocument()
  })

  it('opens result import modal on Import Result click', async () => {
    setupDb([makeSendOut({ status: 'processing' })], [makeLab()])
    await renderPage()

    const btn = await waitFor(() => screen.getByRole('button', { name: /Import Result/ }))
    fireEvent.click(btn)

    expect(screen.getByTestId('result-import-modal')).toBeInTheDocument()
  })
})

describe('SendOutsPage — RTL layout (Task 14.9)', () => {
  it('renders correctly in RTL layout', async () => {
    setupDb([makeSendOut()], [makeLab()])
    const { container } = await renderPage()

    await waitFor(() => screen.getAllByText('Kabul Reference Lab'))

    container.setAttribute('dir', 'rtl')
    expect(container).toMatchSnapshot()
  })
})
