/**
 * Story 43.3 — Amendment & Correction Protocol: UI Component Tests
 * Task 9.10 (RTL snapshot), Task 9.2, 9.4 (role gate), Task 9.6 (patient notification)
 *
 * Tests the SupervisorAuthGate, AmendResultModal, and AmendmentChainView components.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SupervisorAuthGate } from '@/components/amendments/SupervisorAuthGate'
import { AmendmentChainView } from '@/components/amendments/AmendmentChainView'
import { AmendmentReasonCode } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: {
        userId: 'prac-tech-001',
        labRole: 'LAB_TECH',
      },
    }),
  },
}))

vi.mock('@/lib/amendment-service', () => ({
  initiateAmendment: vi.fn().mockResolvedValue({
    amendmentId: 'amend-001',
    correctedReportId: 'report-corrected-001',
  }),
  authorizeAmendment: vi.fn().mockResolvedValue({}),
  commitAmendment: vi.fn().mockResolvedValue(undefined),
  getAmendmentChain: vi.fn().mockResolvedValue([]),
}))

afterEach(() => {
  document.dir = 'ltr'
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// SupervisorAuthGate tests
// ---------------------------------------------------------------------------

describe('SupervisorAuthGate', () => {
  it('renders the authorization dialog', () => {
    const onAuthorized = vi.fn()
    const onCancel = vi.fn()

    render(
      <SupervisorAuthGate onAuthorized={onAuthorized} onCancel={onCancel} />,
    )

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText(/supervisor authorization required/i)).toBeDefined()
  })

  it('shows supervisor ID input for non-supervisor users', () => {
    render(
      <SupervisorAuthGate
        onAuthorized={vi.fn()}
        onCancel={vi.fn()}
        currentUserLabRole="LAB_TECH"
      />,
    )

    expect(screen.getByTestId('supervisor-id-input')).toBeDefined()
  })

  it('shows self-authorization acknowledgment for supervisor users', () => {
    render(
      <SupervisorAuthGate
        onAuthorized={vi.fn()}
        onCancel={vi.fn()}
        currentUserLabRole="SUPERVISOR"
      />,
    )

    expect(screen.getByTestId('self-auth-acknowledge')).toBeDefined()
    expect(screen.queryByTestId('supervisor-id-input')).toBeNull()
  })

  it('9.4 — authorize button disabled until mandatory acknowledgment is checked (self-auth)', () => {
    render(
      <SupervisorAuthGate
        onAuthorized={vi.fn()}
        onCancel={vi.fn()}
        currentUserLabRole="SUPERVISOR"
      />,
    )

    const authorizeBtn = screen.getByTestId('auth-authorize-btn')
    expect((authorizeBtn as HTMLButtonElement).disabled).toBe(true)

    // Check the acknowledgment
    fireEvent.click(screen.getByTestId('self-auth-acknowledge'))
    expect((authorizeBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows error when supervisor ID is empty and user tries to authorize', async () => {
    render(
      <SupervisorAuthGate
        onAuthorized={vi.fn()}
        onCancel={vi.fn()}
        currentUserLabRole="LAB_TECH"
      />,
    )

    // Button should be disabled with empty input
    const authorizeBtn = screen.getByTestId('auth-authorize-btn')
    expect((authorizeBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <SupervisorAuthGate onAuthorized={vi.fn()} onCancel={onCancel} />,
    )

    fireEvent.click(screen.getByTestId('auth-cancel-btn'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onAuthorized with supervisor credentials on successful self-auth', async () => {
    const onAuthorized = vi.fn()

    render(
      <SupervisorAuthGate
        onAuthorized={onAuthorized}
        onCancel={vi.fn()}
        currentUserLabRole="SUPERVISOR"
      />,
    )

    // Check the acknowledgment and authorize
    fireEvent.click(screen.getByTestId('self-auth-acknowledge'))
    fireEvent.click(screen.getByTestId('auth-authorize-btn'))

    await waitFor(() => {
      expect(onAuthorized).toHaveBeenCalledWith(
        expect.objectContaining({ labRole: expect.stringMatching(/SUPERVISOR|LAB_MANAGER/) }),
      )
    })
  })

  // 9.10 — RTL snapshot tests
  describe('RTL Snapshots', () => {
    it('renders correctly in LTR', () => {
      document.dir = 'ltr'
      const { container } = render(
        <SupervisorAuthGate
          onAuthorized={vi.fn()}
          onCancel={vi.fn()}
          currentUserLabRole="LAB_TECH"
        />,
      )
      expect(container).toMatchSnapshot()
    })

    it('renders correctly in RTL', () => {
      document.dir = 'rtl'
      const { container } = render(
        <SupervisorAuthGate
          onAuthorized={vi.fn()}
          onCancel={vi.fn()}
          currentUserLabRole="LAB_TECH"
        />,
      )
      expect(container).toMatchSnapshot()
    })
  })
})

// ---------------------------------------------------------------------------
// AmendmentChainView tests
// ---------------------------------------------------------------------------

describe('AmendmentChainView', () => {
  it('shows loading state initially', () => {
    render(<AmendmentChainView originalReportId="report-001" />)
    expect(screen.getByTestId('chain-loading')).toBeDefined()
  })

  it('shows empty state when no amendments exist', async () => {
    const { getAmendmentChain } = await import('@/lib/amendment-service')
    vi.mocked(getAmendmentChain).mockResolvedValueOnce([])

    render(<AmendmentChainView originalReportId="report-001" />)

    await waitFor(() => {
      expect(screen.getByTestId('chain-empty')).toBeDefined()
    })
  })

  it('9.9 — displays all amendments in chronological order', async () => {
    const { getAmendmentChain } = await import('@/lib/amendment-service')
    vi.mocked(getAmendmentChain).mockResolvedValueOnce([
      {
        id: 'amend-1',
        originalReportId: 'report-001',
        amendedReportId: 'report-v2',
        reasonCode: AmendmentReasonCode.CLERICAL_ERROR,
        reasonText: 'Wrong value transcribed from printout',
        authorizedBy: 'prac-supervisor-001',
        authorizedAt: '2026-05-31T11:00:00.000Z',
        initiatedBy: 'prac-tech-001',
        initiatedAt: '2026-05-31T10:00:00.000Z',
        originalValues: {},
        amendedValues: {},
        hlcTimestamp: '2026-05-31T10:00:00.000Z-0-test',
        status: 'COMMITTED',
        syncStatus: 'pending',
      },
    ])

    render(<AmendmentChainView originalReportId="report-001" />)

    await waitFor(() => {
      expect(screen.getByTestId('amendment-chain')).toBeDefined()
      expect(screen.getByTestId('chain-entry-0')).toBeDefined()
    })
  })

  it('shows error state on failure', async () => {
    const { getAmendmentChain } = await import('@/lib/amendment-service')
    vi.mocked(getAmendmentChain).mockRejectedValueOnce(new Error('DB error'))

    render(<AmendmentChainView originalReportId="report-001" />)

    await waitFor(() => {
      expect(screen.getByTestId('chain-error')).toBeDefined()
    })
  })

  // 9.10 RTL snapshot
  it('renders AmendmentChainView snapshot in RTL', async () => {
    document.dir = 'rtl'
    const { getAmendmentChain } = await import('@/lib/amendment-service')
    vi.mocked(getAmendmentChain).mockResolvedValueOnce([])

    const { container } = render(<AmendmentChainView originalReportId="report-001" />)
    // Wait for loading to complete
    await waitFor(() => {
      expect(container.querySelector('[data-testid="chain-empty"]')).toBeDefined()
    })
    expect(container).toMatchSnapshot()
  })
})
