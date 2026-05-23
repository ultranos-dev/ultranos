import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, type UploadQueueEntry } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'

// Mock next-intl — supports namespaced useTranslations('dashboard') and root useTranslations()
const i18nMessages: Record<string, Record<string, string>> = {
  common: { loading: 'Loading...', retry: 'Try Again' },
  dashboard: {
    labIdentity: 'Lab Identity',
    defaultLabName: 'Lab',
    defaultTechName: 'Technician',
    uploadQueue: 'Upload Queue',
    pending: 'Pending',
    uploading: 'Uploading',
    failed: 'Failed',
    expired: 'Expired',
    todaysActivity: "Today's Activity",
    completed: 'Completed',
    pendingReview: 'Pending Review',
    recentUploads: 'Recent Uploads',
    noUploadsYet: 'No uploads yet',
    uploadNewResult: 'Upload New Result',
  },
  status: {
    completed: 'Completed',
    pending: 'Pending',
    uploading: 'Uploading',
    failed: 'Failed',
    expired: 'Expired',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace) {
      return i18nMessages[namespace]?.[key] ?? `${namespace}.${key}`
    }
    // Root-level: key is "namespace.key"
    const [ns, ...rest] = key.split('.')
    const k = rest.join('.')
    return i18nMessages[ns]?.[k] ?? key
  },
  useLocale: () => 'en',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): Omit<UploadQueueEntry, 'id'> {
  return {
    file: new Blob(['data'], { type: 'application/pdf' }),
    fileName: 'result.pdf',
    fileType: 'application/pdf',
    metadata: {
      loincCode: '58410-2',
      loincDisplay: 'Blood Work \u2014 CBC',
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
async function renderDashboard() {
  const { default: LabHomePage } = await import('../app/[locale]/page')
  return render(<LabHomePage />)
}

describe('Lab Dashboard (Story 17.1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    setAuthSession()
    mockListLabReports.mockResolvedValue({ reports: [], nextCursor: undefined })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
  })

  // AC #1: Dashboard replaces "Coming Soon"
  it('renders the dashboard (no Coming Soon placeholder)', async () => {
    await renderDashboard()
    await waitFor(() => {
      expect(screen.queryByText(/coming soon/i)).toBeNull()
    })
  })

  // AC #2: Lab identity card with lab name and technician name
  it('displays lab identity card with lab name and technician name', async () => {
    await renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Central Diagnostics Lab')).toBeDefined()
      expect(screen.getByText('Dr. Ahmad')).toBeDefined()
    })
  })

  // AC #3: Queue status card shows counts by status
  it('shows correct queue counts from Dexie', async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    await addToQueue(makeEntry({ status: 'pending', queuedAt: '2026-05-11T01:00:00Z' }))
    await addToQueue(makeEntry({ status: 'pending', queuedAt: '2026-05-11T02:00:00Z' }))
    await addToQueue(makeEntry({ status: 'uploading', queuedAt: '2026-05-11T03:00:00Z' }))
    await addToQueue(makeEntry({ status: 'failed', queuedAt: '2026-05-11T04:00:00Z' }))
    await addToQueue(makeEntry({ status: 'expired', queuedAt: '2026-05-11T05:00:00Z' }))

    await renderDashboard()

    await waitFor(() => {
      const headings = screen.getAllByText('Pending')
      expect(headings.length).toBeGreaterThan(0)
    })

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined()
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2)
    })
  })

  // AC #4: Today's activity summary
  it('shows today activity summary from Hub API', async () => {
    const todayIso = new Date().toISOString()
    mockListLabReports.mockResolvedValue({
      reports: [
        { id: 'r1', status: 'final', loincDisplay: 'CBC', collectionDate: '2026-05-10', issued: todayIso },
        { id: 'r2', status: 'preliminary', loincDisplay: 'Lipid Panel', collectionDate: '2026-05-10', issued: todayIso },
        { id: 'r3', status: 'final', loincDisplay: 'Glucose', collectionDate: '2026-05-10', issued: todayIso },
      ],
      nextCursor: undefined,
    })

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Pending Review')).toBeDefined()
      expect(screen.getByText('2')).toBeDefined()
    })
  })

  // AC #5: Quick action button navigates to /upload
  it('renders "Upload New Result" button linking to /upload', async () => {
    await renderDashboard()

    await waitFor(() => {
      const link = screen.getByText('Upload New Result')
      expect(link).toBeDefined()
      expect(link.closest('a')?.getAttribute('href')).toBe('/upload')
    })
  })

  // AC #6: Recent uploads list with status badges
  it('merges local queue and remote reports into recent uploads', async () => {
    await addToQueue(
      makeEntry({
        status: 'pending',
        metadata: { loincCode: '58410-2', loincDisplay: 'Blood Work \u2014 CBC', collectionDate: '2026-05-10' },
        queuedAt: '2026-05-11T10:00:00Z',
      }),
    )

    mockListLabReports.mockResolvedValue({
      reports: [
        {
          id: 'r1',
          status: 'final',
          loincDisplay: 'Lipid Panel',
          collectionDate: '2026-05-10',
          issued: '2026-05-11T09:00:00Z',
        },
      ],
      nextCursor: undefined,
    })

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Blood Work \u2014 CBC')).toBeDefined()
      expect(screen.getByText('Lipid Panel')).toBeDefined()
    })

    await waitFor(() => {
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
    })
  })

  // AC #6: Status badges colors
  it('renders correct status badges for different statuses', async () => {
    await addToQueue(makeEntry({ status: 'failed', queuedAt: '2026-05-11T10:00:00Z' }))
    await addToQueue(makeEntry({ status: 'expired', queuedAt: '2026-05-11T09:00:00Z' }))

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(2)
    })
  })

  // AC #7: Auto-refresh fires at 60-second intervals
  it('auto-refreshes data every 60 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await renderDashboard()

    await waitFor(() => {
      expect(mockListLabReports).toHaveBeenCalledTimes(1)
    })

    vi.advanceTimersByTime(60_000)

    await waitFor(() => {
      expect(mockListLabReports).toHaveBeenCalledTimes(2)
    })

    vi.advanceTimersByTime(60_000)

    await waitFor(() => {
      expect(mockListLabReports).toHaveBeenCalledTimes(3)
    })
  })

  // AC #6: Recent uploads limited to 10
  it('limits recent uploads list to 10 items', async () => {
    for (let i = 0; i < 8; i++) {
      await addToQueue(
        makeEntry({
          status: 'pending',
          queuedAt: `2026-05-11T${String(i).padStart(2, '0')}:00:00Z`,
          metadata: { loincCode: '58410-2', loincDisplay: `Test ${i}`, collectionDate: '2026-05-10' },
        }),
      )
    }

    mockListLabReports.mockResolvedValue({
      reports: Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        status: 'final',
        loincDisplay: `Remote Test ${i}`,
        collectionDate: '2026-05-10',
        issued: `2026-05-10T${String(i).padStart(2, '0')}:00:00Z`,
      })),
      nextCursor: undefined,
    })

    await renderDashboard()

    await waitFor(() => {
      const listItems = screen.getAllByRole('listitem')
      expect(listItems.length).toBe(10)
    })
  })

  // Empty state
  it('shows empty state when no uploads exist', async () => {
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText(/no uploads yet/i)).toBeDefined()
    })
  })

  // All 4 card sections rendered
  it('renders all 4 card sections', async () => {
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Lab Identity')).toBeDefined()
      expect(screen.getByText('Upload Queue')).toBeDefined()
      expect(screen.getByText("Today's Activity")).toBeDefined()
      expect(screen.getByText('Upload New Result')).toBeDefined()
    })
  })
})
