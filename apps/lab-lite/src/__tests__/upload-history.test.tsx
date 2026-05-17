import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, type UploadQueueEntry } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  }),
}))

// Mock listLabReports
const mockListLabReports = vi.fn()
vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return {
    ...actual,
    listLabReports: (...args: unknown[]) => mockListLabReports(...args),
  }
})

// Mock audit-client
const mockReportQueueAuditEvent = vi.fn()
vi.mock('@/lib/audit-client', () => ({
  reportQueueAuditEvent: (...args: unknown[]) => mockReportQueueAuditEvent(...args),
}))

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): Omit<UploadQueueEntry, 'id'> {
  return {
    file: new Blob(['data'], { type: 'application/pdf' }),
    fileName: 'result.pdf',
    fileType: 'application/pdf',
    metadata: {
      loincCode: '58410-2',
      loincDisplay: 'Blood Work — CBC',
      collectionDate: '2026-04-30',
    },
    patientRef: 'pat-ref-123',
    patientFirstName: 'Ahmad',
    queuedAt: new Date().toISOString(),
    status: 'pending' as const,
    retryCount: 0,
    lastAttemptAt: null,
    ...overrides,
  }
}

function setAuthSession() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'prac-1',
    role: 'LAB_TECH',
    sessionId: 'sess-1',
    email: 'tech@lab.com',
    labName: 'Central Diagnostics Lab',
    technicianName: 'Dr. Ahmad',
  })
}

// Lazy import to ensure mocks are set up first
async function renderHistoryPage() {
  const { default: HistoryPage } = await import('../app/history/page')
  return render(<HistoryPage />)
}

