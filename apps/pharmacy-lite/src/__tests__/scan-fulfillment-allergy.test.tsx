/**
 * Story 57.1 — scan → patient resolution → dispense allergy gate integration.
 *
 * Covers (AC 1, 2, 3, 5):
 * - resolvePatientForDispense: local + hub merge, encrypted cache with
 *   staleness marker, unknown-state semantics (null ≠ []).
 * - fulfillment-store identity assertion: allergies only applied when the
 *   resolution's patient ref matches the loaded prescription's `pat`;
 *   mismatches are discarded (fail-safe unknown).
 * - clearPatient() on fulfillment completion and reset.
 * - DispensingConfirmationModal: unknown allergy status requires the
 *   override-with-reason path even when the interaction check is clear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── fetch under our control ──────────────────────────────────────────────────
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ── auth session ─────────────────────────────────────────────────────────────
const mockGetAccessToken = vi.fn().mockResolvedValue('test-token')
const mockGetPractitionerRef = vi.fn().mockReturnValue('Practitioner/pharm-1')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: { userId: 'u1', practitionerId: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' },
      getAccessToken: mockGetAccessToken,
      getPractitionerRef: mockGetPractitionerRef,
    }),
  },
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'http://hub/api/trpc',
}))

// Modal deps — interaction check controlled per-test
const mockRunCheck = vi.fn()
vi.mock('@/lib/dispense-interaction-check', () => ({
  runDispenseInteractionCheck: (...args: unknown[]) => mockRunCheck(...args),
}))
vi.mock('@/lib/drug-catalog-queries', () => ({
  getRecallAlertsForAtc: vi.fn().mockResolvedValue([]),
}))
// Story 57.4: modal now consumes fetchActiveMedications; default to COMPLETE so
// the active-med dimension does not force an override in these allergy tests.
vi.mock('@/lib/active-medications', () => ({
  fetchActiveMedications: vi.fn().mockResolvedValue({ meds: [], complete: true }),
  fetchActiveMedicationDisplays: vi.fn().mockResolvedValue([]),
}))

import { db, type LocalPatient } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import {
  resolvePatientForDispense,
  ALLERGY_CACHE_FRESH_MS,
} from '@/lib/patient-resolution'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import { usePatientStore } from '@/stores/patient-store'
import { DispensingConfirmationModal } from '@/components/pharmacy/DispensingConfirmationModal'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

const PAT = 'pat-001'
const OTHER_PAT = 'pat-999'

const sampleRx: VerifiedPrescription[] = [
  {
    id: 'rx-001',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
    dur: 7,
    req: 'pract-001',
    pat: PAT,
    at: '2026-04-28T10:00:00Z',
  },
]

function makeLocalPatient(over: Partial<LocalPatient> = {}): LocalPatient {
  return {
    id: PAT,
    nameGiven: 'Fatima',
    gender: 'female',
    birthYear: 1992,
    allergies: ['Sulfa'],
    createdAt: '2026-01-01T00:00:00Z',
    source: 'registered',
    ...over,
  }
}

function hubOk(allergies: Array<{ substanceText: string | null }>) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { allergies } } } }),
  })
}

function hubDown() {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockGetAccessToken.mockResolvedValue('test-token')
  useFulfillmentStore.getState().reset()
  usePatientStore.getState().clearPatient()
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    encryptionKeyStore.setKey(key)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolvePatientForDispense (AC 1)', () => {
  it('merges OPD-sourced hub allergies with the local registry record', async () => {
    await db.patients.put(makeLocalPatient({ allergies: ['Sulfa'] }))
    hubOk([{ substanceText: 'Penicillin' }, { substanceText: 'sulfa' }]) // dupe, different case

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(false)
    expect(ctx.allergies).toEqual(['Sulfa', 'Penicillin']) // case-insensitive dedupe
    expect(ctx.patient?.id).toBe(PAT)
    expect(ctx.sources).toEqual({ local: true, hub: true, cache: 'none' })
  })

  it('caches a successful hub fetch keyed by patient ref with fetchedAt marker', async () => {
    hubOk([{ substanceText: 'Penicillin' }])

    await resolvePatientForDispense(PAT)

    const cached = await db.patientAllergyCache.get(PAT)
    expect(cached).toBeTruthy()
    expect(cached!.allergies).toEqual(['Penicillin'])
    expect(new Date(cached!.fetchedAt).getTime()).toBeGreaterThan(0)
  })

  it('a fresh cache entry still protects an offline re-dispense (known, not unknown)', async () => {
    await db.patientAllergyCache.put({
      patientRef: PAT,
      allergies: ['Penicillin'],
      fetchedAt: new Date(Date.now() - 60_000).toISOString(), // 1 min old
    })
    hubDown()

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(false)
    expect(ctx.allergies).toEqual(['Penicillin'])
    expect(ctx.sources.cache).toBe('fresh')
  })

  it('a STALE cache entry keeps its allergies for protection but the status is UNKNOWN', async () => {
    await db.patientAllergyCache.put({
      patientRef: PAT,
      allergies: ['Penicillin'],
      fetchedAt: new Date(Date.now() - ALLERGY_CACHE_FRESH_MS - 60_000).toISOString(),
    })
    hubDown()

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(true)
    expect(ctx.allergies).toEqual(['Penicillin']) // never discard known substances
    expect(ctx.sources.cache).toBe('stale')
  })

  it('offline with a local record → known (local allergies)', async () => {
    await db.patients.put(makeLocalPatient({ allergies: ['Sulfa'] }))
    hubDown()

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(false)
    expect(ctx.allergies).toEqual(['Sulfa'])
  })

  it('offline with NO local record and NO cache → UNKNOWN, never NKA (AC 2)', async () => {
    hubDown()

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(true)
    expect(ctx.allergies).toEqual([])
    expect(ctx.sources).toEqual({ local: false, hub: false, cache: 'none' })
  })

  it('hub-confirmed empty record → known NKA ([] with status known)', async () => {
    hubOk([])

    const ctx = await resolvePatientForDispense(PAT)

    expect(ctx.allergyStatusUnknown).toBe(false)
    expect(ctx.allergies).toEqual([])
  })

  it('accepts a "Patient/"-prefixed ref and normalizes it', async () => {
    hubOk([{ substanceText: 'Penicillin' }])

    const ctx = await resolvePatientForDispense(`Patient/${PAT}`)

    expect(ctx.ref).toBe(PAT)
    expect(ctx.allergies).toEqual(['Penicillin'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fulfillment-store identity assertion (AC 3)', () => {
  it('applies resolved allergies when the patient ref matches prescription.pat', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
    useFulfillmentStore.getState().setResolvedPatient({
      ref: PAT,
      patient: makeLocalPatient(),
      allergies: ['Penicillin'],
      allergyStatusUnknown: false,
      sources: { local: true, hub: true, cache: 'none' },
    })

    const s = useFulfillmentStore.getState()
    expect(s.patientRef).toBe(PAT)
    expect(s.patientAllergies).toEqual(['Penicillin'])
    expect(s.allergyStatusUnknown).toBe(false)
    expect(s.patientName).toBe('Fatima')
  })

  it("DISCARDS a resolution for a different patient — another patient's allergies are never consumed", () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
    useFulfillmentStore.getState().setResolvedPatient({
      ref: OTHER_PAT, // stale/mismatched
      patient: makeLocalPatient({ id: OTHER_PAT, nameGiven: 'Someone Else' }),
      allergies: ['Penicillin'],
      allergyStatusUnknown: false,
      sources: { local: true, hub: true, cache: 'none' },
    })

    const s = useFulfillmentStore.getState()
    // fail-safe unknown state retained
    expect(s.patientAllergies).toBeNull()
    expect(s.allergyStatusUnknown).toBe(true)
    expect(s.patientName).not.toBe('Someone Else')
  })

  it('loadPrescriptions resets the allergy context — a previous scan never leaks', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
    useFulfillmentStore.getState().setResolvedPatient({
      ref: PAT,
      patient: null,
      allergies: ['Penicillin'],
      allergyStatusUnknown: false,
      sources: { local: false, hub: true, cache: 'none' },
    })

    // Second scan for a DIFFERENT patient
    const rx2: VerifiedPrescription[] = [{ ...sampleRx[0]!, id: 'rx-002', pat: OTHER_PAT }]
    useFulfillmentStore.getState().loadPrescriptions(rx2, 'Dr. Ahmad')

    const s = useFulfillmentStore.getState()
    expect(s.patientRef).toBe(OTHER_PAT)
    expect(s.patientAllergies).toBeNull()
    expect(s.allergyStatusUnknown).toBe(true)
  })

  it('reset() clears the fulfillment allergy context AND the active patient (AC 4)', () => {
    usePatientStore.getState().setActivePatient(makeLocalPatient())
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')

    useFulfillmentStore.getState().reset()

    expect(useFulfillmentStore.getState().patientRef).toBeNull()
    expect(useFulfillmentStore.getState().patientAllergies).toBeNull()
    expect(useFulfillmentStore.getState().allergyStatusUnknown).toBe(true)
    expect(usePatientStore.getState().activePatient).toBeNull()
  })

  it('fulfillment completion clears the active patient (AC 4)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })
    usePatientStore.getState().setActivePatient(makeLocalPatient())
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')

    await useFulfillmentStore.getState().confirmDispense()

    expect(useFulfillmentStore.getState().phase).toBe('completed')
    expect(usePatientStore.getState().activePatient).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DispensingConfirmationModal — unknown allergy status (AC 2)', () => {
  const baseItem: FulfillmentItem = {
    prescription: sampleRx[0]!,
    selected: true,
    brandName: '',
    batchLot: '',
  }

  function renderModal(props: { allergyStatusUnknown?: boolean; patientAllergies?: string[] }) {
    return render(
      <DispensingConfirmationModal
        items={[baseItem]}
        patientName="Fatima"
        patientAllergies={props.patientAllergies}
        allergyStatusUnknown={props.allergyStatusUnknown}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
  }

  it('requires the override-with-reason path even when the interaction check is CLEAR', async () => {
    mockRunCheck.mockResolvedValue({ state: 'clear' })
    const user = userEvent.setup()
    renderModal({ allergyStatusUnknown: true, patientAllergies: undefined })

    await waitFor(() => expect(screen.getByTestId('override-reason')).toBeInTheDocument())
    expect(screen.getByTestId('override-supervisor')).toBeInTheDocument()
    expect(screen.getByTestId('override-allergy-unknown-notice')).toBeInTheDocument()

    // Story 57.2: confirm stays disabled until ack + reason code + reason(≥10) +
    // supervisor name + supervisor id + PIN.
    const confirmBtn = screen.getByTestId('modal-confirm-dispensing-btn')
    expect(confirmBtn).toBeDisabled()
    await user.click(screen.getByTestId('dispensing-ack-checkbox'))
    expect(confirmBtn).toBeDisabled()
    await user.selectOptions(screen.getByTestId('override-reason-code'), 'CHECK_UNAVAILABLE_CLINICAL_JUDGEMENT')
    await user.type(screen.getByTestId('override-reason'), 'verified verbally with patient')
    await user.type(screen.getByTestId('override-supervisor'), 'Dr. Sahar')
    expect(confirmBtn).toBeDisabled() // still missing supervisor id + PIN
    await user.type(screen.getByTestId('override-supervisor-id'), '11111111-1111-1111-1111-111111111111')
    await user.type(screen.getByTestId('override-supervisor-pin'), '4321')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('renders the amber unknown banner (never NKA) when allergies are undefined', async () => {
    mockRunCheck.mockResolvedValue({ state: 'clear' })
    const { container } = renderModal({ allergyStatusUnknown: true, patientAllergies: undefined })

    await waitFor(() => {
      const banner = container.querySelector('[data-testid="allergy-banner"]')!
      expect(banner.getAttribute('data-banner-state')).toBe('unknown')
    })
  })

  it('known-empty allergies ([]) do NOT require an override (no regression of NKA flow)', async () => {
    mockRunCheck.mockResolvedValue({ state: 'clear' })
    renderModal({ allergyStatusUnknown: false, patientAllergies: [] })

    await waitFor(() => expect(mockRunCheck).toHaveBeenCalled())
    expect(screen.queryByTestId('override-reason')).not.toBeInTheDocument()
    expect(screen.queryByTestId('override-allergy-unknown-notice')).not.toBeInTheDocument()
  })

  it('feeds resolved allergies into the interaction check (ALLERGY_MATCH input path, AC 5)', async () => {
    mockRunCheck.mockResolvedValue({
      state: 'contraindicated',
      interactions: ['Amoxicillin allergy match'],
    })
    renderModal({ allergyStatusUnknown: false, patientAllergies: ['Amoxicillin'] })

    await waitFor(() => expect(mockRunCheck).toHaveBeenCalled())
    expect(mockRunCheck).toHaveBeenCalledWith(['Amoxicillin'], ['Amoxicillin'], [])

    // contraindicated → hard blocked
    expect(screen.getByTestId('modal-confirm-dispensing-btn')).toBeDisabled()
  })
})
