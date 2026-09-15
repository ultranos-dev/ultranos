/**
 * worklist-item-recollect.test.tsx
 *
 * Change 4: WorklistItem exposes a "Re-collect" button that opens
 * ReceiveSampleModal for the sample's order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PrioritizedSample } from '../lib/prioritization-engine'
import type { FhirSpecimen } from '@ultranos/shared-types'

// ---- Mocks ----

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string) => {
    const map: Record<string, string> = {
      enterResult: 'Enter Result',
      recollect: 'Re-collect',
    }
    return map[key] ?? key
  },
}))

// samples.receive modal — render a minimal sentinel so we can assert it opened
vi.mock('@/components/samples/ReceiveSampleModal', () => ({
  ReceiveSampleModal: ({ orderId }: { orderId: string }) => (
    <div data-testid="receive-sample-modal" data-order-id={orderId}>
      ReceiveSampleModal
    </div>
  ),
}))

// Stub getSampleById and getDb
const mockSpecimen: Partial<FhirSpecimen> = {
  id: 'specimen-wl-001',
  resourceType: 'Specimen',
  status: 'available',
  subject: { reference: 'Patient/patient-opaque-ref-007' },
  request: [{ reference: 'ServiceRequest/order-wl-001' }],
}

const mockOrderRow = {
  orderId: 'order-wl-001',
  patientFirstName: 'Layla',
  patientAge: 29,
  patientRef: 'Patient/patient-opaque-ref-007',
  testsRequested: [{ loincCode: '2093-3', loincDisplay: 'Cholesterol' }],
  urgency: 'routine',
  orderingPhysicianName: 'Dr. Hosseini',
  specialInstructions: null,
  status: 'RECEIVED',
  authoredOn: '2026-09-13T08:00:00.000Z',
  receivedAt: '2026-09-13T08:05:00.000Z',
  syncedAt: '2026-09-13T08:05:00.000Z',
}

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    getSampleById: vi.fn().mockResolvedValue(mockSpecimen),
    getDb: () => ({
      orders: {
        get: vi.fn().mockResolvedValue(mockOrderRow),
      },
    }),
  }
})

// Stub badge/indicator sub-components to avoid their own dependency chains
vi.mock('@/components/worklist/UrgencyBadge', () => ({
  UrgencyBadge: ({ urgency }: { urgency: string }) => <span>{urgency}</span>,
}))
vi.mock('@/components/worklist/StabilityBadge', () => ({
  StabilityBadge: () => null,
}))
vi.mock('@/components/worklist/BatchGroupIndicator', () => ({
  BatchGroupIndicator: () => null,
}))
vi.mock('@/components/samples/LockIndicator', () => ({
  LockIndicator: () => null,
}))

// ---- Test data ----

function makeSample(overrides: Partial<PrioritizedSample> = {}): PrioritizedSample {
  return {
    sampleId: 'specimen-wl-001',
    orderId: 'order-wl-001',
    patientRef: { firstName: 'Layla', age: 29 },
    loincCode: '2093-3',
    loincDisplay: 'Cholesterol',
    urgency: 'routine',
    receivedAt: '2026-09-13T08:05:00.000Z',
    stabilityWindowMinutes: 240,
    stabilityStatus: 'safe',
    remainingMinutes: 200,
    timeInQueueMinutes: 40,
    priorityScore: 2040,
    batchGroup: 'Cholesterol',
    isManualOverride: false,
    ...overrides,
  }
}

const defaultProps = {
  rank: 1,
  isInBatch: false,
  isBatchStart: false,
  isDragging: false,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  onTouchStart: vi.fn(),
  index: 0,
  onResetOverride: vi.fn(),
}

// Lazy import after mocks
const { WorklistItem } = await import('../components/worklist/WorklistItem')

describe('WorklistItem — Re-collect button (Change 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a Re-collect button', () => {
    render(<WorklistItem sample={makeSample()} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Re-collect/i })).toBeDefined()
  })

  it('Re-collect button opens ReceiveSampleModal with the correct orderId', async () => {
    const user = userEvent.setup()
    render(<WorklistItem sample={makeSample()} {...defaultProps} />)

    // Modal should not be present initially
    expect(screen.queryByTestId('receive-sample-modal')).toBeNull()

    const recollectBtn = screen.getByRole('button', { name: /Re-collect/i })
    await user.click(recollectBtn)

    // Wait for the async specimen lookup to complete
    await act(async () => {})

    const modal = screen.queryByTestId('receive-sample-modal')
    expect(modal).not.toBeNull()
    // The modal must be for the correct order
    expect(modal!.getAttribute('data-order-id')).toBe('order-wl-001')
  })

  it('Enter Result button still routes to /results/<sampleId>/enter', async () => {
    mockPush.mockReset()
    const user = userEvent.setup()
    render(<WorklistItem sample={makeSample()} {...defaultProps} />)

    const enterBtn = screen.getByRole('button', { name: /Enter Result/i })
    await user.click(enterBtn)

    expect(mockPush).toHaveBeenCalledWith('/results/specimen-wl-001/enter')
  })

  it('Re-collect and Enter Result are visually distinct (different classNames)', () => {
    const { container } = render(<WorklistItem sample={makeSample()} {...defaultProps} />)
    const buttons = container.querySelectorAll('button')
    const recollectBtn = Array.from(buttons).find((b) => b.textContent?.includes('Re-collect'))
    const enterBtn = Array.from(buttons).find((b) => b.textContent?.includes('Enter Result'))
    expect(recollectBtn).toBeDefined()
    expect(enterBtn).toBeDefined()
    // Primary action has bg-primary; secondary does not
    expect(enterBtn!.className).toContain('bg-primary')
    expect(recollectBtn!.className).not.toContain('bg-primary')
  })

  it('Re-collect button is disabled when sample is locked by another tech (Fix #6)', () => {
    const activeLock = {
      sampleId: 'specimen-wl-001',
      techId: 'other-tech-999',
      techName: 'Other Tech',
      lockedAt: '2026-09-15T09:00:00.000Z',
      expiresAt: '2026-09-15T09:15:00.000Z',
      status: 'ACTIVE' as const,
    }
    const { container } = render(
      <WorklistItem
        sample={makeSample()}
        {...defaultProps}
        activeLock={activeLock}
        currentTechId="tech-001"
      />,
    )
    const buttons = container.querySelectorAll('button')
    const recollectBtn = Array.from(buttons).find((b) => b.textContent?.includes('Re-collect'))
    const enterBtn = Array.from(buttons).find((b) => b.textContent?.includes('Enter Result'))
    expect(recollectBtn).toBeDefined()
    expect(enterBtn).toBeDefined()
    // Both buttons must be disabled when locked by another tech
    expect(recollectBtn!.hasAttribute('disabled')).toBe(true)
    expect(enterBtn!.hasAttribute('disabled')).toBe(true)
  })

  it('Re-collect button is NOT disabled when lock is held by current tech', () => {
    const ownLock = {
      sampleId: 'specimen-wl-001',
      techId: 'tech-001',
      techName: 'Current Tech',
      lockedAt: '2026-09-15T09:00:00.000Z',
      expiresAt: '2026-09-15T09:15:00.000Z',
      status: 'ACTIVE' as const,
    }
    const { container } = render(
      <WorklistItem
        sample={makeSample()}
        {...defaultProps}
        activeLock={ownLock}
        currentTechId="tech-001"
      />,
    )
    const buttons = container.querySelectorAll('button')
    const recollectBtn = Array.from(buttons).find((b) => b.textContent?.includes('Re-collect'))
    expect(recollectBtn).toBeDefined()
    expect(recollectBtn!.hasAttribute('disabled')).toBe(false)
  })
})
