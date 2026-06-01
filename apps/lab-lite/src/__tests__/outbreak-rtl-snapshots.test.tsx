/**
 * Outbreak Components RTL Layout Snapshots — Story 54.5 (Task 15.9)
 *
 * Snapshot tests for all outbreak components in both LTR and RTL document direction.
 * Ensures logical CSS properties (insetInlineStart, paddingInlineStart, etc.) are used
 * correctly and that components render without layout regressions in RTL environments
 * (Arabic, Dari — MENA/Central Asia context).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { OutbreakModeConfig } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Mocks — declared before component imports
// ---------------------------------------------------------------------------

vi.mock('@ultranos/ui-kit/icons', () => ({
  AlertTriangle: () => <span data-testid="alert-triangle-icon" />,
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  Target: () => <span data-testid="target-icon" />,
  TrendingUp: () => <span data-testid="trending-up-icon" />,
  TrendingDown: () => <span data-testid="trending-down-icon" />,
  Minus: () => <span data-testid="minus-icon" />,
}))

vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/outbreak-service', () => ({
  isOutbreakModeActive: vi.fn().mockResolvedValue(null),
  isOutbreakAuthorized: vi.fn().mockReturnValue(false),
}))

const mockSession = {
  userId: 'u1',
  role: 'HEALTH_OFFICER',
  labRole: null,
  practitionerId: 'prac-001',
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockActiveConfig: OutbreakModeConfig = {
  id: 'outbreak-001',
  status: 'active',
  activatedBy: 'prac-001',
  activatedAt: '2026-05-31T08:00:00Z:0:test',
  deactivatedBy: null,
  deactivatedAt: null,
  targetPathogen: { code: 'MALARIA', display: 'Malaria' },
  targetTestCodes: ['51587-4'],
  affectedScope: ['loc-001'],
  activationReason: 'WHO alert',
  surgeMultiplier: 3,
  meta: { lastUpdated: '2026-05-31T08:00:00Z', versionId: '1' },
  _ultranos: { createdAt: '2026-05-31T08:00:00Z', hlcTimestamp: '2026-05-31T08:00:00Z:0:test' },
}

// ---------------------------------------------------------------------------
// Component imports (after mocks)
// ---------------------------------------------------------------------------

import { OutbreakModeBanner } from '../components/outbreak/OutbreakModeBanner'
import { SimplifiedResultEntry } from '../components/outbreak/SimplifiedResultEntry'
import { ActivateOutbreakModal } from '../components/outbreak/ActivateOutbreakModal'
import { OutbreakPriorityBadge } from '../components/queue/OutbreakPriorityBadge'
import { isOutbreakModeActive, isOutbreakAuthorized } from '../lib/outbreak-service'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setDir(dir: 'ltr' | 'rtl') {
  document.dir = dir
}

// ---------------------------------------------------------------------------
// OutbreakModeBanner snapshots
// ---------------------------------------------------------------------------

describe('OutbreakModeBanner — RTL snapshots', () => {
  afterEach(() => {
    document.dir = 'ltr'
    vi.clearAllMocks()
  })

  it('LTR: renders null when no active outbreak', () => {
    setDir('ltr')
    vi.mocked(isOutbreakModeActive).mockResolvedValue(null)
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    expect(container).toMatchSnapshot()
  })

  it('LTR: renders banner when outbreak is active (authorized user)', async () => {
    setDir('ltr')
    vi.mocked(isOutbreakModeActive).mockResolvedValue(mockActiveConfig)
    vi.mocked(isOutbreakAuthorized).mockReturnValue(true)
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outbreak-mode-banner"]')).toBeTruthy()
    })
    expect(container).toMatchSnapshot()
  })

  it('RTL: renders banner when outbreak is active (authorized user)', async () => {
    setDir('rtl')
    vi.mocked(isOutbreakModeActive).mockResolvedValue(mockActiveConfig)
    vi.mocked(isOutbreakAuthorized).mockReturnValue(true)
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outbreak-mode-banner"]')).toBeTruthy()
    })
    expect(container).toMatchSnapshot()
  })

  it('LTR: renders banner without Deactivate button (unauthorized)', async () => {
    setDir('ltr')
    vi.mocked(isOutbreakModeActive).mockResolvedValue(mockActiveConfig)
    vi.mocked(isOutbreakAuthorized).mockReturnValue(false)
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outbreak-mode-banner"]')).toBeTruthy()
    })
    expect(container).toMatchSnapshot()
  })

  it('RTL: renders banner without Deactivate button (unauthorized)', async () => {
    setDir('rtl')
    vi.mocked(isOutbreakModeActive).mockResolvedValue(mockActiveConfig)
    vi.mocked(isOutbreakAuthorized).mockReturnValue(false)
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outbreak-mode-banner"]')).toBeTruthy()
    })
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// SimplifiedResultEntry snapshots
// ---------------------------------------------------------------------------

describe('SimplifiedResultEntry — RTL snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-31T10:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.dir = 'ltr'
    vi.clearAllMocks()
  })

  it('LTR snapshot', () => {
    setDir('ltr')
    const { container } = render(
      <SimplifiedResultEntry
        outbreakConfig={mockActiveConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('RTL snapshot — logical CSS properties preserve layout', () => {
    setDir('rtl')
    const { container } = render(
      <SimplifiedResultEntry
        outbreakConfig={mockActiveConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// ActivateOutbreakModal snapshots
// ---------------------------------------------------------------------------

describe('ActivateOutbreakModal — RTL snapshots', () => {
  afterEach(() => {
    document.dir = 'ltr'
    vi.clearAllMocks()
  })

  it('LTR: form snapshot (authorized user)', () => {
    setDir('ltr')
    vi.mocked(isOutbreakAuthorized).mockReturnValue(true)
    const { container } = render(
      <ActivateOutbreakModal
        labLocationIds={['loc-001', 'loc-002']}
        onActivated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('RTL: form snapshot (authorized user)', () => {
    setDir('rtl')
    vi.mocked(isOutbreakAuthorized).mockReturnValue(true)
    const { container } = render(
      <ActivateOutbreakModal
        labLocationIds={['loc-001', 'loc-002']}
        onActivated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('LTR: renders null for unauthorized user', () => {
    setDir('ltr')
    vi.mocked(isOutbreakAuthorized).mockReturnValue(false)
    const { container } = render(
      <ActivateOutbreakModal
        labLocationIds={['loc-001']}
        onActivated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// OutbreakPriorityBadge snapshots
// ---------------------------------------------------------------------------

describe('OutbreakPriorityBadge — RTL snapshots', () => {
  afterEach(() => {
    document.dir = 'ltr'
    vi.clearAllMocks()
  })

  it('LTR snapshot', () => {
    setDir('ltr')
    const { container } = render(<OutbreakPriorityBadge />)
    expect(container).toMatchSnapshot()
  })

  it('RTL snapshot', () => {
    setDir('rtl')
    const { container } = render(<OutbreakPriorityBadge />)
    expect(container).toMatchSnapshot()
  })
})
