import { describe, it, expect, beforeEach, vi } from 'vitest'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { useDiagnosisStore } from '@/stores/diagnosis-store'
import { db } from '@/lib/db'

/** The queue entry for a resource with the given action (default 'update'). */
async function pendingEntry(resourceId: string, action: 'create' | 'update' = 'update') {
  return vi.waitFor(async () => {
    const all = await db.syncQueue.toArray()
    const e = all.find((x) => x.resourceId === resourceId && x.action === action)
    if (!e) throw new Error(`${action} not enqueued yet`)
    return e
  })
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      getPractitionerRef: () => 'test-practitioner-123',
    }),
  },
}))

describe('useDiagnosisStore', () => {
  const testItem = {
    code: 'J06.9',
    display: 'Acute upper respiratory infection, unspecified',
  }
  const encounterId = 'enc-test-1'
  const patientId = 'pat-test-1'

  beforeEach(async () => {
    useDiagnosisStore.getState().clearPhiState()
    await db.conditions.clear()
    await db.syncQueue.clear()
  })

  it('starts with empty conditions', () => {
    expect(useDiagnosisStore.getState().conditions).toEqual([])
  })

  it('adds a diagnosis and persists to Dexie', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    expect(condition.resourceType).toBe('Condition')
    expect(condition.code.coding![0].code).toBe('J06.9')
    expect(condition._ultranos.diagnosisRank).toBe('primary')

    // Verify persisted in Dexie
    const stored = await db.conditions.get(condition.id)
    expect(stored).toBeDefined()
    expect(stored!.id).toBe(condition.id)

    // Verify in store state
    expect(useDiagnosisStore.getState().conditions).toHaveLength(1)
  })

  it('links condition to the active encounter', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    expect(condition.encounter.reference).toBe(`Encounter/${encounterId}`)
    expect(condition.subject.reference).toBe(`Patient/${patientId}`)
  })

  it('sets recorder from auth session practitioner ref', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    expect(condition.recorder).toEqual({
      reference: 'Practitioner/test-practitioner-123',
    })
  })

  it('soft-deletes a diagnosis (sets clinicalStatus to inactive) and removes from store', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    await useDiagnosisStore.getState().removeDiagnosis(condition.id)

    // Removed from in-memory store
    expect(useDiagnosisStore.getState().conditions).toHaveLength(0)

    // Still exists in Dexie but with inactive status (Tier 1 append-only)
    const stored = await db.conditions.get(condition.id)
    expect(stored).toBeDefined()
    expect(stored!.clinicalStatus.coding[0].code).toBe('inactive')
  })

  it('toggles diagnosis rank from primary to secondary', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    await useDiagnosisStore.getState().updateRank(condition.id, 'secondary')

    const updated = useDiagnosisStore.getState().conditions[0]
    expect(updated._ultranos.diagnosisRank).toBe('secondary')

    // Verify persisted
    const stored = await db.conditions.get(condition.id)
    expect(stored!._ultranos.diagnosisRank).toBe('secondary')
  })

  it('loads only active conditions for an encounter from Dexie', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    // Soft-delete the condition
    await useDiagnosisStore.getState().removeDiagnosis(condition.id)

    // Add a new active one
    await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'secondary')

    // Clear in-memory state
    useDiagnosisStore.getState().clearPhiState()
    expect(useDiagnosisStore.getState().conditions).toHaveLength(0)

    // Reload from Dexie — only active conditions should appear
    await useDiagnosisStore.getState().loadConditions(encounterId)
    expect(useDiagnosisStore.getState().conditions).toHaveLength(1)
    expect(
      useDiagnosisStore.getState().conditions[0].clinicalStatus.coding[0].code,
    ).toBe('active')
  })

  it('clearPhiState resets conditions array', async () => {
    await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    useDiagnosisStore.getState().clearPhiState()
    expect(useDiagnosisStore.getState().conditions).toEqual([])
    expect(useDiagnosisStore.getState().isSaving).toBe(false)
  })

  it('increments versionId on rank update', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    expect(condition.meta.versionId).toBe('1')

    await useDiagnosisStore.getState().updateRank(condition.id, 'secondary')

    const updated = useDiagnosisStore.getState().conditions[0]
    expect(updated.meta.versionId).toBe('2')
  })

  it('enqueues removeDiagnosis with a fresh HLC strictly newer than the create (syncs the deactivation)', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')
    const createHlc = condition._ultranos.hlcTimestamp

    await useDiagnosisStore.getState().removeDiagnosis(condition.id)

    const entry = await pendingEntry(condition.id)
    expect(entry.action).toBe('update')
    expect(compareHlc(deserializeHlc(entry.hlcTimestamp), deserializeHlc(createHlc))).toBeGreaterThan(0)
  })

  it('enqueues updateRank with a fresh HLC strictly newer than the create', async () => {
    const condition = await useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')
    const createHlc = condition._ultranos.hlcTimestamp

    await useDiagnosisStore.getState().updateRank(condition.id, 'secondary')

    const entry = await pendingEntry(condition.id)
    expect(entry.action).toBe('update')
    expect(compareHlc(deserializeHlc(entry.hlcTimestamp), deserializeHlc(createHlc))).toBeGreaterThan(0)
  })

  it('throws when no auth session exists', async () => {
    const mod = await import('@/stores/auth-session-store')
    const original = mod.useAuthSessionStore.getState
    try {
      mod.useAuthSessionStore.getState = () => ({
        ...original(),
        getPractitionerRef: () => { throw new Error('No authenticated session') },
      })

      await expect(
        useDiagnosisStore
          .getState()
          .addDiagnosis(testItem, encounterId, patientId, 'primary'),
      ).rejects.toThrow('No authenticated session')
    } finally {
      mod.useAuthSessionStore.getState = original
    }
  })

  it('rejects concurrent addDiagnosis calls', async () => {
    const promise1 = useDiagnosisStore
      .getState()
      .addDiagnosis(testItem, encounterId, patientId, 'primary')

    await expect(
      useDiagnosisStore
        .getState()
        .addDiagnosis(testItem, encounterId, patientId, 'secondary'),
    ).rejects.toThrow('already in progress')

    await promise1
  })
})
