import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { reconcileDuplicateEncounter } from '@/lib/reconcile-duplicate-encounter'

const DUP = 'dup-enc-0001'
const CANON = 'canon-enc-0001'
const PATIENT = 'Patient/pat-recon-1'

function baseMeta() {
  return { lastUpdated: new Date().toISOString(), versionId: '1' }
}
function baseUltranos() {
  return { isOfflineCreated: true, hlcTimestamp: '001700000000000:00000:seed', createdAt: new Date().toISOString() }
}

describe('reconcileDuplicateEncounter', () => {
  beforeEach(async () => {
    await Promise.all([
      db.encounters.clear(),
      db.observations.clear(),
      db.conditions.clear(),
      db.medications.clear(),
      db.soapLedger.clear(),
      db.syncQueue.clear(),
    ])
  })

  it('re-parents children onto the canonical encounter, drops the duplicate, and refreshes the queue', async () => {
    // Local duplicate encounter (rejected by the Hub) + its children.
    await db.encounters.put({
      id: DUP,
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: 's', code: 'AMB', display: 'ambulatory' },
      subject: { reference: PATIENT },
      participant: [{ individual: { reference: 'Practitioner/doc-1' } }],
      period: { start: new Date().toISOString() },
      _ultranos: baseUltranos(),
      meta: baseMeta(),
    } as unknown as Parameters<typeof db.encounters.put>[0])

    await db.observations.put({
      id: 'obs-1',
      resourceType: 'Observation',
      status: 'final',
      subject: { reference: PATIENT },
      encounter: { reference: `Encounter/${DUP}` },
      _ultranos: baseUltranos(),
      meta: baseMeta(),
    } as unknown as Parameters<typeof db.observations.put>[0])

    await db.soapLedger.put({
      id: 'soap-1',
      encounterId: DUP,
      subjective: 'x',
      hlcTimestamp: '001700000000000:00000:seed',
      createdAt: new Date().toISOString(),
    } as unknown as Parameters<typeof db.soapLedger.put>[0])

    // Stale queue entries: the rejected encounter-create + a child push.
    await db.syncQueue.bulkPut([
      { id: 'q-enc', resourceType: 'Encounter', resourceId: DUP, action: 'create', payload: 'enc:v1:x', status: 'syncing', hlcTimestamp: 'h', createdAt: new Date().toISOString(), retryCount: 1 },
      { id: 'q-obs', resourceType: 'Observation', resourceId: 'obs-1', action: 'create', payload: 'enc:v1:x', status: 'failed', hlcTimestamp: 'h', createdAt: new Date().toISOString(), retryCount: 2 },
    ] as unknown as Parameters<typeof db.syncQueue.bulkPut>[0])

    const result = await reconcileDuplicateEncounter(DUP, CANON)

    // Children re-parented onto the canonical encounter.
    const obs = await db.observations.get('obs-1')
    expect((obs as { encounter?: { reference?: string } }).encounter?.reference).toBe(`Encounter/${CANON}`)
    const soap = await db.soapLedger.get('soap-1')
    expect((soap as { encounterId?: string }).encounterId).toBe(CANON)

    // Duplicate encounter dropped.
    expect(await db.encounters.get(DUP)).toBeUndefined()

    // Return value.
    expect(result.reParented).toBe(2)
    expect(result.affectedResourceIds.sort()).toEqual(['obs-1', 'soap-1'])

    // Queue: stale duplicate-encounter entry cleared; children have fresh pending
    // entries pointing at the canonical parent (no dead-reference pushes remain).
    const q = await db.syncQueue.toArray()
    expect(q.find((e) => e.resourceId === DUP)).toBeUndefined()
    const obsEntry = q.find((e) => e.resourceId === 'obs-1')
    expect(obsEntry?.status).toBe('pending')
    const soapEntry = q.find((e) => e.resourceId === 'soap-1')
    expect(soapEntry?.status).toBe('pending')
  })

  it('is a no-op-safe when the duplicate has no children', async () => {
    await db.encounters.put({
      id: DUP,
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: 's', code: 'AMB', display: 'ambulatory' },
      subject: { reference: PATIENT },
      participant: [{ individual: { reference: 'Practitioner/doc-1' } }],
      period: { start: new Date().toISOString() },
      _ultranos: baseUltranos(),
      meta: baseMeta(),
    } as unknown as Parameters<typeof db.encounters.put>[0])

    const result = await reconcileDuplicateEncounter(DUP, CANON)
    expect(result.reParented).toBe(0)
    expect(await db.encounters.get(DUP)).toBeUndefined()
  })
})
