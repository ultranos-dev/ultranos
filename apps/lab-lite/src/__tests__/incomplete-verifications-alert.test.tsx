/**
 * IncompleteVerificationsAlert — 4-state loading tests (loading-states fix)
 *
 * SAFETY: A load failure must NEVER masquerade as "all verifications complete"
 * (which is what the old .catch(() => setRecords([])) did). The error must be
 * visible to the supervisor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { PatientVerificationRecord } from '@ultranos/shared-types'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `${params.count} ${key}`
    return key
  },
}))

// ── @/lib/db mock ─────────────────────────────────────────────────────────────
const { mockGetIncompleteVerifications } = vi.hoisted(() => ({
  mockGetIncompleteVerifications: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getIncompleteVerifications: mockGetIncompleteVerifications,
}))

// ── @ultranos/shared-types mock ───────────────────────────────────────────────
vi.mock('@ultranos/shared-types', () => ({}))

// ── Helper ────────────────────────────────────────────────────────────────────
async function getComponent() {
  const mod = await import('../components/verification/IncompleteVerificationsAlert')
  return mod.IncompleteVerificationsAlert
}

function makeRecord(id: string): PatientVerificationRecord {
  return {
    id,
    sampleId: `SAMPLE-${id}`,
    verifiedAt: null,
    verifiedBy: null,
    deviationReason: null,
    status: 'incomplete',
  } as unknown as PatientVerificationRecord
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IncompleteVerificationsAlert — 4-state loading', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error/unavailable indicator (not nothing) when load throws', async () => {
    mockGetIncompleteVerifications.mockRejectedValue(new Error('IndexedDB unavailable'))

    const Component = await getComponent()
    render(<Component />)

    // Must show a visible error — never silently return null (which would imply
    // "all verifications are complete" — a dangerous false negative)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByTestId('incomplete-verifications-error')).toBeInTheDocument()
    // The error message uses the i18n key (our mock returns the key as-is)
    expect(screen.getByRole('alert').textContent).toContain('verification.supervisor.loadError')
    // Must NOT show the incomplete-count alert (that only appears for real records)
    expect(screen.queryByTestId('incomplete-verifications-alert')).not.toBeInTheDocument()
  })

  it('renders nothing (no noise) when load succeeds with zero incomplete records', async () => {
    mockGetIncompleteVerifications.mockResolvedValue([])

    const Component = await getComponent()
    const { container } = render(<Component />)

    await waitFor(() => {
      // Give the effect time to complete
      expect(mockGetIncompleteVerifications).toHaveBeenCalled()
    })

    // Component should render nothing (no alerts, no content)
    // Use a small extra wait to ensure the async state has settled
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('shows the incomplete-count alert when load succeeds with records', async () => {
    mockGetIncompleteVerifications.mockResolvedValue([makeRecord('r1'), makeRecord('r2')])

    const Component = await getComponent()
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByTestId('incomplete-verifications-alert')).toBeInTheDocument()
    })
    // Error state must not appear when data loaded successfully
    expect(screen.queryByTestId('incomplete-verifications-error')).not.toBeInTheDocument()
  })
})
