import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// next-intl context isn't provided in unit tests; components only need the key/locale.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock Dexie DB
const mockEncountersOrderBy = vi.fn()
const _mockEncountersFilter = vi.fn()
const mockSyncQueueFilter = vi.fn()
const mockPatientsGet = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    encounters: {
      orderBy: mockEncountersOrderBy,
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      }),
    },
    syncQueue: {
      filter: mockSyncQueueFilter,
    },
    patients: {
      get: mockPatientsGet,
    },
    observations: { toArray: vi.fn().mockResolvedValue([]) },
  },
}))

// Mock notification API
vi.mock('@/lib/notification-api', () => ({
  fetchNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
  fetchUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
}))

// Mock use-patient-search
vi.mock('@/lib/use-patient-search', () => ({
  usePatientSearch: () => ({ search: vi.fn() }),
}))

// Mock patient-store so ClinicalDashboard renders without real Zustand/audit deps.
// ClinicalDashboard calls usePatientStore() (no selector) to destructure state directly.
vi.mock('@/stores/patient-store', () => {
  const mockState = {
    query: '',
    results: [],
    isSearching: false,
    searchError: null,
    selectPatient: vi.fn(),
    setQuery: vi.fn(),
    setResults: vi.fn(),
    clearSearch: vi.fn(),
    setIsSearching: vi.fn(),
    setSearchError: vi.fn(),
    setSyncStatus: vi.fn(),
    syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
    selectedPatient: null,
  }
  return {
    usePatientStore: (selector?: (s: typeof mockState) => unknown) =>
      selector ? selector(mockState) : mockState,
  }
})

// Mock DuplicateReviewsCard to avoid Hub API fetch in unit tests
vi.mock('@/components/dashboard/DuplicateReviewsCard', () => ({
  DuplicateReviewsCard: () => <div data-testid="duplicate-reviews-card">Duplicate Reviews</div>,
}))

// Mock encounter-store (used by TodayEncountersCard and RecentEncountersList)
vi.mock('@/stores/encounter-store', () => ({
  useEncounterStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { activeEncounter: null }
    return selector(state)
  },
}))

// Mock sync-engine
vi.mock('@ultranos/sync-engine', () => ({
  HybridLogicalClock: vi.fn().mockImplementation(() => ({
    now: () => ({ wallTime: Date.now(), counter: 0, nodeId: 'test' }),
  })),
  serializeHlc: () => new Date().toISOString(),
  enqueueSyncAction: vi.fn(),
}))

// Mock audit
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  AuditResourceType: { ENCOUNTER: 'ENCOUNTER', PATIENT: 'PATIENT' },
}))

// Mock sync-queue
vi.mock('@/lib/sync-queue', () => ({
  syncQueue: {},
}))

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiRE9DVE9SIiwibmFtZSI6IkRyIEFobWVkIn0.fake',
            user: { email: 'ahmed@hospital.com', user_metadata: { full_name: 'Dr Ahmed' } },
          },
        },
      }),
      signOut: vi.fn(),
    },
  }),
}))

// Mock notification panel
vi.mock('@/components/NotificationPanel', () => ({
  NotificationBell: () => <div data-testid="notification-bell">bell</div>,
}))

// Mock SyncPulse
vi.mock('@/components/SyncPulse', () => ({
  SyncPulse: () => <div data-testid="sync-pulse">pulse</div>,
}))

import { useAuthSessionStore } from '@/stores/auth-session-store'

function setupAuthSession() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'prac-001',
    role: 'DOCTOR',
    sessionId: 'sess-abc',
    email: 'ahmed@hospital.com',
    name: 'Dr Ahmed',
    token: 'mock-jwt-token',
  })
}