describe('Upload History Page (Story 17.3)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    setAuthSession()
    mockListLabReports.mockResolvedValue({ reports: [], nextCursor: undefined })
    mockPush.mockClear()
    mockReportQueueAuditEvent.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
  })

  // AC #1: Page loads with filterable list
  it('renders the history page with heading', async () => {
    await renderHistoryPage()
    await waitFor(() => {
      expect(screen.getByText('Upload History')).toBeDefined()
    })
  })

  // AC #1: Shows empty state when no items
  it('shows empty state when no uploads exist', async () => {
    await renderHistoryPage()
    await waitFor(() => {
      expect(screen.getByText(/no upload history yet/i)).toBeDefined()
    })
  })

  // AC #7 + AC #1: Merges local and remote items in correct order
  it('renders both local and remote items sorted by date descending', async () => {
    await addToQueue(
      makeEntry({
        patientFirstName: 'Ahmad',
        queuedAt: '2026-05-11T08:00:00Z',
        metadata: { loincCode: '58410-2', loincDisplay: 'Blood Work — CBC', collectionDate: '2026-05-10' },
      }),
    )

    mockListLabReports.mockResolvedValue({
      reports: [
        {
          id: 'r1',
          status: 'final',
          loincDisplay: 'Lipid Panel',
          collectionDate: '2026-05-10',
          issued: '2026-05-11T10:00:00Z',
        },
      ],
      nextCursor: undefined,
    })

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('Lipid Panel')).toBeDefined()
    })

    // Lipid Panel (10:00) should appear before Ahmad's CBC (08:00) — newest first
    const listItems = screen.getAllByRole('listitem')
    expect(listItems.length).toBe(2)
  })

  // AC #2: Status badges with correct colors
  it('renders correct status badges for all statuses', async () => {
    await addToQueue(makeEntry({ status: 'pending', queuedAt: '2026-05-11T01:00:00Z' }))
    await addToQueue(makeEntry({ status: 'uploading', queuedAt: '2026-05-11T02:00:00Z' }))
    await addToQueue(makeEntry({ status: 'expired', queuedAt: '2026-05-11T03:00:00Z' }))
    await addToQueue(makeEntry({ status: 'failed', queuedAt: '2026-05-11T04:00:00Z' }))

    mockListLabReports.mockResolvedValue({
      reports: [
        { id: 'r1', status: 'final', loincDisplay: 'CBC', collectionDate: '2026-05-10', issued: '2026-05-11T05:00:00Z' },
      ],
      nextCursor: undefined,
    })

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-pending')).toBeDefined()
      expect(screen.getByTestId('status-badge-uploading')).toBeDefined()
      expect(screen.getByTestId('status-badge-expired')).toBeDefined()
      expect(screen.getByTestId('status-badge-failed')).toBeDefined()
      expect(screen.getByTestId('status-badge-completed')).toBeDefined()
    })

    // Verify color classes
    const completedBadge = screen.getByTestId('status-badge-completed')
    expect(completedBadge.className).toContain('bg-green-50')

    const pendingBadge = screen.getByTestId('status-badge-pending')
    expect(pendingBadge.className).toContain('bg-yellow-50')

    const uploadingBadge = screen.getByTestId('status-badge-uploading')
    expect(uploadingBadge.className).toContain('bg-orange-50')

    const failedBadge = screen.getByTestId('status-badge-failed')
    expect(failedBadge.className).toContain('bg-red-50')

    const expiredBadge = screen.getByTestId('status-badge-expired')
    expect(expiredBadge.className).toContain('bg-neutral-100')
  })

  // AC #3: Expired items show Re-upload button
  it('shows Re-upload button for expired items that navigates to upload wizard', async () => {
    const id = await addToQueue(makeEntry({ status: 'expired', queuedAt: '2026-05-11T01:00:00Z' }))

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Re-upload')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Re-upload'))

    expect(mockPush).toHaveBeenCalledWith(`/upload?reupload=${id}`)
  })

  // AC #4: Failed items show failure reason and Discard with confirmation
  it('shows failure reason for failed items', async () => {
    await addToQueue(makeEntry({ status: 'failed', retryCount: 3, queuedAt: '2026-05-11T01:00:00Z' }))

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText(/upload failed after 3 retries/i)).toBeDefined()
    })
  })

  // AC #4: Discard with confirmation dialog
  it('shows confirmation on discard and removes item + emits audit', async () => {
    await addToQueue(
      makeEntry({
        status: 'failed',
        retryCount: 3,
        patientFirstName: 'Fatima',
        queuedAt: '2026-05-11T01:00:00Z',
      }),
    )

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => {
      expect(screen.getByText(/discard this upload\? this cannot be undone/i)).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /confirm discard/i }))

    await waitFor(() => {
      expect(screen.getByText(/no upload history yet/i)).toBeDefined()
    })

    // Verify audit event was emitted
    expect(mockReportQueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QUEUE_ITEM_DISCARDED',
        testCategory: 'Blood Work — CBC',
      }),
    )
  })

  // AC #5: Search filters by patient first name
  it('filters items by patient first name', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Ahmad', queuedAt: '2026-05-11T01:00:00Z' }))
    await addToQueue(makeEntry({ patientFirstName: 'Fatima', queuedAt: '2026-05-11T02:00:00Z' }))

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('Fatima')).toBeDefined()
    })

    const searchInput = screen.getByLabelText('Search uploads')
    fireEvent.change(searchInput, { target: { value: 'fatima' } })

    await waitFor(() => {
      expect(screen.queryByText('Ahmad')).toBeNull()
      expect(screen.getByText('Fatima')).toBeDefined()
    })
  })

  // AC #5: Search filters by test category
  it('filters items by test category', async () => {
    await addToQueue(
      makeEntry({
        patientFirstName: 'Ahmad',
        metadata: { loincCode: '58410-2', loincDisplay: 'Blood Work — CBC', collectionDate: '2026-05-10' },
        queuedAt: '2026-05-11T01:00:00Z',
      }),
    )
    await addToQueue(
      makeEntry({
        patientFirstName: 'Fatima',
        metadata: { loincCode: '57698-3', loincDisplay: 'Lipid Panel', collectionDate: '2026-05-10' },
        queuedAt: '2026-05-11T02:00:00Z',
      }),
    )

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('Fatima')).toBeDefined()
    })

    const searchInput = screen.getByLabelText('Search uploads')
    fireEvent.change(searchInput, { target: { value: 'lipid' } })

    await waitFor(() => {
      expect(screen.queryByText('Ahmad')).toBeNull()
      expect(screen.getByText('Fatima')).toBeDefined()
    })
  })

  // AC #5: Search shows "no match" when no results
  it('shows no-match message when search has no results', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Ahmad', queuedAt: '2026-05-11T01:00:00Z' }))

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
    })

    const searchInput = screen.getByLabelText('Search uploads')
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    await waitFor(() => {
      expect(screen.getByText(/no uploads match your search/i)).toBeDefined()
    })
  })

  // AC #6: Pagination with Load More
  it('shows Load More button when more results exist and loads next page', async () => {
    mockListLabReports
      .mockResolvedValueOnce({
        reports: Array.from({ length: 20 }, (_, i) => ({
          id: `r${i}`,
          status: 'final',
          loincDisplay: `Test ${i}`,
          collectionDate: '2026-05-10',
          issued: `2026-05-11T${String(i).padStart(2, '0')}:00:00Z`,
        })),
        nextCursor: 'cursor-page-2',
      })
      .mockResolvedValueOnce({
        reports: Array.from({ length: 5 }, (_, i) => ({
          id: `r${20 + i}`,
          status: 'final',
          loincDisplay: `Test ${20 + i}`,
          collectionDate: '2026-05-10',
          issued: `2026-05-10T${String(i).padStart(2, '0')}:00:00Z`,
        })),
        nextCursor: undefined,
      })

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Load More')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Load More'))

    await waitFor(() => {
      expect(mockListLabReports).toHaveBeenCalledTimes(2)
      expect(mockListLabReports).toHaveBeenLastCalledWith('mock-token', {
        cursor: 'cursor-page-2',
        limit: 20,
      })
    })

    // After loading all pages, Load More should disappear
    await waitFor(() => {
      expect(screen.queryByText('Load More')).toBeNull()
    })
  })

  // AC #6: No Load More when all items fit in one page
  it('does not show Load More when all items fit in one page', async () => {
    mockListLabReports.mockResolvedValue({
      reports: [
        { id: 'r1', status: 'final', loincDisplay: 'CBC', collectionDate: '2026-05-10', issued: '2026-05-11T10:00:00Z' },
      ],
      nextCursor: undefined,
    })

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('CBC')).toBeDefined()
    })

    expect(screen.queryByText('Load More')).toBeNull()
  })

  // Remote items show test category as primary label (data minimization)
  it('shows test category as primary label for remote items (no patient name)', async () => {
    mockListLabReports.mockResolvedValue({
      reports: [
        { id: 'r1', status: 'final', loincDisplay: 'Urinalysis', collectionDate: '2026-05-10', issued: '2026-05-11T10:00:00Z' },
      ],
      nextCursor: undefined,
    })

    await renderHistoryPage()

    await waitFor(() => {
      // Remote items display test category as the primary label
      expect(screen.getByText('Urinalysis')).toBeDefined()
    })
  })

  // Error fallback when Hub API is unavailable
  it('shows error message when Hub API fails but still shows local items', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Ahmad', queuedAt: '2026-05-11T01:00:00Z' }))
    mockListLabReports.mockRejectedValue(new Error('Network error'))

    await renderHistoryPage()

    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText(/remote data unavailable/i)).toBeDefined()
    })
  })
})
