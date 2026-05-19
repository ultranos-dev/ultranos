import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/subscriptions/invoices',
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

// Mock the trpc client
const mockQuery = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      listInvoices: { query: (...args: any[]) => mockQuery('listInvoices', ...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

// Dynamic imports after mock setup
const { default: InvoicesPage } = await import('../app/subscriptions/invoices/page')

const mockInvoices = {
  invoices: [
    {
      id: 'inv-1',
      date: '2026-05-01T00:00:00Z',
      description: 'OPD Lite - May 2026',
      amountUsd: 50,
      status: 'PAID' as const,
      downloadUrl: 'https://example.com/inv-1.pdf',
    },
    {
      id: 'inv-2',
      date: '2026-04-01T00:00:00Z',
      description: 'OPD Lite - April 2026',
      amountUsd: 50,
      status: 'PENDING' as const,
      downloadUrl: 'https://example.com/inv-2.pdf',
    },
  ],
  totalCount: 2,
}

describe('Task 8 — Invoice History Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders invoice table with mock data', async () => {
    mockQuery.mockResolvedValue(mockInvoices)

    render(<InvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('OPD Lite - May 2026')).toBeInTheDocument()
    })

    expect(screen.getByText('OPD Lite - April 2026')).toBeInTheDocument()
    expect(screen.getAllByText('$50.00')).toHaveLength(2)
    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.getByText('PENDING')).toBeInTheDocument()
    expect(screen.getAllByText('Download PDF')).toHaveLength(2)
  })

  it('shows empty state when no invoices', async () => {
    mockQuery.mockResolvedValue({ invoices: [], totalCount: 0 })

    render(<InvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    })

    expect(screen.getByText(/Invoices will appear here once your first billing cycle completes/)).toBeInTheDocument()
  })
})
