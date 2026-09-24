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

// Story 57.4: the modal now consumes fetchActiveMedications (with a completeness
// signal). Default to a COMPLETE empty result so these interaction-focused tests
// are unaffected (no active-med override is forced).
vi.mock('@/lib/active-medications', () => ({
  fetchActiveMedications: vi.fn().mockResolvedValue({ meds: [], complete: true }),
  fetchActiveMedicationDisplays: vi.fn().mockResolvedValue([]),
}))

import { DispensingConfirmationModal } from '@/components/pharmacy/DispensingConfirmationModal'
import { fetchActiveMedications } from '@/lib/active-medications'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

const mockFetchActiveMeds = vi.mocked(fetchActiveMedications)

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

import type { DispenseOverride } from '@/lib/medication-dispense'

function renderModal(onConfirm: (override?: DispenseOverride) => void) {
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
  // Default: active-med dimension loads successfully (complete). Individual
  // suites override this to simulate a degraded load.
  mockFetchActiveMeds.mockResolvedValue({ meds: [], complete: true })
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

    it('confirm is disabled until ack + reason code + reason (≥10) + supervisor name + id + PIN', async () => {
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

      // ack + full free-text reason + supervisor name, but NO structured code/credential
      await user.click(ackBox)
      await user.type(reasonTA, 'chronic med, benefit outweighs risk')
      await user.type(supervisorInput, 'Dr. Sahar')
      // Story 57.2: still disabled — reason code + supervisor id + PIN are required now
      expect(confirmBtn).toBeDisabled()

      await user.selectOptions(screen.getByTestId('override-reason-code'), 'BENEFIT_OUTWEIGHS_RISK')
      expect(confirmBtn).toBeDisabled() // still missing credential

      await user.type(screen.getByTestId('override-supervisor-id'), '11111111-1111-1111-1111-111111111111')
      expect(confirmBtn).toBeDisabled() // still missing PIN

      await user.type(screen.getByTestId('override-supervisor-pin'), '4321')
      expect(confirmBtn).not.toBeDisabled()
    })

    it('on confirm, calls onConfirm with the structured override (reason code + supervisor credential)', async () => {
      const onConfirm = vi.fn()
      const user = userEvent.setup()
      renderModal(onConfirm)

      await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())

      await user.click(screen.getByTestId('dispensing-ack-checkbox'))
      await user.selectOptions(screen.getByTestId('override-reason-code'), 'BENEFIT_OUTWEIGHS_RISK')
      await user.type(screen.getByTestId('override-reason'), 'chronic med, benefit outweighs risk')
      await user.type(screen.getByTestId('override-supervisor'), 'Dr. Sahar')
      await user.type(screen.getByTestId('override-supervisor-id'), '11111111-1111-1111-1111-111111111111')
      await user.type(screen.getByTestId('override-supervisor-pin'), '4321')
      await user.click(screen.getByTestId('modal-confirm-dispensing-btn'))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'chronic med, benefit outweighs risk',
          supervisorName: 'Dr. Sahar',
          reasonCode: 'BENEFIT_OUTWEIGHS_RISK',
          supervisorId: '11111111-1111-1111-1111-111111111111',
          supervisorPin: '4321',
        }),
      )
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

  // ── ACTIVE-MED INCOMPLETE (Story 57.4, M-PHARM-1, AC 4) ──────────────────────
  describe('active-medication check incomplete (override required)', () => {
    beforeEach(() => {
      // Interaction check itself is clear, but the active-med dimension is degraded.
      mockRunCheck.mockResolvedValue({ state: 'clear' })
      mockFetchActiveMeds.mockResolvedValue({ meds: [], complete: false })
    })

    it('renders the active-med-unavailable warning', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.getByTestId('active-med-unavailable')).toBeInTheDocument())
    })

    it('requires an override (renders the override form) even though interactions are clear', async () => {
      renderModal(vi.fn())
      await waitFor(() => expect(screen.getByTestId('active-med-unavailable')).toBeInTheDocument())
      expect(screen.getByTestId('override-reason')).toBeInTheDocument()
      expect(screen.getByTestId('override-supervisor')).toBeInTheDocument()
    })

    it('confirm stays disabled after ack alone (override reason + supervisor needed)', async () => {
      const user = userEvent.setup()
      renderModal(vi.fn())
      await waitFor(() => expect(screen.getByTestId('active-med-unavailable')).toBeInTheDocument())

      const confirmBtn = screen.getByTestId('modal-confirm-dispensing-btn')
      await user.click(screen.getByTestId('dispensing-ack-checkbox'))
      expect(confirmBtn).toBeDisabled()

      await user.selectOptions(screen.getByTestId('override-reason-code'), 'CHECK_UNAVAILABLE_CLINICAL_JUDGEMENT')
      await user.type(screen.getByTestId('override-reason'), 'verified current meds verbally')
      await user.type(screen.getByTestId('override-supervisor'), 'Dr. Sahar')
      await user.type(screen.getByTestId('override-supervisor-id'), '22222222-2222-2222-2222-222222222222')
      await user.type(screen.getByTestId('override-supervisor-pin'), '9999')
      expect(confirmBtn).not.toBeDisabled()
    })
  })

  it('does NOT show the active-med warning when the dimension loaded completely', async () => {
    mockRunCheck.mockResolvedValue({ state: 'clear' })
    mockFetchActiveMeds.mockResolvedValue({ meds: [], complete: true })
    renderModal(vi.fn())
    await waitFor(() => expect(screen.queryByTestId('interaction-checking')).not.toBeInTheDocument())
    expect(screen.queryByTestId('active-med-unavailable')).not.toBeInTheDocument()
    expect(screen.queryByTestId('override-reason')).not.toBeInTheDocument()
  })
})
