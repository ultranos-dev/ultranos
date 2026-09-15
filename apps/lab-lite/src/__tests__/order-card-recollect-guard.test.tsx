/**
 * order-card-recollect-guard.test.tsx
 *
 * Change 3: OrderCard.handleCardActivate re-checks the DB on every click.
 * Even when the component's `sampleReceived` state effect hasn't resolved yet,
 * clicking a collected order must route to /worklist — not open ReceiveSampleModal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LabOrderEntry } from '../lib/db'

// ---- Module mocks (declared before imports that load the components) ----

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const ordersMessages: Record<string, any> = {
  title: 'Test Orders',
  emptyState: 'No test orders',
  refresh: 'Refresh',
  filters: { all: 'All', received: 'Received', inProgress: 'In Progress', completed: 'Completed' },
  urgency: { stat: 'STAT', asap: 'ASAP', urgent: 'Urgent', routine: 'Routine' },
  card: {
    orderedBy: 'Ordered by',
    testsRequested: 'Tests',
    specialInstructions: 'Special Instructions',
    orderedAt: 'Ordered',
    ageYears: '{age}y',
    orderId: 'Order',
    assignedToYou: 'Assigned to you',
    available: 'Available',
    receiveSampleFor: 'Receive sample for {name}',
    patientDetails: 'Patient Details',
    sampleReceived: 'Sample received',
    viewInWorklist: 'View {name} in worklist',
  },
  details: {
    title: 'Patient Details',
    patientSection: 'Patient',
    orderSection: 'Order',
    age: 'Age',
    fullName: 'Full name',
    bloodGroup: 'Blood group',
    weight: 'Weight',
    height: 'Height',
    bmi: 'BMI',
    bloodPressure: 'Blood pressure',
    temperature: 'Temperature',
    tests: 'Tests',
    urgency: 'Urgency',
    culturalFlags: 'Cultural care preferences',
    noCulturalFlags: 'None recorded',
    loading: 'Loading…',
    unavailable: 'Unavailable',
    dataMinNote: 'The lab may see name, age, blood group, and basic vitals.',
    close: 'Close',
  },
  badge: 'pending',
}

function resolveKey(key: string): string {
  const parts = key.split('.')
  let result: any = ordersMessages
  for (const part of parts) result = result?.[part]
  return typeof result === 'string' ? result : key
}
function interpolate(s: string, opts?: Record<string, unknown>): string {
  if (!opts) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in opts ? String(opts[k]) : `{${k}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, opts?: Record<string, unknown>) =>
    interpolate(resolveKey(key), opts),
  useLocale: () => 'en',
}))

vi.mock('@/hooks/useOrderPatientDetails', () => ({
  useOrderPatientDetails: () => ({
    details: {
      fullName: { given: 'Ahmad', father: 'Marjan', grandfather: 'Qamar' },
      bloodGroup: 'A+',
      vitals: {
        weightKg: 77, heightCm: 170, bmi: 26.6, temperatureC: 37,
        bpSystolic: 101, bpDiastolic: 77, recordedAt: null,
      },
    },
    loading: false,
  }),
}))

// Mock both db helpers used by OrderCard so we can control them per-test.
const mockGetReceivedSampleForOrder = vi.fn<Parameters<typeof import('../lib/db').getReceivedSampleForOrder>, ReturnType<typeof import('../lib/db').getReceivedSampleForOrder>>()
const mockGetPatientCulturalPreferences = vi.fn().mockResolvedValue(null)

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    getPatientCulturalPreferences: mockGetPatientCulturalPreferences,
    getReceivedSampleForOrder: mockGetReceivedSampleForOrder,
  }
})

// ---- Test data ----

const FIXED_AUTHORED = '2026-01-01T10:00:00.000Z'

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    patientFirstName: 'Ahmad',
    patientAge: 45,
    patientRef: 'Patient/123',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: FIXED_AUTHORED,
    receivedAt: FIXED_AUTHORED,
    syncedAt: FIXED_AUTHORED,
    ...overrides,
  }
}

// Lazy import (after mocks)
const { OrderCard } = await import('../components/orders/OrderCard')

describe('OrderCard — async recollect guard (Change 3)', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockGetReceivedSampleForOrder.mockReset()
  })

  it('routes to /worklist when DB confirms a specimen exists — even before effect resolves', async () => {
    // Simulate: effect hasn't run yet (sampleReceived state = false) but DB has a specimen
    mockGetReceivedSampleForOrder.mockResolvedValue({
      id: 'specimen-existing',
      resourceType: 'Specimen',
      status: 'available',
    } as any)

    const user = userEvent.setup()
    render(<OrderCard order={makeOrder()} />)

    // At this point, the component's useEffect hasn't resolved yet (microtask queue).
    // Click the card immediately.
    const card = screen.getByRole('button', { name: /Receive sample for Ahmad/ })
    await user.click(card)

    // The fresh DB check must intercept and route to /worklist
    expect(mockPush).toHaveBeenCalledWith('/worklist')
    // ReceiveSampleModal must NOT be shown
    expect(screen.queryByTestId('receive-sample-modal')).toBeNull()
  })

  it('opens ReceiveSampleModal when DB confirms NO specimen exists', async () => {
    // DB returns undefined → no existing specimen → open receive
    mockGetReceivedSampleForOrder.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<OrderCard order={makeOrder()} />)

    const card = screen.getByRole('button', { name: /Receive sample for Ahmad/ })
    await user.click(card)

    // Should NOT route to worklist
    expect(mockPush).not.toHaveBeenCalled()
    // ReceiveSampleModal should render (presence of verification form step)
    await act(async () => {})
    // The modal is opened — the verification form is the first step
    expect(screen.queryByTestId('patient-verification-form')).not.toBeNull()
  })
})
