/**
 * WasteContainerList — 4-state loading tests (loading-states fix)
 *
 * Safety surface: waste container state is safety-relevant.
 * A load error must be visible, not silently shown as "no containers".
 * A previous bug: no try/catch meant loading never cleared on error (skeleton forever).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { WasteContainer } from '@/types/waste-tracking'
import { ContainerStatus, FillLevel } from '@/types/waste-tracking'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

// ── db + waste-alerts mocks ───────────────────────────────────────────────────
const mockGetAllContainers = vi.fn()
const mockCheckWasteAlerts = vi.fn()

vi.mock('@/lib/db', () => ({
  getAllContainers: (...args: unknown[]) => mockGetAllContainers(...args),
}))

vi.mock('@/lib/safety/waste-alerts', () => ({
  checkWasteAlerts: (...args: unknown[]) => mockCheckWasteAlerts(...args),
}))

// ── ui-kit mocks ──────────────────────────────────────────────────────────────
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  TriangleAlert: () => <span data-testid="triangle-alert-icon" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeContainer(overrides: Partial<WasteContainer> = {}): WasteContainer {
  return {
    id: 'c-001',
    location: 'Station 1',
    type: 'SHARPS',
    status: ContainerStatus.ACTIVE,
    fillLevel: FillLevel.QUARTER,
    startDate: new Date().toISOString(),
    disposalDate: null,
    ...overrides,
  } as unknown as WasteContainer
}

async function renderList() {
  const { WasteContainerList } = await import('../components/safety/WasteContainerList')
  return render(
    <WasteContainerList
      onActivateNew={vi.fn()}
      onSelectContainer={vi.fn()}
    />,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WasteContainerList — 4-state loading', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckWasteAlerts.mockResolvedValue([])
  })

  it('does NOT stay stuck in skeleton when DB throws (loading clears)', async () => {
    mockGetAllContainers.mockRejectedValue(new Error('IndexedDB unavailable'))

    await renderList()

    // After error, the skeleton (aria-busy) should be gone
    await waitFor(() => {
      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument()
      // The loading skeleton renders divs with aria-busy; error state renders alert
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows error/unavailable state (not empty) when DB throws', async () => {
    mockGetAllContainers.mockRejectedValue(new Error('IndexedDB unavailable'))

    await renderList()

    // Must show error state
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // Error EmptyState has our loadError key
    expect(screen.getByTestId('empty-state').textContent).toContain('loadError')
    // Must NOT show the genuine "no containers" empty text
    expect(screen.queryByText('empty')).not.toBeInTheDocument()
  })

  it('shows genuine empty state when load succeeds with zero containers', async () => {
    mockGetAllContainers.mockResolvedValue([])

    await renderList()

    await waitFor(() => {
      expect(screen.getByText('empty')).toBeInTheDocument()
    })
    // No error when data loaded cleanly
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders container rows when load succeeds with data', async () => {
    mockGetAllContainers.mockResolvedValue([makeContainer()])

    await renderList()

    await waitFor(() => {
      expect(screen.getByText('Station 1')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
