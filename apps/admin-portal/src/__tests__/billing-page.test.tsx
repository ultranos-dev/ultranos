/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/subscriptions/billing',
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
const mockMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getPaymentMethod: { query: (...args: any[]) => mockQuery('getPaymentMethod', ...args) },
      createPaymentSetup: { mutate: (...args: any[]) => mockMutate('createPaymentSetup', ...args) },
      removePaymentMethod: { mutate: (...args: any[]) => mockMutate('removePaymentMethod', ...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

// Dynamic imports after mock setup
const { default: BillingPage } = await import('../app/[locale]/subscriptions/billing/page')

describe('Task 7 — Billing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "No payment method on file" when query returns null', async () => {
    mockQuery.mockResolvedValue(null)

    render(<BillingPage />)

    await waitFor(() => {
      expect(screen.getByText(/No payment method on file/)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add Payment Method' })).toBeInTheDocument()
  })

  it('shows card details when payment method exists', async () => {
    // The getPaymentMethod endpoint returns { paymentMethod: {...} }, and the page
    // reads result.paymentMethod — so the mock must wrap the card in that shape.
    mockQuery.mockResolvedValue({
      paymentMethod: {
        brand: 'Visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2027,
      },
    })

    render(<BillingPage />)

    await waitFor(() => {
      expect(screen.getByText('Visa')).toBeInTheDocument()
    })

    expect(screen.getByText(/4242/)).toBeInTheDocument()
    expect(screen.getByText(/12\/27/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
