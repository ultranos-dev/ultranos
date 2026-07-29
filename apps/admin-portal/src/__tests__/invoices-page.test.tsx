/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// Mock auth session store
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
const { default: InvoicesPage } = await import('../app/[locale]/subscriptions/invoices/page')

// Mock shape matches the current listInvoices API contract:
// { invoiceId, amount (cents), currency, status, pdfUrl, createdAt }.
// The page renders columns Date / Amount / Status / Action — there is no
// "description" field or column anymore, so the old "OPD Lite - May 2026"
// assertions no longer apply.
const mockInvoices = {
  invoices: [
    {
      invoiceId: 'inv-1',
      amount: 5000, // cents → $50.00
      currency: 'usd',
      status: 'PAID' as const,
      pdfUrl: 'https://example.com/inv-1.pdf',
      createdAt: '2026-05-15T12:00:00Z',
    },
    {
      invoiceId: 'inv-2',
      amount: 5000,
      currency: 'usd',
      status: 'OPEN' as const,
      pdfUrl: 'https://example.com/inv-2.pdf',
      createdAt: '2026-04-15T12:00:00Z',
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

    // The table renders Date / Amount / Status / Action columns.
    // Dates are formatted with the en-US locale from createdAt.
    await waitFor(() => {
      expect(screen.getByText('May 15, 2026')).toBeInTheDocument()
    })

    expect(screen.getByText('Apr 15, 2026')).toBeInTheDocument()
    // amount is cents / 100 → $50.00 for both rows
    expect(screen.getAllByText('$50.00')).toHaveLength(2)
    // status badges render the upper-cased status
    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
    // download links use t('invoicesDownloadPdf') = "Download PDF"
    expect(screen.getAllByText('Download PDF')).toHaveLength(2)
  })

  it('shows empty state when no invoices', async () => {
    mockQuery.mockResolvedValue({ invoices: [], totalCount: 0 })

    render(<InvoicesPage />)

    // EmptyState now uses t('invoicesNoInvoices') = "No invoices found."
    await waitFor(() => {
      expect(screen.getByText('No invoices found.')).toBeInTheDocument()
    })

    // Description is t('invoicesNoInvoicesDescription')
    expect(screen.getByText('No invoices have been generated yet.')).toBeInTheDocument()
  })
})
