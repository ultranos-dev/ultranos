import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/audit',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock trpc client
const mockListAuditEvents = vi.fn()
const mockExportAuditEvents = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listAuditEvents: { query: (...args: any[]) => mockListAuditEvents(...args) },
      exportAuditEvents: { query: (...args: any[]) => mockExportAuditEvents(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { EventBrowser } = await import('../components/audit/EventBrowser')

const mockEvents = [
  {
    id: 'evt-1',
    timestamp: '2026-05-18T10:30:00Z',
    action: 'KYC_APPROVED',
    actorId: 'u1',
    actorName: 'Dr. Alice Smith',
    actorRole: 'ADMIN',
    resourceType: 'KycSubmission',
    resourceId: 'kyc-abc12345-def6-7890',
    outcome: 'SUCCESS' as const,
    metadata: { reason: 'Documents verified' },
  },
  {
    id: 'evt-2',
    timestamp: '2026-05-17T14:15:00Z',
    action: 'LOGIN',
    actorId: 'u2',
    actorName: 'Bob Admin',
    actorRole: 'CLINICIAN',
    resourceType: 'Session',
    resourceId: 'sess-xyz98765-abc1-2345',
    outcome: 'DENIED' as const,
    metadata: { ip: '192.168.1.1' },
  },
]

describe('EventBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders events table with mock data', async () => {
    mockListAuditEvents.mockResolvedValue({ events: mockEvents, totalCount: 2 })

    render(<EventBrowser />)

    await waitFor(() => {
      expect(screen.getByText('KYC_APPROVED')).toBeTruthy()
    })

    expect(screen.getByText('Dr. Alice Smith')).toBeTruthy()
    expect(screen.getByText('Bob Admin')).toBeTruthy()
    expect(screen.getByText('LOGIN')).toBeTruthy()
    // SUCCESS and DENIED appear in both filter dropdown and badges
    const successElements = screen.getAllByText('SUCCESS')
    expect(successElements.length).toBeGreaterThanOrEqual(2)
    const deniedElements = screen.getAllByText('DENIED')
    expect(deniedElements.length).toBeGreaterThanOrEqual(2)
  })

  it('shows empty state text when no events', async () => {
    mockListAuditEvents.mockResolvedValue({ events: [], totalCount: 0 })

    render(<EventBrowser />)

    await waitFor(() => {
      expect(screen.getByText('No audit events found')).toBeTruthy()
    })

    expect(screen.getByText('Try adjusting your filters or date range.')).toBeTruthy()
  })
})
