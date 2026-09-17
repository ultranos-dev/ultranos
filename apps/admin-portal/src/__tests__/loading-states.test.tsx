/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for 4-state (loading → error/unavailable → confirmed-empty → data) surfaces.
 * Verifies: error never shows false empty; loading gates empty; on error shows unavailable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock next/navigation ────────────────────────────────────────
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
  redirect: vi.fn(),
}))

// ── Mock supabase ────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// ── Mock auth session store ──────────────────────────────────────
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// ── tRPC mocks ───────────────────────────────────────────────────
const mockRecentActivity = vi.fn()
const mockListSurveillanceAlerts = vi.fn()
const mockGetAuditChainStatus = vi.fn()
const mockListAuditChainVerifications = vi.fn()
const mockTriggerFullChainVerification = vi.fn()
const mockGetModelManifest = vi.fn()
const mockGetModelUpdateStats = vi.fn()
const mockGetInventoryOverview = vi.fn()
const mockGetRedistributionRecommendations = vi.fn()
const mockListPurchaseOrders = vi.fn()
const mockListSuppliers = vi.fn()
const mockGetClinicalSafetyMetrics = vi.fn()
const mockListClinicalSafetyReports = vi.fn()
const mockGetClinicalSafetyReport = vi.fn()
const mockListAnomalyAlerts = vi.fn()
const mockListMentorshipPairings = vi.fn()
const mockGetMentorshipStats = vi.fn()
const mockGetMentorshipPairingDetail = vi.fn()
const mockExportAlerts = vi.fn()
const mockDashboardStats = vi.fn()
const mockSubscription = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      recentActivity: { query: (...a: any[]) => mockRecentActivity(...a) },
      listSurveillanceAlerts: { query: (...a: any[]) => mockListSurveillanceAlerts(...a) },
      getAuditChainStatus: { query: (...a: any[]) => mockGetAuditChainStatus(...a) },
      listAuditChainVerifications: { query: (...a: any[]) => mockListAuditChainVerifications(...a) },
      triggerFullChainVerification: { mutate: (...a: any[]) => mockTriggerFullChainVerification(...a) },
      getModelManifest: { query: (...a: any[]) => mockGetModelManifest(...a) },  // not used here; ai router used
      getModelUpdateStats: { query: (...a: any[]) => mockGetModelUpdateStats(...a) }, // not used here
      getInventoryOverview: { query: (...a: any[]) => mockGetInventoryOverview(...a) },
      getRedistributionRecommendations: { query: (...a: any[]) => mockGetRedistributionRecommendations(...a) },
      listPurchaseOrders: { query: (...a: any[]) => mockListPurchaseOrders(...a) },
      listSuppliers: { query: (...a: any[]) => mockListSuppliers(...a) },
      getClinicalSafetyMetrics: { query: (...a: any[]) => mockGetClinicalSafetyMetrics(...a) },
      listClinicalSafetyReports: { query: (...a: any[]) => mockListClinicalSafetyReports(...a) },
      getClinicalSafetyReport: { query: (...a: any[]) => mockGetClinicalSafetyReport(...a) },
      listAnomalyAlerts: { query: (...a: any[]) => mockListAnomalyAlerts(...a) },
      exportAlerts: { query: (...a: any[]) => mockExportAlerts(...a) },
      listMentorshipPairings: { query: (...a: any[]) => mockListMentorshipPairings(...a) },
      getMentorshipStats: { query: (...a: any[]) => mockGetMentorshipStats(...a) },
      getMentorshipPairingDetail: { query: (...a: any[]) => mockGetMentorshipPairingDetail(...a) },
      dashboardStats: { query: (...a: any[]) => mockDashboardStats(...a) },
      listEligibleMentors: { query: () => Promise.resolve([]) },
      listAllLabStaff: { query: () => Promise.resolve({ items: [], nextCursor: null }) },
      createMentorshipPairing: { mutate: vi.fn() },
      dissolveMentorshipPairing: { mutate: vi.fn() },
      updateOrderStatus: { mutate: vi.fn() },
      createPurchaseOrder: { mutate: vi.fn() },
      createSupplier: { mutate: vi.fn() },
      updateSupplier: { mutate: vi.fn() },
    },
    ai: {
      getModelManifest: { query: (...a: any[]) => mockGetModelManifest(...a) },
      getModelUpdateStats: { query: (...a: any[]) => mockGetModelUpdateStats(...a) },
      publishModelVersion: { mutate: vi.fn() },
    },
    subscription: {
      getOrgSubscriptions: { query: (...a: any[]) => mockSubscription(...a) },
    },
  },
}))

