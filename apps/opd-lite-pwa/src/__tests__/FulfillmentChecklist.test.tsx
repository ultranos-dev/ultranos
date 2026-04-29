import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

// We import the real component — it doesn't exist yet, so this will fail (RED phase)
import { FulfillmentChecklist } from '@/components/pharmacy/FulfillmentChecklist'

const sampleRx: VerifiedPrescription[] = [
  {
    id: 'rx-001',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
    dur: 7,
    req: 'pract-001',
    pat: 'pat-001',
    at: '2026-04-28T10:00:00Z',
  },
  {
    id: 'rx-002',
    med: 'IBU400',
    medN: 'Ibuprofen',
    medT: 'Ibuprofen 400mg Tablet',
    dos: { qty: 1, unit: 'tablet', freqN: 2, per: 1, perU: 'd' },
    dur: 5,
    req: 'pract-001',
    pat: 'pat-001',
    at: '2026-04-28T10:00:00Z',
  },
]

function loadStore() {
  useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
}

beforeEach(() => {
  useFulfillmentStore.getState().reset()
})

describe('FulfillmentChecklist', () => {
  // AC 1: Pharmacist can select which medications are being fulfilled
  describe('AC 1: Medication selection (Partial vs. Full)', () => {
    it('renders a checkbox for each medication item', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      const checkboxes = screen.getAllByRole('checkbox')
      // One per medication + possibly select-all
      expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    })

    it('all medications are selected by default (full fulfillment)', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      const rx1Checkbox = screen.getByTestId('fulfill-checkbox-rx-001')
      const rx2Checkbox = screen.getByTestId('fulfill-checkbox-rx-002')
      expect(rx1Checkbox).toBeChecked()
      expect(rx2Checkbox).toBeChecked()
    })

    it('allows deselecting a medication for partial fulfillment', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      const rx1Checkbox = screen.getByTestId('fulfill-checkbox-rx-001')
      await user.click(rx1Checkbox)

      expect(rx1Checkbox).not.toBeChecked()
      // Store should reflect the toggle
      const state = useFulfillmentStore.getState()
      expect(state.items[0]!.selected).toBe(false)
      expect(state.items[1]!.selected).toBe(true)
    })

    it('displays medication name, dosage, and duration for each item', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.getByText('Amoxicillin 500mg Capsule')).toBeInTheDocument()
      expect(screen.getByText('Ibuprofen 400mg Tablet')).toBeInTheDocument()
      // Dosage info
      expect(screen.getByText(/1 capsule/)).toBeInTheDocument()
      expect(screen.getByText(/3× daily/)).toBeInTheDocument()
      expect(screen.getByText(/7 days/)).toBeInTheDocument()
    })

    it('shows practitioner name', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.getByText(/Dr\. Ahmad/)).toBeInTheDocument()
    })

    it('provides select all / deselect all controls', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      const deselectAllBtn = screen.getByTestId('deselect-all-btn')
      await user.click(deselectAllBtn)

      const state = useFulfillmentStore.getState()
      expect(state.items.every((i) => !i.selected)).toBe(true)

      const selectAllBtn = screen.getByTestId('select-all-btn')
      await user.click(selectAllBtn)

      const state2 = useFulfillmentStore.getState()
      expect(state2.items.every((i) => i.selected)).toBe(true)
    })
  })

  // AC 2: Brand Name and Batch/Lot Number confirmation
  describe('AC 2: Brand Name and Batch/Lot confirmation', () => {
    it('renders brand name input for each selected medication', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.getByTestId('brand-input-rx-001')).toBeInTheDocument()
      expect(screen.getByTestId('brand-input-rx-002')).toBeInTheDocument()
    })

    it('renders batch/lot input for each selected medication (optional)', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.getByTestId('batch-input-rx-001')).toBeInTheDocument()
      expect(screen.getByTestId('batch-input-rx-002')).toBeInTheDocument()
    })

    it('updates brand name in the store when typed', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      const brandInput = screen.getByTestId('brand-input-rx-001')
      await user.type(brandInput, 'Amoxil')

      const state = useFulfillmentStore.getState()
      expect(state.items[0]!.brandName).toBe('Amoxil')
    })

    it('updates batch/lot number in the store when typed', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      const batchInput = screen.getByTestId('batch-input-rx-001')
      await user.type(batchInput, 'LOT-2026-04A')

      const state = useFulfillmentStore.getState()
      expect(state.items[0]!.batchLot).toBe('LOT-2026-04A')
    })

    it('hides brand/batch inputs for deselected medications', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      // Deselect rx-001
      await user.click(screen.getByTestId('fulfill-checkbox-rx-001'))

      expect(screen.queryByTestId('brand-input-rx-001')).not.toBeInTheDocument()
      expect(screen.queryByTestId('batch-input-rx-001')).not.toBeInTheDocument()
      // rx-002 inputs should still be there
      expect(screen.getByTestId('brand-input-rx-002')).toBeInTheDocument()
    })
  })

  // Confirm Dispensing button behavior
  describe('Confirm Dispensing action', () => {
    it('renders Confirm Dispensing button', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.getByTestId('confirm-dispensing-btn')).toBeInTheDocument()
    })

    it('disables Confirm Dispensing when no items selected', async () => {
      loadStore()
      const user = userEvent.setup()
      render(<FulfillmentChecklist />)

      await user.click(screen.getByTestId('deselect-all-btn'))

      expect(screen.getByTestId('confirm-dispensing-btn')).toBeDisabled()
    })

    it('calls onConfirm callback with selected items when confirmed', async () => {
      loadStore()
      const onConfirm = vi.fn()
      const user = userEvent.setup()
      render(<FulfillmentChecklist onConfirm={onConfirm} />)

      // Deselect rx-002 for partial fulfillment
      await user.click(screen.getByTestId('fulfill-checkbox-rx-002'))

      await user.click(screen.getByTestId('confirm-dispensing-btn'))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      const calledItems = onConfirm.mock.calls[0]![0]
      expect(calledItems).toHaveLength(1)
      expect(calledItems[0].prescription.id).toBe('rx-001')
    })
  })

  // Empty state
  it('shows empty state when no prescriptions loaded', () => {
    render(<FulfillmentChecklist />)

    expect(screen.getByTestId('fulfillment-empty-state')).toBeInTheDocument()
  })

  // Patient info display (D3)
  describe('Patient identity display', () => {
    it('displays patient name and age when provided', () => {
      useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad', { name: 'Fatima', age: 34 })
      render(<FulfillmentChecklist />)

      const patientInfo = screen.getByTestId('patient-info')
      expect(patientInfo).toHaveTextContent('Patient: Fatima, 34 y/o')
    })

    it('omits patient info when not provided', () => {
      loadStore()
      render(<FulfillmentChecklist />)

      expect(screen.queryByTestId('patient-info')).not.toBeInTheDocument()
    })
  })

  // RTL snapshot tests (CLAUDE.md requirement)
  describe('RTL snapshot tests', () => {
    it('matches snapshot in LTR mode', () => {
      loadStore()
      const { container } = render(
        <div dir="ltr">
          <FulfillmentChecklist />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL mode', () => {
      loadStore()
      const { container } = render(
        <div dir="rtl">
          <FulfillmentChecklist />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })
})
