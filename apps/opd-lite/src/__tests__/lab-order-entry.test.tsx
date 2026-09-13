import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mapInputToServiceRequest } from '@/lib/lab-order-mapper'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@/components/clinical/LabPicker', () => ({ LabPicker: () => null }))

const h = vi.hoisted(() => ({
  state: {
    pendingOrders: [] as unknown[],
    addLabOrder: vi.fn().mockResolvedValue({}),
    cancelLabOrder: vi.fn().mockResolvedValue(undefined),
    loadOrders: vi.fn().mockResolvedValue(undefined),
    applyLabToPending: vi.fn().mockResolvedValue(undefined),
    updateLabOrder: vi.fn().mockResolvedValue({}),
    refreshLabOrderStatuses: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@/stores/lab-order-store', () => ({
  useLabOrderStore: (sel: (s: unknown) => unknown) => sel(h.state),
}))

import { LabOrderEntry } from '@/components/clinical/LabOrderEntry'

const ctx = { encounterId: 'enc1', patientId: 'pat1', practitionerRef: 'Practitioner/doc1' }

function order(overrides: Record<string, unknown> = {}) {
  const sr = mapInputToServiceRequest(
    {
      testCode: '58410-2',
      testDisplay: 'Complete blood count (CBC) panel',
      priority: 'urgent',
      reasonText: 'Rule out anemia',
      labId: 'lab1',
      labName: 'Central Lab',
    },
    ctx,
  )
  return { ...sr, ...overrides }
}

describe('LabOrderEntry rows', () => {
  beforeEach(() => {
    h.state.pendingOrders = []
    for (const v of Object.values(h.state)) {
      if (typeof v === 'function') (v as { mockClear?: () => void }).mockClear?.()
    }
  })

  it('renders enriched row details (code, category, reason, lab)', () => {
    h.state.pendingOrders = [order()]
    render(<LabOrderEntry {...ctx} />)
    expect(screen.getByText('58410-2')).toBeTruthy()
    expect(screen.getByText('Hematology')).toBeTruthy()
    expect(screen.getByText('Rule out anemia')).toBeTruthy()
    expect(screen.getByText('Central Lab')).toBeTruthy()
  })

  it('locks a lab-started row: hides Edit/Cancel, shows status badge', () => {
    h.state.pendingOrders = [order({ status: 'on-hold' })]
    render(<LabOrderEntry {...ctx} />)
    expect(screen.getByText('statusInProgress')).toBeTruthy()
    expect(screen.queryByText('edit')).toBeNull()
    expect(screen.queryByText('cancel')).toBeNull()
  })

  it('editing an unlocked row routes submit to updateLabOrder', async () => {
    h.state.pendingOrders = [order()]
    render(<LabOrderEntry {...ctx} />)
    fireEvent.click(screen.getByText('edit'))
    const submit = await screen.findByText('updateOrder')
    fireEvent.click(submit)
    await waitFor(() => expect(h.state.updateLabOrder).toHaveBeenCalled())
    expect(h.state.addLabOrder).not.toHaveBeenCalled()
  })

  it('refreshes order statuses on mount when orders exist', async () => {
    h.state.pendingOrders = [order()]
    render(<LabOrderEntry {...ctx} />)
    await waitFor(() => expect(h.state.refreshLabOrderStatuses).toHaveBeenCalled())
  })
})
