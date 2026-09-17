/**
 * EscalationStatusList — 4-state loading tests (Story 48.4 / loading-states fix)
 *
 * Critical safety surface: a load failure must NEVER render as "No active escalations"
 * (a false empty). The error state must be visible.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ── auth store mock ───────────────────────────────────────────────────────────
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { userId: string; labRole: string } }) => unknown) =>
    selector({ session: { userId: 'user-001', labRole: 'LAB_TECH' } }),
}))

// ── escalation-manager mock ───────────────────────────────────────────────────
const mockGetActiveEscalations = vi.fn()
const mockGetEscalationHistory = vi.fn()

vi.mock('@/lib/escalation-manager', () => ({
  getActiveEscalations: (...args: unknown[]) => mockGetActiveEscalations(...args),
  getEscalationHistory: (...args: unknown[]) => mockGetEscalationHistory(...args),
  acknowledgeStep: vi.fn().mockResolvedValue(undefined),
}))

// ── audit-client mock ─────────────────────────────────────────────────────────
vi.mock('@/lib/audit-client', () => ({
  reportEscalationEvent: vi.fn(),
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

vi.mock('@ultranos/ui-kit/components/ui/search-input', () => ({
  SearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  CircleCheck: () => <span data-testid="circle-check-icon" />,
  FileSearch: () => <span data-testid="filesearch-icon" />,
  TriangleAlert: () => <span data-testid="triangle-alert-icon" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

// ── Helper ────────────────────────────────────────────────────────────────────
async function getComponent() {
  const mod = await import('../components/escalation/EscalationStatusList')
  return mod.EscalationStatusList
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EscalationStatusList — 4-state loading', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error/unavailable state (not empty) when load throws', async () => {
    mockGetActiveEscalations.mockRejectedValue(new Error('IndexedDB unavailable'))
    mockGetEscalationHistory.mockRejectedValue(new Error('IndexedDB unavailable'))

    const Component = await getComponent()
    render(<Component />)

    // Must show a role="alert" error state
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // The error EmptyState should contain the loadError key (our mock returns the key)
    expect(screen.getByTestId('empty-state').textContent).toContain('loadError')
    // Must NOT show the "no active escalations" false empty
    expect(screen.queryByText('noActiveEscalations')).not.toBeInTheDocument()
    // Must NOT remain in loading state
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })

  it('shows genuine empty state when load succeeds with zero chains', async () => {
    mockGetActiveEscalations.mockResolvedValue([])
    mockGetEscalationHistory.mockResolvedValue([])

    const Component = await getComponent()
    render(<Component />)

    // After successful load with zero data, show the real empty state
    await waitFor(() => {
      expect(screen.getByText('noActiveEscalations')).toBeInTheDocument()
    })
    // No error alert when data loaded cleanly
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
