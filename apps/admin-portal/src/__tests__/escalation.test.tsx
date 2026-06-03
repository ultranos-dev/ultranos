import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/alerts/a1',
  useParams: () => ({ alertId: 'a1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock supabase (required by TopHeader)
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// Mock auth session store (required by TopHeader)
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock trpc client
const mockEscalateAnomaly = vi.fn()
const mockListUsers = vi.fn()
const mockResolveAnomaly = vi.fn()
const mockReassignAnomaly = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      escalateAnomaly: { mutate: (...args: any[]) => mockEscalateAnomaly(...args) },
      resolveAnomaly: { mutate: (...args: any[]) => mockResolveAnomaly(...args) },
      reassignAnomaly: { mutate: (...args: any[]) => mockReassignAnomaly(...args) },
      listUsers: { query: (...args: any[]) => mockListUsers(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { EscalationModal } = await import('../components/alerts/EscalationModal')
const { EscalationSection } = await import('../components/alerts/EscalationSection')

beforeEach(() => {
  vi.clearAllMocks()
  mockListUsers.mockResolvedValue({ users: [{ id: 'u1', name: 'Admin One', email: 'admin@test.com' }], total: 1 })
})

describe('EscalationModal', () => {
  it('renders form with priority radio buttons', () => {
    render(
      <EscalationModal alertId="a1" open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
    )

    expect(screen.getByText('Escalate Alert')).toBeDefined()
    expect(screen.getByLabelText('Assign to')).toBeDefined()
    expect(screen.getByText('Normal')).toBeDefined()
    expect(screen.getByText('Urgent')).toBeDefined()
    expect(screen.getByPlaceholderText('Describe what should be investigated...')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()

    // Escalate button should be disabled when note is empty
    const escalateBtn = screen.getByRole('button', { name: 'Escalate' })
    expect(escalateBtn).toBeDefined()
    expect((escalateBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders NORMAL radio checked by default', () => {
    render(
      <EscalationModal alertId="a1" open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
    )

    const normalRadio = screen.getByDisplayValue('NORMAL') as HTMLInputElement
    const urgentRadio = screen.getByDisplayValue('URGENT') as HTMLInputElement
    expect(normalRadio.checked).toBe(true)
    expect(urgentRadio.checked).toBe(false)
  })
})

describe('EscalationSection', () => {
  const baseProps = {
    alertId: 'a1',
    status: 'ESCALATED',
    assigneeName: 'Dr. Smith',
    escalationPriority: 'URGENT',
    escalationNote: 'Needs immediate review of prescriptions',
    escalatedByName: 'Admin One',
    escalatedAt: '2026-05-15T10:00:00Z',
    resolutionNote: null,
    resolvedByName: null,
    resolvedAt: null,
    onResolve: vi.fn(),
    onReassign: vi.fn(),
  }

  it('renders escalation details (assignee, priority, note)', () => {
    render(<EscalationSection {...baseProps} />)

    expect(screen.getByText('Escalation Details')).toBeDefined()
    expect(screen.getByText('Dr. Smith')).toBeDefined()
    expect(screen.getByText('URGENT')).toBeDefined()
    expect(screen.getByText('Needs immediate review of prescriptions')).toBeDefined()
    expect(screen.getByText('Admin One')).toBeDefined()
    expect(screen.getByText('Escalated')).toBeDefined()
  })

  it('shows Resolve and Re-assign buttons when ESCALATED', () => {
    render(<EscalationSection {...baseProps} />)

    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Re-assign' })).toBeDefined()
  })

  it('renders resolution details when RESOLVED', () => {
    render(
      <EscalationSection
        {...baseProps}
        status="RESOLVED"
        resolutionNote="Issue was investigated and cleared"
        resolvedByName="Admin Two"
        resolvedAt="2026-05-16T14:30:00Z"
      />,
    )

    expect(screen.getByText('Resolved')).toBeDefined()
    expect(screen.getByText('Issue was investigated and cleared')).toBeDefined()
    expect(screen.getByText('Admin Two')).toBeDefined()
    // Resolve/Re-assign buttons should NOT be visible for resolved alerts
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Re-assign' })).toBeNull()
  })

  it('renders NORMAL priority badge', () => {
    render(
      <EscalationSection {...baseProps} escalationPriority="NORMAL" />,
    )

    expect(screen.getByText('NORMAL')).toBeDefined()
  })
})
