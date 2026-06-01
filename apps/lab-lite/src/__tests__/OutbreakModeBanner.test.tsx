/**
 * OutbreakModeBanner Component Tests — Story 54.5 (Task 15.5)
 *
 * Tests:
 *   - Returns null when loading (not yet resolved)
 *   - Returns null when no active outbreak
 *   - Renders banner with correct content when outbreak is active
 *   - role="alert" and aria-live="assertive" (AC #10 accessibility)
 *   - Deactivate button shown only for authorized users
 *   - Deactivate button NOT shown for unauthorized users
 *   - NOT dismissible (no close/dismiss button visible to non-authorized users)
 *   - data-testid="outbreak-mode-banner"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import type { OutbreakModeConfig } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsOutbreakModeActive = vi.fn()
const mockIsOutbreakAuthorized = vi.fn()

vi.mock('@/lib/outbreak-service', () => ({
  isOutbreakModeActive: (...args: unknown[]) => mockIsOutbreakModeActive(...args),
  isOutbreakAuthorized: (...args: unknown[]) => mockIsOutbreakAuthorized(...args),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  AlertTriangle: () => <span data-testid="alert-triangle" />,
}))

const authorizedSession = {
  userId: 'u1',
  role: 'HEALTH_OFFICER',
  labRole: null,
  practitionerId: 'prac-001',
}

let currentSession: typeof authorizedSession | null = authorizedSession

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof authorizedSession | null }) => unknown) =>
    selector({ session: currentSession }),
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
// Tests
// ---------------------------------------------------------------------------

import { OutbreakModeBanner } from '../components/outbreak/OutbreakModeBanner'

describe('OutbreakModeBanner — no active outbreak', () => {
  beforeEach(() => {
    currentSession = authorizedSession
    mockIsOutbreakModeActive.mockResolvedValue(null)
    mockIsOutbreakAuthorized.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when outbreak mode is not active', async () => {
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('renders nothing while loading (promise pending)', () => {
    mockIsOutbreakModeActive.mockReturnValue(new Promise(() => {}))
    const { container } = render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('OutbreakModeBanner — active outbreak', () => {
  beforeEach(() => {
    currentSession = authorizedSession
    mockIsOutbreakModeActive.mockResolvedValue(mockActiveConfig)
    vi.clearAllMocks()
    mockIsOutbreakModeActive.mockResolvedValue(mockActiveConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the banner with data-testid="outbreak-mode-banner"', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toBeInTheDocument()
    })
  })

  it('has role="alert" for screen reader announcement', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('has aria-live="assertive"', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toHaveAttribute('aria-live', 'assertive')
    })
  })

  it('shows "OUTBREAK MODE ACTIVE" in the banner', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toHaveTextContent(/OUTBREAK MODE ACTIVE/)
    })
  })

  it('shows the pathogen name in the banner', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toHaveTextContent(/MALARIA/)
    })
  })

  it('shows "Activated by" with the activatedBy practitioner ID', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toHaveTextContent(/Activated by prac-001/)
    })
  })

  it('has sticky positioning (not dismissible as it is persistent)', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      const banner = screen.getByTestId('outbreak-mode-banner')
      expect(banner).toHaveStyle({ position: 'sticky' })
    })
  })

  it('has red background color (#dc2626)', async () => {
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('outbreak-mode-banner')).toHaveStyle({
        backgroundColor: '#dc2626',
      })
    })
  })

  it('shows Deactivate button for authorized users', async () => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument()
    })
  })

  it('does NOT show Deactivate button for unauthorized users', async () => {
    mockIsOutbreakAuthorized.mockReturnValue(false)
    render(<OutbreakModeBanner onDeactivate={vi.fn()} />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
    })
  })

  it('calls onDeactivate when authorized user clicks Deactivate', async () => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    const onDeactivate = vi.fn()
    render(<OutbreakModeBanner onDeactivate={onDeactivate} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }))
    expect(onDeactivate).toHaveBeenCalledTimes(1)
  })
})