// Import components after mocks
const { RecentActivityFeed } = await import('../components/dashboard/RecentActivityFeed')
const { SurveillanceAlertHistory } = await import('../components/alerts/SurveillanceAlertHistory')
const { default: AuditPage } = await import('../app/[locale]/audit/page')
const { default: AIModelsPage } = await import('../app/[locale]/ai-models/page')
const { default: InventoryPage } = await import('../app/[locale]/inventory/page')
const { default: AlertsPage } = await import('../app/[locale]/alerts/page')
const { default: MentorshipPage } = await import('../app/[locale]/mentorship/page')

// ── Shared mock data ─────────────────────────────────────────────
const MOCK_CHAIN_STATUS = {
  lastVerifiedAt: '2026-09-15T10:00:00Z',
  lastResult: true,
  chainHealthy: true,
  consecutiveSuccesses: 5,
  lastCheckedCount: 1000,
}

const MOCK_AUDIT_HISTORY = {
  verifications: [
    {
      id: 'v1',
      verifiedAt: '2026-09-15T10:00:00Z',
      checkedCount: 1000,
      valid: true,
      brokenAtEventId: null,
      jobDurationMs: 250,
      errorReason: null,
      isFullVerification: false,
      triggeredBy: 'CRON',
    },
  ],
  total: 1,
}

const MOCK_INVENTORY = {
  labs: [{ id: 'lab-1', name: 'Lab Alpha' }],
  reagentCategories: ['Malaria RDT'],
  cells: [{ labId: 'lab-1', labName: 'Lab Alpha', reagentCategory: 'Malaria RDT', quantity: 10, unit: 'tests', reportedAt: '2026-09-14T10:00:00Z', stockLevel: 'GREEN' }],
}

const MOCK_PAIRINGS = {
  items: [
    {
      id: 'p1',
      mentorName: 'Alice Supervisor',
      mentorEmail: 'alice@lab.com',
      menteeName: 'Bob Junior',
      menteeEmail: 'bob@lab.com',
      labName: 'Central Lab',
      startDate: '2026-04-01',
      status: 'ACTIVE',
      dissolvedAt: null,
      dissolvedReason: null,
    },
  ],
  nextCursor: null,
}

const MOCK_STATS = {
  totalPaired: 1,
  unmatchedTechs: 0,
  avgPairingDurationDays: 30,
  checkinCompletionRate: 80,
}

// ════════════════════════════════════════════════════════════════
// Surface 1 — RecentActivityFeed
// ════════════════════════════════════════════════════════════════