describe('TodayEncountersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEncountersOrderBy.mockReturnValue({
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
  })

  it('renders with zero encounters', async () => {
    // Card renders t('todayEncounters') — mock returns the i18n key
    // After loading state resolves, the count 0 becomes visible
    const { TodayEncountersCard } = await import('@/components/dashboard/TodayEncountersCard')
    render(<TodayEncountersCard />)
    expect(screen.getByText('todayEncounters')).toBeDefined()
    await vi.waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
  })

  it('shows count when encounters exist', async () => {
    const todayIso = new Date().toISOString()
    mockEncountersOrderBy.mockReturnValue({
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { id: '1', status: 'finished', _ultranos: { hlcTimestamp: todayIso } },
          { id: '2', status: 'in-progress', _ultranos: { hlcTimestamp: todayIso } },
        ]),
      }),
    })

    const { TodayEncountersCard } = await import('@/components/dashboard/TodayEncountersCard')
    render(<TodayEncountersCard />)

    // Wait for async state update
    await vi.waitFor(() => {
      expect(screen.getByText('2')).toBeDefined()
    })
  })

  it('shows active encounter indicator', async () => {
    const todayIso = new Date().toISOString()
    mockEncountersOrderBy.mockReturnValue({
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { id: '1', status: 'in-progress', _ultranos: { hlcTimestamp: todayIso } },
        ]),
      }),
    })

    const { TodayEncountersCard } = await import('@/components/dashboard/TodayEncountersCard')
    render(<TodayEncountersCard />)

    // Card renders t('activeConsultation') — mock returns the i18n key
    await vi.waitFor(() => {
      expect(screen.getByText('activeConsultation')).toBeDefined()
    })
  })
})

describe('PendingLabResultsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with zero unread lab results', async () => {
    // Card renders t('pendingLabResults') — mock returns the i18n key
    const { PendingLabResultsCard } = await import('@/components/dashboard/PendingLabResultsCard')
    render(<PendingLabResultsCard />)
    expect(screen.getByText('pendingLabResults')).toBeDefined()
    await vi.waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
  })

  it('shows count of unread LAB_RESULT_AVAILABLE notifications only', async () => {
    const { fetchNotifications } = await import('@/lib/notification-api')
    vi.mocked(fetchNotifications).mockResolvedValue({
      notifications: [
        { id: '1', type: 'LAB_RESULT_AVAILABLE', status: 'UNREAD', payload: {}, createdAt: '', deliveredAt: null, acknowledgedAt: null },
        { id: '2', type: 'LAB_RESULT_AVAILABLE', status: 'ACKNOWLEDGED', payload: {}, createdAt: '', deliveredAt: null, acknowledgedAt: null },
        { id: '3', type: 'SYNC_CONFLICT', status: 'UNREAD', payload: {}, createdAt: '', deliveredAt: null, acknowledgedAt: null },
      ],
    })

    const { PendingLabResultsCard } = await import('@/components/dashboard/PendingLabResultsCard')
    render(<PendingLabResultsCard />)

    await vi.waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
  })
})

describe('UnresolvedConflictsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSyncQueueFilter.mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
    })
  })

  it('renders with zero conflicts', async () => {
    // Card renders t('unresolvedConflicts') — mock returns the i18n key
    // After loading state resolves, the count 0 becomes visible
    const { UnresolvedConflictsCard } = await import('@/components/dashboard/UnresolvedConflictsCard')
    render(<UnresolvedConflictsCard />)
    expect(screen.getByText('unresolvedConflicts')).toBeDefined()
    await vi.waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
  })

  it('shows physician review badge when conflicts exist', async () => {
    mockSyncQueueFilter.mockReturnValue({
      count: vi.fn().mockResolvedValue(3),
    })

    const { UnresolvedConflictsCard } = await import('@/components/dashboard/UnresolvedConflictsCard')
    render(<UnresolvedConflictsCard />)

    // Card renders t('physicianReview') — mock returns the i18n key
    await vi.waitFor(() => {
      expect(screen.getByText(/physicianReview/)).toBeDefined()
    })
  })
})

