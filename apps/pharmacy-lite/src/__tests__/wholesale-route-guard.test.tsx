import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const mockFirst = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: () => mockFirst() }),
    },
  },
}))

import WholesaleLayout from '@/app/[locale]/(app)/wholesale/layout'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WholesaleLayout route guard', () => {
  it('redirects to / and does NOT render children when enableWholesale is false', async () => {
    mockFirst.mockResolvedValue({ enableWholesale: false })
    render(
      <WholesaleLayout>
        <div data-testid="child-content">Child</div>
      </WholesaleLayout>,
    )
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('redirects to / and does NOT render children when enableWholesale is missing', async () => {
    mockFirst.mockResolvedValue({})
    render(
      <WholesaleLayout>
        <div data-testid="child-content">Child</div>
      </WholesaleLayout>,
    )
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('renders children when enableWholesale is true', async () => {
    mockFirst.mockResolvedValue({ enableWholesale: true })
    render(
      <WholesaleLayout>
        <div data-testid="child-content">Child</div>
      </WholesaleLayout>,
    )
    await waitFor(() => expect(screen.getByTestId('child-content')).toBeInTheDocument())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects on db error and does NOT render children', async () => {
    mockFirst.mockRejectedValue(new Error('DB unavailable'))
    render(
      <WholesaleLayout>
        <div data-testid="child-content">Child</div>
      </WholesaleLayout>,
    )
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })
})
