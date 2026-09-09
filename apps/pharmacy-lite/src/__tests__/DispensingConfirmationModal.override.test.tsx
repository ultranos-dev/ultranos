/**
 * Task 3: DispensingConfirmationModal override sub-form tests.
 * TDD: this file is written BEFORE the modal implementation.
 *
 * Mocks next-intl (identity k→k), runDispenseInteractionCheck,
 * getRecallAlertsForAtc, and fetchActiveMedicationDisplays so the
 * interaction status resolves synchronously to a chosen state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── next-intl: identity translator ───────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ── Interaction / recall / active-med checks ──────────────────────────────────
const mockRunCheck = vi.fn()
vi.mock('@/lib/dispense-interaction-check', () => ({
  runDispenseInteractionCheck: (...args: unknown[]) => mockRunCheck(...args),
}))

vi.mock('@/lib/drug-catalog-queries', () => ({
  getRecallAlertsForAtc: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/active-medications', () => ({
  fetchActiveMedicationDisplays: vi.fn().mockResolvedValue([]),
}))

import { DispensingConfirmationModal } from '@/components/pharmacy/DispensingConfirmationModal'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

// ── helpers ───────────────────────────────────────────────────────────────────
const baseItem: FulfillmentItem = {
  prescription: {
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
  selected: true,
  brandName: '',
  batchLot: '',
}

function renderModal(onConfirm: (override?: { reason: string; supervisorName: string }) => void) {
  return render(
    <DispensingConfirmationModal
      items={[baseItem]}
      patientName="Fatima"
      patientAllergies={[]}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Test suite ────────────────────────────────────────────────────────────────
describe('DispensingConfirmationModal — override sub-form', () => {
  // ── CLEAR STATE ────────────────────────────────────────────────────────────
  describe('clear state (no override required)', () => {
    beforeEach(() => {
      mockRunCheck.mockResolvedValue({ state: 'clear' })
    })

    it('does NOT render the override-reason textarea', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.queryByTestId('override-reason')).not.toBeInTheDocument()
    })

    it('does NOT render the override-supervisor input', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.queryByTestId('override-supervisor')).not.toBeInTheDocument()
    })

    it('confirm is enabled after ack and calls onConfirm with NO override arg', async () => {
      const onConfirm = vi.fn()
      const user = userEvent.setup()
      renderModal(onConfirm)

      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())

      const confirmBtn = screen.getByTestId('modal-confirm-dispensing-btn')
      expect(confirmBtn).toBeDisabled() // disabled until ack

      await user.click(screen.getByTestId('dispensing-ack-checkbox'))
      expect(confirmBtn).not.toBeDisabled()

      await user.click(confirmBtn)
      expect(onConfirm).toHaveBeenCalledTimes(1)
      // no override arg passed (undefined)
      expect(onConfirm).toHaveBeenCalledWith(undefined)
    })
  })

  // ── WARNING STATE ──────────────────────────────────────────────────────────
  describe('warning state (override required)', () => {
    beforeEach(() => {
      mockRunCheck.mockResolvedValue({
        state: 'warning',
        interactions: ['Amoxicillin + Warfarin: bleeding risk'],
      })
    })

    it('renders the override-reason textarea', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.getByTestId('override-reason')).toBeInTheDocument()
    })

    it('renders the override-supervisor input', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.getByTestId('override-supervisor')).toBeInTheDocument()
    })

    it('confirm is disabled until ack + reason (≥10 chars) + non-empty supervisor', async () => {
      const onConfirm = vi.fn()
      const user = userEvent.setup()
      renderModal(onConfirm)

      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())

      const confirmBtn = screen.getByTestId('modal-confirm-dispensing-btn')
      const ackBox = screen.getByTestId('dispensing-ack-checkbox')
      const reasonTA = screen.getByTestId('override-reason')
      const supervisorInput = screen.getByTestId('override-supervisor')

      // All empty → disabled
      expect(confirmBtn).toBeDisabled()

      // Only ack → still disabled (missing reason + supervisor)
      await user.click(ackBox)
      expect(confirmBtn).toBeDisabled()

      // Ack + short reason → still disabled (< 10 chars)
      await user.type(reasonTA, 'short')
      expect(confirmBtn).toBeDisabled()

      // Ack + short reason + supervisor → still disabled (reason too short)
      await user.type(supervisorInput, 'Dr. Sahar')
      expect(confirmBtn).toBeDisabled()

      // Add more chars to reach ≥10
      await user.type(reasonTA, ' enough now')
      // Should now be enabled
      expect(confirmBtn).not.toBeDisabled()
    })

    it('on confirm, calls onConfirm with { reason, supervisorName }', async () => {
      const onConfirm = vi.fn()
      const user = userEvent.setup()
      renderModal(onConfirm)

      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())

      await user.click(screen.getByTestId('dispensing-ack-checkbox'))
      await user.type(screen.getByTestId('override-reason'), 'chronic med, benefit outweighs risk')
      await user.type(screen.getByTestId('override-supervisor'), 'Dr. Sahar')
      await user.click(screen.getByTestId('modal-confirm-dispensing-btn'))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith({
        reason: 'chronic med, benefit outweighs risk',
        supervisorName: 'Dr. Sahar',
      })
    })
  })

  // ── UNAVAILABLE STATE ──────────────────────────────────────────────────────
  describe('unavailable state (override required)', () => {
    beforeEach(() => {
      mockRunCheck.mockResolvedValue({
        state: 'unavailable',
        reason: 'Drug interaction database not available',
      })
    })

    it('renders the override-reason textarea', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.getByTestId('override-reason')).toBeInTheDocument()
    })

    it('renders the override-supervisor input', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.getByTestId('override-supervisor')).toBeInTheDocument()
    })
  })

  // ── CONTRAINDICATED STATE ──────────────────────────────────────────────────
  describe('contraindicated state (hard-blocked, no override)', () => {
    beforeEach(() => {
      mockRunCheck.mockResolvedValue({
        state: 'contraindicated',
        interactions: ['Life-threatening interaction'],
      })
    })

    it('confirm is disabled even after ack (no override form)', async () => {
      const user = userEvent.setup()
      renderModal(vi.fn())

      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())

      const confirmBtn = screen.getByTestId('modal-confirm-dispensing-btn')
      expect(confirmBtn).toBeDisabled()

      // Ack it — should remain disabled
      await user.click(screen.getByTestId('dispensing-ack-checkbox'))
      expect(confirmBtn).toBeDisabled()
    })

    it('does NOT render the override form', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
      expect(screen.queryByTestId('override-reason')).not.toBeInTheDocument()
      expect(screen.queryByTestId('override-supervisor')).not.toBeInTheDocument()
    })
  })
})
