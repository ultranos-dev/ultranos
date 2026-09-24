import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { reconcileProvisionalPatient } from '@/lib/reconcile-provisional-patient'

const PROV = 'prov-pat-0001'
const HUB = 'hub-pat-0001'
const PROV_REF = `Patient/${PROV}`
const HUB_REF = `Patient/${HUB}`

function meta() {
  return { lastUpdated: new Date().toISOString(), versionId: '1' }
}
function ultranos() {
  return { hlcTimestamp: '001700000000000:00000:seed', createdAt: new Date().toISOString() }
}

describe('reconcileProvisionalPatient', () => {
  beforeEach(async () => {
    await Promise.all([
      db.patients.clear(),
      db.encounters.clear(),
      db.observations.clear(),
      db.conditions.clear(),
      db.medications.clear(),
      db.serviceRequests.clear(),
      db.medicationStatements.clear(),
      db.allergyIntolerances.clear(),
      db.diagnosticReports.clear(),
      db.syncQueue.clear(),
      db.provisionalIdMap.clear(),
    ])
  })

  it('re-keys the patient and re-points every locally-linked record onto the Hub id', async () => {
    // Provisional patient with the offline flags set.
    await db.patients.put({
      id: PROV,
      resourceType: 'Patient',
      name: [{ given: ['Amina'], text: 'Amina' }],
      gender: 'female',
      birthYearOnly: true,
      _ultranos: { ...ultranos(), nameLocal: 'Amina', isActive: true, patient_tier: 'FREE', isNomadic: false, mpiPending: true, isOfflineCreated: true },
      meta: meta(),
    } as unknown as Parameters<typeof db.patients.put>[0])

    // Records created against the provisional patient before the drain.
    await db.encounters.put({
      id: 'enc-1', resourceType: 'Encounter', status: 'in-progress',
      class: { system: 's', code: 'AMB', display: 'ambulatory' },
      subject: { reference: PROV_REF },
      participant: [{ individual: { reference: 'Practitioner/doc-1' } }],
      period: { start: new Date().toISOString() },
      _ultranos: ultranos(), meta: meta(),
    } as unknown as Parameters<typeof db.encounters.put>[0])

    await db.observations.put({
      id: 'obs-1', resourceType: 'Observation', status: 'final',
      subject: { reference: PROV_REF }, encounter: { reference: 'Encounter/enc-1' },
      _ultranos: ultranos(), meta: meta(),
    } as unknown as Parameters<typeof db.observations.put>[0])

    await db.allergyIntolerances.put({
      id: 'alg-1', resourceType: 'AllergyIntolerance',
      patient: { reference: PROV_REF },
      _ultranos: ultranos(), meta: meta(),
    } as unknown as Parameters<typeof db.allergyIntolerances.put>[0])

    await db.serviceRequests.put({
      id: 'sr-1', resourceType: 'ServiceRequest', status: 'active', intent: 'order',
      subject: { reference: PROV_REF },
      _ultranos: ultranos(), meta: meta(),
    } as unknown as Parameters<typeof db.serviceRequests.put>[0])

    const result = await reconcileProvisionalPatient(PROV, HUB)

    // Patient row re-keyed to the Hub id, flags cleared, provisional dropped.
    expect(await db.patients.get(PROV)).toBeUndefined()
    const hubPatient = await db.patients.get(HUB)
    expect(hubPatient).toBeDefined()
    expect((hubPatient as { _ultranos?: { mpiPending?: boolean } })._ultranos?.mpiPending).toBeUndefined()
    expect((hubPatient as { _ultranos?: { isOfflineCreated?: boolean } })._ultranos?.isOfflineCreated).toBeUndefined()

    // Children re-pointed onto the Hub reference.
    expect((await db.observations.get('obs-1') as { subject?: { reference?: string } }).subject?.reference).toBe(HUB_REF)
    expect((await db.allergyIntolerances.get('alg-1') as { patient?: { reference?: string } }).patient?.reference).toBe(HUB_REF)
    expect((await db.serviceRequests.get('sr-1') as { subject?: { reference?: string } }).subject?.reference).toBe(HUB_REF)
    expect((await db.encounters.get('enc-1') as { subject?: { reference?: string } }).subject?.reference).toBe(HUB_REF)

    // Moved children were re-enqueued as updates under their own ids.
    const queued = await db.syncQueue.where('resourceId').equals('obs-1').toArray()
    expect(queued.some((e) => e.action === 'update')).toBe(true)

    // Mapping recorded.
    const mapping = await db.provisionalIdMap.get(PROV)
    expect(mapping?.hubId).toBe(HUB)
    expect(result.reParented).toBeGreaterThanOrEqual(4)
  })

  it('is a no-op mapping record when the Hub echoes the provisional id', async () => {
    const r = await reconcileProvisionalPatient(PROV, PROV)
    expect(r.reParented).toBe(0)
    expect((await db.provisionalIdMap.get(PROV))?.hubId).toBe(PROV)
  })
})
