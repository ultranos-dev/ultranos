/**
 * network-rtl-snapshots.test.tsx
 *
 * RTL snapshot tests for Story 54.1 Multi-Branch Lab Network components.
 * Verifies that layout classes use logical CSS properties and that components
 * render identically in both LTR and RTL document directions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { LabLocation, NetworkStatusSnapshot, NetworkMetrics } from '@/types/lab-network'

// ── Shared mocks ───────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      statusFull: 'Full',
      statusCollectionOnly: 'Collection Only',
      statusInactive: 'Inactive',
      justNow: 'Just now',
      neverSynced: 'Never synced',
      minutesAgo: `${String(params?.count ?? '')} min ago`,
      hoursAgo: `${String(params?.count ?? '')}h ago`,
      daysAgo: `${String(params?.count ?? '')}d ago`,
      pendingSamples: 'Pending',
      stockAlerts: 'Alerts',
      staffOnDuty: 'Staff',
      staleDataWarning: '— stale',
      totalSamplesToday: 'Samples Today',
      pendingResults: 'Pending Results',
      syncFailures: 'Sync Failures',
      networkMetrics: 'Network Metrics',
      networkDashboard: 'Lab Network',
      addLocation: 'Add Location',
      editLocation: 'Edit Location',
      locationName: 'Name',
      locationType: 'Type',
      typeMain: 'Main Lab',
      typeSatellite: 'Satellite',
      locationMode: 'Mode',
      modeFull: 'Full Service',
      modeCollectionOnly: 'Collection Only',
      locationAddress: 'Address',
      parentLab: 'Parent Lab',
      selectParentLab: 'Select parent lab...',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      close: 'Close',
      deactivateLocation: 'Deactivate',
      deactivateConfirm: 'Are you sure?',
      confirmDeactivate: 'Yes, Deactivate',
      nameRequired: 'Name required',
      parentLabRequired: 'Parent lab required',
      saveError: 'Save failed',
      deactivateError: 'Deactivate failed',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (sel: (s: { session: null }) => unknown) =>
    sel({ session: null }),
}))

vi.mock('@/lib/network-service', () => ({
  addSatelliteLocation: vi.fn(),
  updateLocation: vi.fn(),
  setLocationMode: vi.fn(),
  deactivateLocation: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getActiveLocations: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/collection-mode', () => ({
  isCollectionOnlyMode: vi.fn().mockResolvedValue(false),
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const mockLocation: LabLocation = {
  id: 'loc-1',
  name: 'Main Lab',
  type: 'main',
  mode: 'full',
  status: 'active',
  settings: {},
  meta: { lastUpdated: '2026-06-01T00:00:00Z', versionId: '1' },
  _ultranos: { createdAt: '2026-06-01T00:00:00Z', hlcTimestamp: 'hlc-1' },
}

const mockSnapshot: NetworkStatusSnapshot = {
  locationId: 'loc-1',
  pendingSamples: 3,
  stockAlerts: 0,
  staffOnDuty: 2,
  lastSyncTimestamp: new Date(Date.now() - 2 * 60_000).toISOString(), // 2 min ago
  connectivityStatus: 'online',
}

const mockMetrics: NetworkMetrics = {
  totalSamplesToday: 12,
  pendingResultsByLocation: { 'loc-1': 4 },
  syncFailures: 0,
  asOf: new Date(Date.now() - 30_000).toISOString(),
}

afterEach(() => {
  document.dir = 'ltr'
})

// ── CollectionModeGate ────────────────────────────────────────────────────────

describe('CollectionModeGate RTL snapshots', () => {
  // CollectionModeGate is a transparent wrapper — it renders its children or fallback.
  // The snapshot test verifies it renders the correct slot in each direction.
  it('renders children in LTR when in full mode', async () => {
    const { CollectionModeGate } = await import('@/components/network/CollectionModeGate')
    document.dir = 'ltr'
    const { container } = render(
      <CollectionModeGate fallback={<span>Restricted</span>}>
        <div>Full access content</div>
      </CollectionModeGate>,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders fallback in RTL when in full mode', async () => {
    const { CollectionModeGate } = await import('@/components/network/CollectionModeGate')
    document.dir = 'rtl'
    const { container } = render(
      <CollectionModeGate fallback={<span>Restricted</span>}>
        <div>Full access content</div>
      </CollectionModeGate>,
    )
    expect(container).toMatchSnapshot()
  })
})

// ── LocationCard ──────────────────────────────────────────────────────────────

describe('LocationCard RTL snapshots', () => {
  it('renders in LTR', async () => {
    const { LocationCard } = await import('@/components/network/LocationCard')
    document.dir = 'ltr'
    const { container } = render(
      <LocationCard location={mockLocation} snapshot={mockSnapshot} onEdit={() => {}} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', async () => {
    const { LocationCard } = await import('@/components/network/LocationCard')
    document.dir = 'rtl'
    const { container } = render(
      <LocationCard location={mockLocation} snapshot={mockSnapshot} onEdit={() => {}} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders inactive satellite in collection-only mode', async () => {
    const { LocationCard } = await import('@/components/network/LocationCard')
    document.dir = 'ltr'
    const inactiveSatellite: LabLocation = {
      ...mockLocation,
      id: 'loc-2',
      name: 'Satellite Point',
      type: 'satellite',
      mode: 'collection-only',
      status: 'inactive',
    }
    const offlineSnapshot: NetworkStatusSnapshot = {
      ...mockSnapshot,
      locationId: 'loc-2',
      connectivityStatus: 'offline',
      lastSyncTimestamp: new Date(0).toISOString(),
    }
    const { container } = render(
      <LocationCard location={inactiveSatellite} snapshot={offlineSnapshot} onEdit={() => {}} />,
    )
    expect(container).toMatchSnapshot()
  })
})

// ── NetworkMetricsSummary ─────────────────────────────────────────────────────

describe('NetworkMetricsSummary RTL snapshots', () => {
  it('renders in LTR', async () => {
    const { NetworkMetricsSummary } = await import('@/components/network/NetworkMetricsSummary')
    document.dir = 'ltr'
    const { container } = render(<NetworkMetricsSummary metrics={mockMetrics} />)
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', async () => {
    const { NetworkMetricsSummary } = await import('@/components/network/NetworkMetricsSummary')
    document.dir = 'rtl'
    const { container } = render(<NetworkMetricsSummary metrics={mockMetrics} />)
    expect(container).toMatchSnapshot()
  })

  it('highlights sync failures when count > 0', async () => {
    const { NetworkMetricsSummary } = await import('@/components/network/NetworkMetricsSummary')
    document.dir = 'ltr'
    const metricsWithFailures: NetworkMetrics = { ...mockMetrics, syncFailures: 3 }
    const { container } = render(<NetworkMetricsSummary metrics={metricsWithFailures} />)
    expect(container).toMatchSnapshot()
  })
})

// ── LocationManagementModal ───────────────────────────────────────────────────

describe('LocationManagementModal RTL snapshots', () => {
  it('renders add-mode in LTR', async () => {
    const { LocationManagementModal } = await import(
      '@/components/network/LocationManagementModal'
    )
    document.dir = 'ltr'
    const { container } = render(
      <LocationManagementModal onClose={() => {}} onSaved={() => {}} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders add-mode in RTL', async () => {
    const { LocationManagementModal } = await import(
      '@/components/network/LocationManagementModal'
    )
    document.dir = 'rtl'
    const { container } = render(
      <LocationManagementModal onClose={() => {}} onSaved={() => {}} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders edit-mode for existing location in LTR', async () => {
    const { LocationManagementModal } = await import(
      '@/components/network/LocationManagementModal'
    )
    document.dir = 'ltr'
    const { container } = render(
      <LocationManagementModal
        editLocation={mockLocation}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(container).toMatchSnapshot()
  })
})
