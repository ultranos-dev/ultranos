import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

// Allergies are Tier-1 safety-critical. loadAllergies must not depend solely on the
// local cache (which can lag behind the Hub — e.g. a patient's allergies were never
// pulled to this device, so the detail banner showed a dangerous false "No known
// allergies" while the /patients list, sourced from the Hub, correctly flagged them).
// It now reconciles with the Hub (allergy.list) when online, and falls back to local
// only when the Hub is unreachable.

vi.mock('@/lib/trpc', () => ({ fetchPatientAllergiesFromHub: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: { ALLERGY: 'ALLERGY' },
}))

import { useAllergyStore } from '@/stores/allergy-store'
import { db } from '@/lib/db'
import { fetchPatientAllergiesFromHub } from '@/lib/trpc'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
const mockHub = vi.mocked(fetchPatientAllergiesFromHub)

function makeAllergy(
  id: string,
  substance: string,
  status: 'active' | 'inactive' | 'resolved' = 'active',
): FhirAllergyIntolerance {
  return {
    id,
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: status }],
    },
    type: 'allergy',
    criticality: 'high',
    code: { text: substance },
    patient: { reference: `Patient/${PID}` },
    recordedDate: '2026-06-26T20:45:54Z',
    _ultranos: { substanceFreeText: substance, createdAt: '2026-06-26T20:45:54Z', isOfflineCreated: false, hlcTimestamp: '001782506754335:00000:node' },
    meta: { lastUpdated: '2026-06-26T20:45:54Z', versionId: '1' },
  } as unknown as FhirAllergyIntolerance
}

describe('allergy-store — Hub-authoritative loadAllergies', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    useAllergyStore.getState().clearPhiState() // resets isLoading/epoch so loads proceed
    await db.allergyIntolerances.clear()
  })

  it('shows the Hub allergies when the local cache is empty (the reported bug) and caches them', async () => {
    mockHub.mockResolvedValue([makeAllergy('hub-1', 'Penicillin')])

    await useAllergyStore.getState().loadAllergies(PID)

    const { allergies, loadError } = useAllergyStore.getState()
    expect(allergies.map((a) => a.code.text)).toEqual(['Penicillin'])
    expect(loadError).toBeNull()
    // Cached locally for the next offline view
    expect(await db.allergyIntolerances.get('hub-1')).toBeDefined()
  })

  it('treats the Hub as authoritative over a stale local cache', async () => {
    await db.allergyIntolerances.put(makeAllergy('local-stale', 'Aspirin'))
    mockHub.mockResolvedValue([makeAllergy('hub-1', 'Penicillin'), makeAllergy('hub-2', 'Peanuts')])

    await useAllergyStore.getState().loadAllergies(PID)

    expect(useAllergyStore.getState().allergies.map((a) => a.code.text).sort()).toEqual(['Peanuts', 'Penicillin'])
  })

  it('falls back to the local cache when the Hub is unreachable (offline)', async () => {
    await db.allergyIntolerances.put(makeAllergy('local-1', 'Sulfa'))
    mockHub.mockResolvedValue(null) // offline / no session

    await useAllergyStore.getState().loadAllergies(PID)

    const { allergies, loadError } = useAllergyStore.getState()
    expect(allergies.map((a) => a.code.text)).toEqual(['Sulfa'])
    expect(loadError).toBeNull()
  })

  it('shows a genuine NKA only when the Hub authoritatively returns no allergies', async () => {
    mockHub.mockResolvedValue([])

    await useAllergyStore.getState().loadAllergies(PID)

    const { allergies, loadError } = useAllergyStore.getState()
    expect(allergies).toEqual([])
    expect(loadError).toBeNull()
  })

  it('excludes non-active records from the Hub result', async () => {
    mockHub.mockResolvedValue([makeAllergy('hub-1', 'Penicillin', 'active'), makeAllergy('hub-2', 'OldOne', 'resolved')])

    await useAllergyStore.getState().loadAllergies(PID)

    expect(useAllergyStore.getState().allergies.map((a) => a.code.text)).toEqual(['Penicillin'])
  })
})