describe('RecentEncountersList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEncountersOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
  })

  it('shows empty state when no encounters', async () => {
    // Card renders t('recentEncounters') and t('noEncountersYet') — mock returns i18n keys
    const { RecentEncountersList } = await import('@/components/dashboard/RecentEncountersList')
    render(<RecentEncountersList />)
    expect(screen.getByText('recentEncounters')).toBeDefined()
    await vi.waitFor(() => {
      expect(screen.getByText('noEncountersYet')).toBeDefined()
    })
  })

  it('displays encounters with patient names and status', async () => {
    mockEncountersOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            {
              id: 'enc-1',
              status: 'finished',
              subject: { reference: 'Patient/pat-1' },
              _ultranos: { hlcTimestamp: '2026-05-11T10:00:00Z' },
              meta: { lastUpdated: '2026-05-11T10:00:00Z' },
            },
          ]),
        }),
      }),
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
    mockPatientsGet.mockResolvedValue({
      id: 'pat-1',
      _ultranos: { nameLocal: 'Fatima Al-Hassan' },
    })

    const { RecentEncountersList } = await import('@/components/dashboard/RecentEncountersList')
    render(<RecentEncountersList />)

    await vi.waitFor(() => {
      expect(screen.getByText('Fatima Al-Hassan')).toBeDefined()
      // 'finished' status renders as t('statusCompleted') — mock returns i18n key
      expect(screen.getByText('statusCompleted')).toBeDefined()
    })
  })

  it('links each encounter to /encounter/[patientId]', async () => {
    mockEncountersOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            {
              id: 'enc-1',
              status: 'finished',
              subject: { reference: 'Patient/pat-1' },
              _ultranos: { hlcTimestamp: '2026-05-11T10:00:00Z' },
              meta: { lastUpdated: '2026-05-11T10:00:00Z' },
            },
          ]),
        }),
      }),
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
    mockPatientsGet.mockResolvedValue({
      id: 'pat-1',
      _ultranos: { nameLocal: 'Ahmed' },
    })

    const { RecentEncountersList } = await import('@/components/dashboard/RecentEncountersList')
    const { container } = render(<RecentEncountersList />)

    await vi.waitFor(() => {
      const link = container.querySelector('a[href="/encounter/pat-1"]')
      expect(link).toBeDefined()
      expect(link).not.toBeNull()
    })
  })
})

describe('ClinicalDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuthSession()
    mockEncountersOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
    mockSyncQueueFilter.mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
    })
  })

  it('renders welcome header with practitioner name', async () => {
    // ClinicalDashboard renders t('welcome', { name }) — the next-intl mock returns the i18n key
    // with interpolated values: 'welcome {"name":"Dr Ahmed"}'.
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByText(/Dr Ahmed/)).toBeDefined()
  })

  it('renders practitioner role', async () => {
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByText('Doctor')).toBeDefined()
  })

  it('renders Find patient button', async () => {
    // ClinicalDashboard renders t('findPatient') — mock returns the i18n key 'findPatient'.
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByText('findPatient')).toBeDefined()
  })

  it('renders inline patient search', async () => {
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByLabelText('Patient search')).toBeDefined()
  })

  it('renders all four summary cards', async () => {
    // Cards render i18n keys via the next-intl mock
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByText('todayEncounters')).toBeDefined()
    expect(screen.getByText('pendingLabResults')).toBeDefined()
    expect(screen.getByText('unresolvedConflicts')).toBeDefined()
    // DuplicateReviewsCard is mocked above
    expect(screen.getByTestId('duplicate-reviews-card')).toBeDefined()
  })

  it('renders recent encounters section', async () => {
    // RecentEncountersList renders t('recentEncounters') — mock returns i18n key
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.getByText('recentEncounters')).toBeDefined()
  })

  it('does NOT render SyncPulse or NotificationBell (moved to shell layout)', async () => {
    // SyncPulse and NotificationBell moved to the app shell — ClinicalDashboard no longer renders them.
    const { ClinicalDashboard } = await import('@/components/dashboard/ClinicalDashboard')
    render(<ClinicalDashboard />)
    expect(screen.queryByTestId('sync-pulse')).toBeNull()
    expect(screen.queryByTestId('notification-bell')).toBeNull()
  })
})
