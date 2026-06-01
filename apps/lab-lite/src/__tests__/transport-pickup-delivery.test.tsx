/**
 * Story 54.3 — Courier Pickup & Delivery Screen Tests (Tasks 6 & 7)
 *
 * Tests:
 * CourierPickupScreen (6 tests):
 *   1.  Renders step 1 (courier ID input)
 *   2.  Cannot proceed to next step without courier ID
 *   3.  Can navigate through steps with valid data
 *   4.  Adds sample to list when label is typed
 *   5.  "Start Transport" button calls startTransport with correct args
 *   6.  Success step shows manifest text
 *
 * CourierDeliveryScreen (6 tests):
 *   7.  Renders session details (sample count, elapsed time)
 *   8.  Shows red stability warning when elapsed > 6 hours
 *   9.  Shows amber stability warning when elapsed > 4 hours (but <= 6)
 *   10. "Record Delivery" is disabled unless condition is selected
 *   11. Calls recordDelivery with correct args
 *   12. Shows flag summary banner when session has flags after delivery
 *
 * RTL layout tests (story 13.8):
 *   13. RTL: pickup screen renders with dir="rtl" without layout issues
 *   14. RTL: delivery screen renders with dir="rtl"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/transport-service', () => ({
  startTransport: vi.fn(),
  recordDelivery: vi.fn(),
  getActiveTransportsForCourier: vi.fn(),
}))

vi.mock('@/lib/transport-manifest', () => ({
  generateManifest: vi.fn(() => ({
    sessionId: 'sess-1',
    courierId: 'C-1',
    originName: 'Lab A',
    destinationName: 'Main Lab',
    pickupTimestamp: new Date().toISOString(),
    expectedArrival: null,
    samples: [],
    sampleCount: 0,
  })),
  renderManifestText: vi.fn(() => 'MANIFEST TEXT'),
  reportManifestGenerated: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ samples: { bulkGet: vi.fn(() => []) } })),
  getLocationById: vi.fn(),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Truck: () => <svg aria-hidden />,
  Scan: () => <svg aria-hidden />,
  Thermometer: () => <svg aria-hidden />,
  CheckCircle: () => <svg aria-hidden />,
  AlertCircle: () => <svg aria-hidden />,
  Package: () => <svg aria-hidden />,
  ClipboardList: () => <svg aria-hidden />,
  Clock: () => <svg aria-hidden />,
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { CourierPickupScreen } from '@/components/transport/CourierPickupScreen'
import { CourierDeliveryScreen } from '@/components/transport/CourierDeliveryScreen'
import { startTransport } from '@/lib/transport-service'
import { recordDelivery } from '@/lib/transport-service'
import type { TransportSession } from '@/types/transport'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_PICKUP_PROPS = {
  originLocationId: 'loc-origin-001',
  destinationLocationId: 'loc-main-lab',
  onDone: vi.fn(),
}

function makeSession(overrides: Partial<TransportSession> = {}): TransportSession {
  return {
    id: 'sess-abc-123',
    courierId: 'CRR-001',
    originLocationId: 'loc-origin-001',
    destinationLocationId: 'loc-main-lab',
    status: 'in-transit',
    pickupTimestamp: new Date().toISOString(),
    deliveryTimestamp: null,
    pickupTemperature: null,
    deliveryTemperature: null,
    sampleIds: ['S-001', 'S-002'],
    sampleCount: 2,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: null,
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: { createdAt: new Date().toISOString(), syncStatus: 'pending' },
    ...overrides,
  }
}

// Navigate pickup screen through all steps up to "summary"
async function navigatePickupToSummary(courierId = 'CRR-001') {
  // Step 1: enter courier ID
  const idInput = screen.getByTestId('courier-id-input')
  fireEvent.change(idInput, { target: { value: courierId } })
  fireEvent.click(screen.getByRole('button', { name: /next/i }))

  // Step 2: destination — click Next
  await waitFor(() => expect(screen.getByText(/select destination/i)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /next/i }))

  // Step 3: scan samples — add one label
  await waitFor(() => expect(screen.getByTestId('scan-input')).toBeInTheDocument())
  fireEvent.change(screen.getByTestId('scan-input'), { target: { value: 'L2026-001' } })
  fireEvent.click(screen.getByTestId('add-sample-button'))

  // Proceed to temperature
  await waitFor(() => expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: /next/i }))

  // Step 4: temperature — skip
  await waitFor(() => expect(screen.getByTestId('skip-temperature-button')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('skip-temperature-button'))

  // Step 5: summary should now be visible
  await waitFor(() => expect(screen.getByTestId('start-transport-button')).toBeInTheDocument())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CourierPickupScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. renders step 1 with courier ID input', () => {
    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)

    expect(screen.getByTestId('courier-pickup-screen')).toBeInTheDocument()
    expect(screen.getByTestId('courier-id-input')).toBeInTheDocument()
    expect(screen.getByText(/enter courier id/i)).toBeInTheDocument()
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument()
  })

  it('2. cannot proceed to step 2 without entering a courier ID', () => {
    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)

    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()

    // Type whitespace only — still disabled
    fireEvent.change(screen.getByTestId('courier-id-input'), { target: { value: '   ' } })
    expect(nextBtn).toBeDisabled()
  })

  it('3. can navigate through all steps with valid data', async () => {
    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)

    // Step 1 → 2
    fireEvent.change(screen.getByTestId('courier-id-input'), { target: { value: 'CRR-001' } })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    // Step 2 → 3
    await waitFor(() => expect(screen.getByText(/select destination/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    // Step 3 — verify scan UI is present
    await waitFor(() => expect(screen.getByTestId('scan-input')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('scan-input'), { target: { value: 'L2026-099' } })
    fireEvent.click(screen.getByTestId('add-sample-button'))

    // Step 3 → 4
    await waitFor(() => expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    // Step 4 → 5 via skip
    await waitFor(() => expect(screen.getByTestId('skip-temperature-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('skip-temperature-button'))

    // Step 5 — summary visible
    await waitFor(() => expect(screen.getByTestId('start-transport-button')).toBeInTheDocument())
    expect(screen.getByText(/confirm transport/i)).toBeInTheDocument()
  })

  it('4. adds a sample label to the list when typed and button clicked', async () => {
    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)

    // Navigate to step 3
    fireEvent.change(screen.getByTestId('courier-id-input'), { target: { value: 'CRR-001' } })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/select destination/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByTestId('scan-input')).toBeInTheDocument())

    // Add first label
    fireEvent.change(screen.getByTestId('scan-input'), { target: { value: 'L2026-001' } })
    fireEvent.click(screen.getByTestId('add-sample-button'))

    await waitFor(() => expect(screen.getByText('L2026-001')).toBeInTheDocument())
    expect(screen.getByText(/1 sample added/i)).toBeInTheDocument()

    // Add second label
    fireEvent.change(screen.getByTestId('scan-input'), { target: { value: 'L2026-002' } })
    fireEvent.click(screen.getByTestId('add-sample-button'))

    await waitFor(() => expect(screen.getByText('L2026-002')).toBeInTheDocument())
    expect(screen.getByText(/2 samples added/i)).toBeInTheDocument()

    // Duplicate label shows error
    fireEvent.change(screen.getByTestId('scan-input'), { target: { value: 'L2026-001' } })
    fireEvent.click(screen.getByTestId('add-sample-button'))
    await waitFor(() => expect(screen.getByText(/already added/i)).toBeInTheDocument())
  })

  it('5. Start Transport button calls startTransport with correct arguments', async () => {
    const mockSession = makeSession({ id: 'sess-new', courierId: 'CRR-001' })
    vi.mocked(startTransport).mockResolvedValue(mockSession)

    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)
    await navigatePickupToSummary('CRR-001')

    await act(async () => {
      fireEvent.click(screen.getByTestId('start-transport-button'))
    })

    await waitFor(() => expect(startTransport).toHaveBeenCalledOnce())
    expect(startTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        courierId: 'CRR-001',
        originLocationId: DEFAULT_PICKUP_PROPS.originLocationId,
        destinationLocationId: DEFAULT_PICKUP_PROPS.destinationLocationId,
        sampleIds: ['L2026-001'],
      }),
    )
  })

  it('6. success step shows manifest text after transport starts', async () => {
    const mockSession = makeSession({ id: 'sess-new' })
    vi.mocked(startTransport).mockResolvedValue(mockSession)

    render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />)
    await navigatePickupToSummary()

    await act(async () => {
      fireEvent.click(screen.getByTestId('start-transport-button'))
    })

    await waitFor(() => expect(screen.getByTestId('manifest-text')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-text')).toHaveTextContent('MANIFEST TEXT')
    expect(screen.getByTestId('done-button')).toBeInTheDocument()
    expect(screen.getByText(/transport started/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------

describe('CourierDeliveryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('7. renders session details including sample count and elapsed time', () => {
    const session = makeSession()
    render(<CourierDeliveryScreen session={session} onDelivered={vi.fn()} />)

    expect(screen.getByTestId('courier-delivery-screen')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()         // sampleCount
    expect(screen.getByTestId('elapsed-time')).toBeInTheDocument()
    // Origin → destination IDs shown in route
    expect(screen.getByText(/loc-origin-001/)).toBeInTheDocument()
    expect(screen.getByText(/loc-main-lab/)).toBeInTheDocument()
  })

  it('8. shows red stability warning when elapsed > 6 hours', () => {
    const oldPickup = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
    const session = makeSession({ pickupTimestamp: oldPickup })
    render(<CourierDeliveryScreen session={session} onDelivered={vi.fn()} />)

    const warning = screen.getByTestId('stability-warning')
    expect(warning).toBeInTheDocument()
    expect(warning.className).toContain('red')
    expect(warning).toHaveTextContent(/exceeds 6 hours/i)
  })

  it('9. shows amber stability warning when elapsed between 4 and 6 hours', () => {
    const oldPickup = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    const session = makeSession({ pickupTimestamp: oldPickup })
    render(<CourierDeliveryScreen session={session} onDelivered={vi.fn()} />)

    const warning = screen.getByTestId('stability-warning')
    expect(warning).toBeInTheDocument()
    expect(warning.className).toContain('amber')
    expect(warning).toHaveTextContent(/approaching 4 hours/i)
  })

  it('10. Record Delivery button is disabled until a condition is selected', () => {
    const session = makeSession()
    render(<CourierDeliveryScreen session={session} onDelivered={vi.fn()} />)

    const btn = screen.getByTestId('record-delivery-button')
    expect(btn).toBeDisabled()

    // Select a condition
    fireEvent.click(screen.getByTestId('condition-acceptable'))
    expect(btn).not.toBeDisabled()
  })

  it('11. calls recordDelivery with correct session ID and delivery input', async () => {
    const session = makeSession()
    const updatedSession = makeSession({ status: 'delivered', deliveryTimestamp: new Date().toISOString() })
    vi.mocked(recordDelivery).mockResolvedValue(updatedSession)

    const onDelivered = vi.fn()
    render(<CourierDeliveryScreen session={session} onDelivered={onDelivered} />)

    // Set temperature and select condition
    fireEvent.change(screen.getByTestId('delivery-temp-input'), { target: { value: '25' } })
    fireEvent.click(screen.getByTestId('condition-acceptable'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('record-delivery-button'))
    })

    await waitFor(() => expect(recordDelivery).toHaveBeenCalledOnce())
    expect(recordDelivery).toHaveBeenCalledWith(
      'sess-abc-123',
      expect.objectContaining({
        conditionAtDelivery: 'acceptable',
        deliveryTemperature: 25,
      }),
    )
    expect(onDelivered).toHaveBeenCalledWith(updatedSession)
  })

  it('12. shows flag summary banner when session has flags after delivery', async () => {
    const session = makeSession()
    const updatedSession = makeSession({
      status: 'flagged',
      deliveryTimestamp: new Date().toISOString(),
      flags: [
        {
          sampleId: 'S-001',
          labSampleId: 'L2026-001',
          flagType: 'stability-exceeded',
          message: 'Sample L2026-001 exceeded stability window',
          timestamp: new Date().toISOString(),
        },
      ],
    })
    vi.mocked(recordDelivery).mockResolvedValue(updatedSession)

    render(<CourierDeliveryScreen session={session} onDelivered={vi.fn()} />)
    fireEvent.click(screen.getByTestId('condition-damaged'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('record-delivery-button'))
    })

    await waitFor(() => expect(screen.getByTestId('flag-summary-banner')).toBeInTheDocument())
    expect(screen.getByTestId('flag-summary-banner')).toHaveTextContent(/1 of 2 samples? flagged/i)
  })
})

// ---------------------------------------------------------------------------

describe('RTL layout', () => {
  it('13. pickup screen renders without errors in RTL context', () => {
    const { container } = render(<CourierPickupScreen {...DEFAULT_PICKUP_PROPS} />, {
      wrapper: ({ children }) => <div dir="rtl">{children}</div>,
    })
    // Basic smoke test — component must mount and show primary content
    expect(container.querySelector('[data-testid="courier-pickup-screen"]')).toBeInTheDocument()
    expect(screen.getByTestId('courier-id-input')).toBeInTheDocument()
  })

  it('14. delivery screen renders without errors in RTL context', () => {
    const session = makeSession()
    const { container } = render(
      <CourierDeliveryScreen session={session} onDelivered={vi.fn()} />,
      {
        wrapper: ({ children }) => <div dir="rtl">{children}</div>,
      },
    )
    expect(container.querySelector('[data-testid="courier-delivery-screen"]')).toBeInTheDocument()
    expect(screen.getByTestId('record-delivery-button')).toBeInTheDocument()
  })
})
