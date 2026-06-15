import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    const msgs: Record<string, string> = {
      nowServing: 'Now Serving',
      waiting: 'Waiting',
      emptyQueue: 'No patients in queue',
    }
    return msgs[key] ?? `${namespace}.${key}`
  },
}))

// Mock Dexie db
const mockEntries = [
  {
    id: 1,
    patientRef: 'Patient/secret-id-123',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    tokenColor: 'blue',
    tokenSymbol: 'star',
    tokenDisplayKey: 'blue-star',
    status: 'serving',
    registeredAt: '2026-05-30T08:00:00.000Z',
    hlcTimestamp: '2026-05-30T08:00:00.000Z_0000_node1',
    techId: 'tech-001',
  },
  {
    id: 2,
    patientRef: 'Patient/secret-id-456',
    patientFirstName: 'Fatima',
    patientAge: 28,
    tokenColor: 'red',
    tokenSymbol: 'circle',
    tokenDisplayKey: 'red-circle',
    status: 'waiting',
    registeredAt: '2026-05-30T08:05:00.000Z',
    hlcTimestamp: '2026-05-30T08:05:00.000Z_0000_node1',
    techId: 'tech-001',
  },
]

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    table: () => ({
      where: () => ({
        anyOf: () => ({
          sortBy: async () => [...mockEntries],
        }),
      }),
    }),
  }),
}))

import QueueDisplayPage from '@/app/[locale]/queue/display/page'

describe('Queue display board — PHI protection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('renders ZERO patient names on the display board', async () => {
    const { container } = render(<QueueDisplayPage />)

    // Wait for the poll to fire
    await vi.advanceTimersByTimeAsync(100)

    const html = container.innerHTML

    // Assert NO patient names appear
    expect(html).not.toContain('Ahmad')
    expect(html).not.toContain('Fatima')

    // Assert NO patient IDs appear
    expect(html).not.toContain('secret-id-123')
    expect(html).not.toContain('secret-id-456')
    expect(html).not.toContain('Patient/')

    // Assert NO ages (demographic data)
    // Note: numbers like position "1" are ok, but "35" and "28" as ages should not appear
    expect(html).not.toContain('35')
    expect(html).not.toContain('28')
  })

  it('renders token badges (color indicators) on the display board', async () => {
    render(<QueueDisplayPage />)
    await vi.advanceTimersByTimeAsync(100)

    // Check aria-labels for tokens are present
    const imgs = screen.getAllByRole('img')
    const labels = imgs.map((el) => el.getAttribute('aria-label'))
    expect(labels).toContain('blue star')
    expect(labels).toContain('red circle')
  })

  it('shows "Now Serving" heading', async () => {
    render(<QueueDisplayPage />)
    await vi.advanceTimersByTimeAsync(100)

    expect(screen.getByText('Now Serving')).toBeInTheDocument()
  })

  it('shows "Waiting" heading', async () => {
    render(<QueueDisplayPage />)
    await vi.advanceTimersByTimeAsync(100)

    expect(screen.getByText('Waiting')).toBeInTheDocument()
  })
})