describe('Surface 1 — RecentActivityFeed', () => {
  it('shows loading text while fetch is pending (no false empty flash)', () => {
    mockRecentActivity.mockReturnValue(new Promise(() => {})) // never resolves
    render(<RecentActivityFeed />)
    expect(screen.getByText('Loading activity…')).toBeInTheDocument()
    // Must NOT show "No recent activity" before data settles
    expect(screen.queryByText('No recent activity.')).not.toBeInTheDocument()
  })

  it('on error shows unavailable message (not vanish, not empty)', async () => {
    mockRecentActivity.mockRejectedValue(new Error('Network error'))
    render(<RecentActivityFeed />)
    await waitFor(() => {
      expect(screen.getByText('Activity unavailable')).toBeInTheDocument()
    })
    // Must NOT show empty state text
    expect(screen.queryByText('No recent activity.')).not.toBeInTheDocument()
  })

  it('on loaded-zero shows confirmed empty state (not unavailable)', async () => {
    mockRecentActivity.mockResolvedValue({ activities: [] })
    render(<RecentActivityFeed />)
    await waitFor(() => {
      expect(screen.getByText('No recent activity.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Activity unavailable')).not.toBeInTheDocument()
  })

  it('renders activity items when data loads', async () => {
    mockRecentActivity.mockResolvedValue({
      activities: [{
        id: 'a1',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        actorId: 'u1',
        action: 'APPROVE',
        resourceType: 'USER',
        resourceId: 'r1',
        outcome: 'SUCCESS',
        description: 'Dr. Smith was approved',
      }],
    })
    render(<RecentActivityFeed />)
    await waitFor(() => {
      expect(screen.getByText('Dr. Smith was approved')).toBeInTheDocument()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 2 — SurveillanceAlertHistory
// ════════════════════════════════════════════════════════════════

describe('Surface 2 — SurveillanceAlertHistory', () => {
  it('on error does NOT show empty state (only the error banner)', async () => {
    mockListSurveillanceAlerts.mockRejectedValue(new Error('Server error'))
    render(<SurveillanceAlertHistory />)
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
    // Empty-state title should not appear alongside error
    expect(screen.queryByText(/No surveillance alerts found/)).not.toBeInTheDocument()
  })

  it('on loaded-zero shows confirmed empty state', async () => {
    mockListSurveillanceAlerts.mockResolvedValue({ alerts: [], total: 0 })
    render(<SurveillanceAlertHistory />)
    await waitFor(() => {
      expect(screen.getByText(/No surveillance alerts found/)).toBeInTheDocument()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 3 — Audit page / verification history
// ════════════════════════════════════════════════════════════════

describe('Surface 3 — Audit page verification history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('on error does NOT show empty history table (error banner shown, no false empty)', async () => {
    mockGetAuditChainStatus.mockRejectedValue(new Error('Audit load failed'))
    mockListAuditChainVerifications.mockRejectedValue(new Error('Audit load failed'))
    render(<AuditPage />)
    await waitFor(() => {
      expect(screen.getByText('Audit load failed')).toBeInTheDocument()
    })
    expect(screen.queryByText('No verification history yet.')).not.toBeInTheDocument()
  })

  it('on loaded-zero shows confirmed empty history state', async () => {
    mockGetAuditChainStatus.mockResolvedValue(MOCK_CHAIN_STATUS)
    mockListAuditChainVerifications.mockResolvedValue({ verifications: [], total: 0 })
    render(<AuditPage />)
    await waitFor(() => {
      expect(screen.getByText('No verification history yet.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Audit load failed')).not.toBeInTheDocument()
  })

  it('renders verification rows when data loads', async () => {
    mockGetAuditChainStatus.mockResolvedValue(MOCK_CHAIN_STATUS)
    mockListAuditChainVerifications.mockResolvedValue(MOCK_AUDIT_HISTORY)
    render(<AuditPage />)
    await waitFor(() => {
      expect(screen.getByText('Scheduled')).toBeInTheDocument()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 4 — AI Models page
// ════════════════════════════════════════════════════════════════

describe('Surface 4 — AI Models page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('on error does NOT show "No models" empty cell (shows unavailable instead)', async () => {
    mockGetModelManifest.mockRejectedValue(new Error('Models fetch failed'))
    mockGetModelUpdateStats.mockRejectedValue(new Error('Models fetch failed'))
    render(<AIModelsPage />)
    await waitFor(() => {
      // Error banner shown
      expect(screen.getByText('Models fetch failed')).toBeInTheDocument()
    })
    // Should show unavailable message in table, NOT the zero-data empty
    expect(screen.getByText('Model data unavailable — could not load.')).toBeInTheDocument()
    expect(screen.queryByText('No models registered yet.')).not.toBeInTheDocument()
  })

  it('on loaded-zero shows "No models" empty state (not unavailable)', async () => {
    mockGetModelManifest.mockResolvedValue({ models: [] })
    mockGetModelUpdateStats.mockResolvedValue({ modelStats: [], totalStaleDeviceEvents: 0, drugDbStalenessIncidents: 0 })
    render(<AIModelsPage />)
    await waitFor(() => {
      expect(screen.getByText('No models registered yet.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Model data unavailable — could not load.')).not.toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 5a — Inventory heatmap (error gating)
// ════════════════════════════════════════════════════════════════

describe('Surface 5a — Inventory heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListSuppliers.mockResolvedValue({ suppliers: [] })
    mockGetRedistributionRecommendations.mockResolvedValue({ recommendations: [] })
    mockListPurchaseOrders.mockResolvedValue({ orders: [], total: 0 })
  })

  it('on heatmap error does NOT show "No inventory data" empty state', async () => {
    mockGetInventoryOverview.mockRejectedValue(new Error('Inventory unavailable'))
    mockGetRedistributionRecommendations.mockRejectedValue(new Error('Inventory unavailable'))
    render(<InventoryPage />)
    await waitFor(() => {
      expect(screen.getByText('Inventory unavailable')).toBeInTheDocument()
    })
    expect(screen.queryByText('No inventory data')).not.toBeInTheDocument()
  })

  it('on loaded-zero shows heatmap empty state', async () => {
    mockGetInventoryOverview.mockResolvedValue({ labs: [], reagentCategories: [], cells: [] })
    render(<InventoryPage />)
    await waitFor(() => {
      expect(screen.getByText('No inventory data')).toBeInTheDocument()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 5b — Inventory orders tab (no flash before load settles)
// ════════════════════════════════════════════════════════════════

describe('Surface 5b — Inventory orders tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInventoryOverview.mockResolvedValue(MOCK_INVENTORY)
    mockGetRedistributionRecommendations.mockResolvedValue({ recommendations: [] })
    mockListSuppliers.mockResolvedValue({ suppliers: [] })
  })

  it('shows loading state on tab switch before orders settle (no false empty flash)', async () => {
    // Orders fetch never resolves — simulates slow network
    mockListPurchaseOrders.mockReturnValue(new Promise(() => {}))

    const user = userEvent.setup()
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Heat Map')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Purchase Orders'))

    // Should show loading, NOT empty state
    expect(screen.getByText('Loading purchase orders...')).toBeInTheDocument()
    expect(screen.queryByText('No purchase orders found.')).not.toBeInTheDocument()
  })

  it('on orders error does NOT show empty state', async () => {
    mockListPurchaseOrders.mockRejectedValue(new Error('Orders fetch failed'))

    const user = userEvent.setup()
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Heat Map')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Purchase Orders'))

    await waitFor(() => {
      expect(screen.getByText('Orders fetch failed')).toBeInTheDocument()
    })
    expect(screen.queryByText('No purchase orders found.')).not.toBeInTheDocument()
  })

  it('on loaded-zero shows confirmed empty orders state', async () => {
    mockListPurchaseOrders.mockResolvedValue({ orders: [], total: 0 })

    const user = userEvent.setup()
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Heat Map')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Purchase Orders'))

    await waitFor(() => {
      expect(screen.getByText('No purchase orders found.')).toBeInTheDocument()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 6 — Alerts / ClinicalSafetySection (reports error gate)
// ════════════════════════════════════════════════════════════════

describe('Surface 6 — Alerts ClinicalSafetySection', () => {
  const MOCK_METRICS = {
    interactionCheckCompletionRate: 98,
    completionRateStatus: 'OK' as const,
    contraindicatedOverrideRate: 1,
    overrideRateStatus: 'OK' as const,
    unresolvedTier1Conflicts: 0,
    oldestTier1AgeHours: null,
    tier1Status: 'OK' as const,
    totalPrescriptions24h: 50,
    totalChecks7d: 200,
    overrides7d: 2,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockListAnomalyAlerts.mockResolvedValue({ alerts: [], total: 0 })
    mockExportAlerts.mockResolvedValue({ data: '' })
  })

  it('on reports-only error shows unavailable (not empty) for reports section', async () => {
    mockGetClinicalSafetyMetrics.mockResolvedValue(MOCK_METRICS)
    mockListClinicalSafetyReports.mockRejectedValue(new Error('Reports unavailable'))

    const user = userEvent.setup()
    render(<AlertsPage />)

    // Switch to Clinical Safety tab
    await waitFor(() => {
      expect(screen.getByText('Clinical Safety')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Clinical Safety'))

    await waitFor(() => {
      // Metrics still loaded
      expect(screen.getByText('Interaction Check Completion (24h)')).toBeInTheDocument()
    })

    // Reports section shows unavailable, not empty
    expect(screen.getByText('Monthly reports unavailable — could not load.')).toBeInTheDocument()
    expect(screen.queryByText('No monthly reports generated yet.')).not.toBeInTheDocument()
  })

  it('on loaded-zero reports shows confirmed empty state (not unavailable)', async () => {
    mockGetClinicalSafetyMetrics.mockResolvedValue(MOCK_METRICS)
    mockListClinicalSafetyReports.mockResolvedValue({ reports: [] })

    const user = userEvent.setup()
    render(<AlertsPage />)

    await waitFor(() => {
      expect(screen.getByText('Clinical Safety')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Clinical Safety'))

    await waitFor(() => {
      expect(screen.getByText('No monthly reports generated yet.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Monthly reports unavailable — could not load.')).not.toBeInTheDocument()
  })

  it('while reports fetch is pending, does NOT show "no reports" empty state (reportsLoading gate)', async () => {
    // Metrics resolve immediately; reports are held pending (deferred promise)
    mockGetClinicalSafetyMetrics.mockResolvedValue(MOCK_METRICS)
    mockListClinicalSafetyReports.mockReturnValue(new Promise(() => {})) // never resolves

    const user = userEvent.setup()
    render(<AlertsPage />)

    await waitFor(() => {
      expect(screen.getByText('Clinical Safety')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Clinical Safety'))

    // Metrics section should be visible once metrics resolve
    await waitFor(() => {
      expect(screen.getByText('Interaction Check Completion (24h)')).toBeInTheDocument()
    })

    // The "no reports" empty state must NOT appear while reports are still loading
    expect(screen.queryByText('No monthly reports generated yet.')).not.toBeInTheDocument()
    // The loading indicator should be shown instead
    expect(screen.getByText('Loading monthly reports…')).toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════
// Surface 7 — Mentorship PairingDetailPanel
// ════════════════════════════════════════════════════════════════

describe('Surface 7 — Mentorship PairingDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMentorshipPairings.mockResolvedValue(MOCK_PAIRINGS)
    mockGetMentorshipStats.mockResolvedValue(MOCK_STATS)
  })

  it('on detail fetch error shows unavailable row (not null/collapsed)', async () => {
    mockGetMentorshipPairingDetail.mockRejectedValue(new Error('Detail unavailable'))

    const user = userEvent.setup()
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    // Click row to expand detail panel
    await user.click(screen.getByText('Alice Supervisor'))

    await waitFor(() => {
      expect(screen.getByText(/Details unavailable/)).toBeInTheDocument()
    })
  })

  it('on successful detail fetch renders pairing details', async () => {
    mockGetMentorshipPairingDetail.mockResolvedValue({
      id: 'p1',
      mentorName: 'Alice Supervisor',
      mentorPractitionerId: 'mp1',
      menteeName: 'Bob Junior',
      menteePractitionerId: 'mp2',
      labName: 'Central Lab',
      goals: 'Learn PCR techniques',
      status: 'ACTIVE',
      startDate: '2026-04-01',
      dissolvedAt: null,
      dissolvedReason: null,
      dissolvedNotes: null,
      createdAt: '2026-04-01T00:00:00Z',
      checkins: [],
    })

    const user = userEvent.setup()
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Alice Supervisor'))

    await waitFor(() => {
      expect(screen.getByText('Learn PCR techniques')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Details unavailable/)).not.toBeInTheDocument()
  })
})
